import { signal, batch, lens } from '@rhi-zone/rainbow'
import type { Signal, Lens } from '@rhi-zone/rainbow'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The parsed query-string state. A key appearing once is a `string`; a key
 * appearing multiple times (`?k=a&k=b`) is a `string[]`.
 */
export type UrlSearchParamsRecord = Record<string, string | string[]>

/** Which part of the URL the params live in. */
export type UrlSearchParamsMode = 'history' | 'hash'

/** Options for {@link useUrlSearchParams}. */
export type UrlSearchParamsOptions = {
  /**
   * `history` (default) syncs `window.location.search`; `hash` syncs the
   * query portion of `window.location.hash`.
   */
  mode?: UrlSearchParamsMode
  /**
   * When `true` (default), writes use `history.replaceState` — sensible for
   * filter churn where each keystroke should not push a back-button entry.
   * When `false`, writes use `history.pushState`.
   */
  replace?: boolean
  /**
   * Window to bind to. Defaults to the ambient `window`. Pass `null` (or run
   * where `window` is absent) for an SSR-safe inert signal that performs no
   * I/O and registers no listeners.
   */
  window?: Window | null
}

/**
 * A reactive query-string Signal with a `destroy()` to release its listener.
 *
 * It is a `Signal<UrlSearchParamsRecord>`, usable directly with `.get()`,
 * `.set()`, `.subscribe()`, `.map()`, `.focus()`. The extra `destroy` mirrors
 * the router's cleanup contract.
 */
export type UrlSearchParamsSignal = Signal<UrlSearchParamsRecord> & {
  /** Remove the popstate/hashchange listener. Call when unmounting. */
  destroy(): void
}

// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------

/** Parse a `URLSearchParams` into a record, collapsing single keys to scalars. */
function parse(sp: URLSearchParams): UrlSearchParamsRecord {
  const out: UrlSearchParamsRecord = {}
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key)
    out[key] = all.length > 1 ? all : (all[0] ?? '')
  }
  return out
}

/** Serialize a record back into a sorted, stable query string (no leading `?`). */
function serialize(record: UrlSearchParamsRecord): string {
  const sp = new URLSearchParams()
  for (const key of Object.keys(record).sort()) {
    const value = record[key]
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v)
    } else {
      sp.append(key, value)
    }
  }
  return sp.toString()
}

/** Read the current query string out of the URL for the given mode. */
function readQuery(win: Window, mode: UrlSearchParamsMode): string {
  if (mode === 'hash') {
    const hash = win.location.hash
    const q = hash.indexOf('?')
    return q === -1 ? '' : hash.slice(q + 1)
  }
  return win.location.search.replace(/^\?/, '')
}

/** Build the next `href` for the given mode, replacing only the query portion. */
function writeHref(win: Window, mode: UrlSearchParamsMode, query: string): string {
  const url = new URL(win.location.href)
  if (mode === 'hash') {
    // Preserve any path-like fragment before the `?` in the hash.
    const raw = url.hash.replace(/^#/, '')
    const base = raw.split('?', 1)[0] ?? ''
    url.hash = query ? `${base}?${query}` : base
  } else {
    url.search = query ? `?${query}` : ''
  }
  return url.href
}

// ---------------------------------------------------------------------------
// useUrlSearchParams
// ---------------------------------------------------------------------------

/**
 * Create a `Signal` two-way bound to the URL's query string.
 *
 * - Initialized from the current URL.
 * - `.set(record)` serializes and writes history (`replaceState` by default,
 *   `pushState` when `replace: false`), then notifies subscribers.
 * - A `popstate` (history mode) or `hashchange` (hash mode) listener parses the
 *   new URL back into the signal, so browser back/forward and external
 *   navigation update it.
 * - Repeated params (`?k=a&k=b`) round-trip as `string[]`.
 * - SSR / no-window safe: with no `window`, returns an inert signal seeded
 *   empty that performs no I/O and registers no listener.
 *
 * Mirrors the router's idioms: a root `signal()` as the source of truth, a
 * single bound listener, `batch()` around the URL→signal update, and a
 * `destroy()` for listener cleanup.
 *
 * @example
 * ```ts
 * const params = useUrlSearchParams()           // history mode, replace
 * params.get()                                  // { q: 'shoes', tag: ['a','b'] }
 * params.set({ q: 'boots' })                    // -> ?q=boots in the address bar
 * const q = useUrlSearchParam(params, 'q')      // focused single-key Signal
 * // ...
 * params.destroy()                              // on unmount
 * ```
 */
export function useUrlSearchParams(
  options: UrlSearchParamsOptions = {},
): UrlSearchParamsSignal {
  const mode: UrlSearchParamsMode = options.mode ?? 'history'
  const replace = options.replace ?? true
  const win =
    options.window !== undefined
      ? options.window
      : typeof window !== 'undefined'
        ? window
        : null

  // SSR / no-window: an inert signal with the same surface, no I/O.
  if (win === null) {
    const inert = signal<UrlSearchParamsRecord>({}) as UrlSearchParamsSignal
    inert.destroy = () => {}
    return inert
  }

  const eventName = mode === 'hash' ? 'hashchange' : 'popstate'

  const root = signal<UrlSearchParamsRecord>(parse(new URLSearchParams(readQuery(win, mode))))

  // Guard so our own history writes don't re-enter via the event listener.
  let writing = false

  const onUrlChange = (): void => {
    if (writing) return
    batch(() => {
      root.set(parse(new URLSearchParams(readQuery(win, mode))))
    })
  }

  win.addEventListener(eventName, onUrlChange)

  // Intercept writes: serialize → history, then propagate to subscribers.
  const baseSet = root.set.bind(root)
  const set = (record: UrlSearchParamsRecord): void => {
    const query = serialize(record)
    if (query === readQuery(win, mode)) {
      // URL already matches — still update the signal value (e.g. array vs
      // scalar normalization) without touching history.
      baseSet(record)
      return
    }
    const href = writeHref(win, mode, query)
    writing = true
    try {
      if (replace) win.history.replaceState(win.history.state, '', href)
      else win.history.pushState(win.history.state, '', href)
    } finally {
      writing = false
    }
    baseSet(record)
  }

  const bound = root as UrlSearchParamsSignal
  bound.set = set
  bound.destroy = () => {
    win.removeEventListener(eventName, onUrlChange)
  }
  return bound
}

// ---------------------------------------------------------------------------
// useUrlSearchParam — focused single key
// ---------------------------------------------------------------------------

/** Lens from the params record onto a single key, as a (possibly empty) string. */
function keyLens(key: string): Lens<UrlSearchParamsRecord, string> {
  return lens(
    (record) => {
      const v = record[key]
      return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
    },
    (value, record) => {
      if (value === '') {
        if (!(key in record)) return record
        const next = { ...record }
        delete next[key]
        return next
      }
      return { ...record, [key]: value }
    },
  )
}

/**
 * Focus a single query-string key as its own read-write `Signal<string>`.
 *
 * A thin lens-focus over {@link useUrlSearchParams}: reads the first value for
 * `key` (`''` when absent), and writing `''` removes the key. Writes flow back
 * through the parent's URL-syncing `set`, so the address bar stays in sync.
 *
 * @example
 * ```ts
 * const params = useUrlSearchParams()
 * const q = useUrlSearchParam(params, 'q')
 * q.set('boots')   // -> ?q=boots ; params.get() === { q: 'boots' }
 * q.set('')        // -> removes q
 * ```
 */
export function useUrlSearchParam(
  params: Signal<UrlSearchParamsRecord>,
  key: string,
): Signal<string> {
  return params.focus(keyLens(key))
}
