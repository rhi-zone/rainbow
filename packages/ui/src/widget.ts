/**
 * @rhi-zone/rainbow-ui/widget
 *
 * Algebraic widget combinators for rainbow signals.
 *
 *   Widget<T, E> = (signal: Signal<T>) => E
 *
 * A widget is a pure function from a reactive signal to a typed DOM node.
 * The second type parameter E (defaults to FlowContent) tracks what kind of
 * element the widget produces, so the HTML content model flows through
 * composition and invalid nesting is a type error.
 *
 * The seven combinators:
 *   focus    — zoom into a product field via a Lens
 *   narrow   — zoom into a sum variant via a Prism; renders nothing when unmatched
 *   each     — render a list; re-renders on length change, item signals handle diffs
 *   beside   — pair two widgets side by side; state is the product [A, B]
 *   above    — pair two widgets vertically; state is the product [A, B]
 *   dynamic  — pair local state S with an external signal A via stateful()
 *   map      — reinterpret the signal type via a total Prism (iso)
 *   show     — boolean gate; renders nothing when predicate is false
 *   concat   — combine two list widgets over the same signal
 *
 * Lifecycle / cleanup:
 *   All subscriptions created inside a widget call are tracked via a
 *   thread-local (synchronous) context. mount() collects them and returns
 *   a single cleanup function that unsubscribes everything.
 *
 *   Combinators that conditionally render (narrow, show) manage inner cleanup
 *   themselves: they tear down child subscriptions when the condition becomes
 *   false and rebuild them when it becomes true again.
 */

import {
  type Signal,
  type ReadonlySignal,
  type Lens,
  type Prism,
  type AsyncData,
  signal as _signal,
  lens,
  index,
  stateful,
} from "@rhi-zone/rainbow"
import {
  input as _input,
  textarea as _textarea,
  select as _select,
  option as _option,
} from "./html.js"
import type {
  AnyEl, El, FlowContent, DivEl,
  InputEl, InputAttrs,
  TextareaEl, TextareaAttrs,
  SelectEl, SelectAttrs,
} from "./html.js"

// ── Widget type ───────────────────────────────────────────────────────────────

/**
 * A widget is a pure function from a reactive signal to a typed DOM node.
 * Calling a widget subscribes it to the signal; the returned node is updated
 * in place whenever the signal changes.
 *
 * @typeParam T - The signal value type
 * @typeParam E - The element type produced (defaults to FlowContent)
 */
export type Widget<T, E extends AnyEl = FlowContent> = (signal: Signal<T> | ReadonlySignal<T>) => E

// ── Cleanup context ───────────────────────────────────────────────────────────

// Synchronous (single-threaded JS) stack of cleanup registries.
// Each entry is the active list for the currently executing widget call.
let _active: (() => void)[] | null = null

/** Register a cleanup function in the current widget call context. */
function _register(fn: () => void): void {
  _active?.push(fn)
}

/**
 * Run `fn` in a tracked context. Returns the result and a cleanup function
 * that calls all cleanups registered during `fn`.
 */
function _track<T>(fn: () => T): [T, () => void] {
  const prev = _active
  const list: (() => void)[] = []
  _active = list
  const result = fn()
  _active = prev
  return [result, () => { for (const f of list) f() }]
}

/**
 * Run `fn` in an explicit cleanup scope. Returns the result and a dispose
 * function. Use at the top level (bootstrap, app root) where there is no
 * enclosing widget context for `register()` calls to land in.
 *
 * @example
 * const [, disposeApp] = withScope(() => {
 *   register(disposeInit)
 *   renderContactList(sidebar)
 *   renderDetailPanel(detail)
 * })
 */
export function withScope<T>(fn: () => T): [T, () => void] {
  return _track(fn)
}

/** Minimal interface satisfied by both Signal<T> and ReadonlySignal<T>. */
type Subscribable<T> = Pick<Signal<T> | ReadonlySignal<T>, "subscribe">

/**
 * Subscribe to a signal (or readonly signal) and register the unsubscribe in
 * the current context. Must be called during a widget call (directly or via a
 * combinator).
 */
export function subscribe<T>(s: Subscribable<T>, fn: (value: T) => void): void {
  _register(s.subscribe(fn))
}

/**
 * Register an arbitrary cleanup function in the current widget call context.
 * Called on unmount alongside subscription cleanups. Use for event listeners,
 * timers, or `fromAsync` dispose functions.
 *
 * @example
 * const [data, dispose] = fromAsync(querySignal, fetch)
 * register(dispose)
 */
export function register(fn: () => void): void {
  _register(fn)
}

// ── mount ─────────────────────────────────────────────────────────────────────

/**
 * Render a widget into a container and return a cleanup function.
 * The cleanup removes the rendered node and unsubscribes all signals.
 *
 * @example
 * const cleanup = mount(counterWidget, countSignal, document.getElementById('root')!)
 * // later:
 * cleanup()
 */
export function mount<T, E extends AnyEl>(
  widget: Widget<T, E>,
  signal: Signal<T> | ReadonlySignal<T>,
  container: HTMLElement,
): () => void {
  const [el, cleanup] = _track(() => widget(signal))
  container.appendChild(el.node)
  return () => {
    el.node.remove()
    cleanup()
  }
}

// ── Optics combinators ────────────────────────────────────────────────────────

/**
 * Zoom into a product field. The child widget operates on `B`; the parent
 * signal carries `A`. Reads and writes pass through the lens.
 *
 * @example
 * // Widget<CompareExpr> that only sees the 'op' field
 * focus(opPicker, field('op'))
 */
export function focus<A, B, E extends AnyEl>(
  w: Widget<B, E>,
  l: Lens<A, B>,
): Widget<A, E> {
  return (s) => w((s as Signal<A>).focus(l))
}

/**
 * Zoom into a sum variant. The child widget renders when the prism matches;
 * renders an empty container when it doesn't. Container switches on match
 * status changes; in-variant updates are handled by the child's own signal.
 *
 * @example
 * narrow(compareWidget, comparePrism)  // Widget<Expr>: visible only for compare nodes
 */
export function narrow<A, B>(
  w: Widget<B, FlowContent>,
  prism: Prism<A, B>,
): Widget<A, DivEl> {
  return (s) => {
    const node = document.createElement("div")
    node.dataset["narrow"] = ""

    let innerCleanup: (() => void) | null = null
    // narrowed is created when the prism first matches and destroyed when it stops.
    // We delay creation so that subscribe(s, update) is registered on `s` BEFORE
    // narrowed (and thus its own subscription to `s`) exists. This guarantees that
    // `update` fires ahead of any derived signals, letting us clean up child
    // subscriptions before they receive an undefined value.
    let narrowed: Signal<B | undefined> | null = null
    const ws = s as Signal<A>

    const render = () => {
      narrowed = ws.narrow(prism)
      const [child, cleanup] = _track(() => w(narrowed! as Signal<B>))
      innerCleanup = cleanup
      node.appendChild(child.node)
    }

    const update = (a: A) => {
      const matched = prism.match(a)
      if (matched !== undefined && innerCleanup === null) {
        render()
      } else if (matched === undefined && innerCleanup !== null) {
        innerCleanup()
        innerCleanup = null
        narrowed = null
        node.replaceChildren()
      }
      // Variant unchanged → child's own subscriptions handle the update
    }

    // Register on `s` FIRST — before narrowed is created — so `update` fires
    // before narrowed's own change propagation reaches child subscriptions.
    subscribe(s, update)

    // Initial render (if prism matches right away)
    if (prism.match(s.get()) !== undefined) render()

    _register(() => innerCleanup?.())
    return { _tag: "div", node }
  }
}

/**
 * Render a list. Each item gets a focused signal via an index lens. Fully
 * re-renders on length change; per-item updates are handled by each item
 * signal (no explicit keying yet — that is a future optimisation).
 *
 * @example
 * each(rowWidget)  // Widget<Row[]>
 */
export function each<A>(w: Widget<A, FlowContent>): Widget<A[], DivEl> {
  return (listSignal) => {
    const wListSignal = listSignal as Signal<A[]>
    const node = document.createElement("div")
    node.dataset["each"] = ""

    let itemCleanups: (() => void)[] = []

    const renderAll = (items: A[]) => {
      for (const c of itemCleanups) c()
      itemCleanups = []
      node.replaceChildren()

      for (let i = 0; i < items.length; i++) {
        const idx = i
        const itemLens: Lens<A[], A> = lens(
          (arr) => arr[idx]!,
          (arr, v) => { const copy = [...arr]; copy[idx] = v; return copy },
        )
        const itemSignal = wListSignal.focus(itemLens)
        const [child, cleanup] = _track(() => w(itemSignal))
        itemCleanups.push(cleanup)
        node.appendChild(child.node)
      }
    }

    renderAll(listSignal.get())
    // Re-render only when length changes. Per-item value updates are handled
    // by each item's focused signal — no full teardown needed for those.
    const lengthSignal = listSignal.map((arr) => arr.length)
    subscribe(lengthSignal, () => renderAll(listSignal.get()))
    _register(() => { for (const c of itemCleanups) c() })

    return { _tag: "div", node }
  }
}

// ── Layout combinators ────────────────────────────────────────────────────────

/**
 * Render two widgets side by side. The combined signal is the product [A, B].
 * Layout (flex/grid) is the caller's responsibility via CSS.
 *
 * @example
 * beside(focus(opPicker, field('op')), focus(exprWidget, field('left')))
 */
export function beside<A, B>(
  wa: Widget<A, FlowContent>,
  wb: Widget<B, FlowContent>,
): Widget<[A, B], DivEl> {
  return (s) => {
    const ws = s as Signal<[A, B]>
    const node = document.createElement("div")
    node.dataset["beside"] = ""
    const sa = ws.focus(index(0))
    const sb = ws.focus(index(1))
    const [ca, cleanupA] = _track(() => wa(sa))
    const [cb, cleanupB] = _track(() => wb(sb))
    node.appendChild(ca.node)
    node.appendChild(cb.node)
    _register(cleanupA)
    _register(cleanupB)
    return { _tag: "div", node }
  }
}

/**
 * Render two widgets stacked vertically. The combined signal is the product [A, B].
 *
 * @example
 * above(labelWidget, inputWidget)
 */
export function above<A, B>(
  wa: Widget<A, FlowContent>,
  wb: Widget<B, FlowContent>,
): Widget<[A, B], DivEl> {
  return (s) => {
    const ws = s as Signal<[A, B]>
    const node = document.createElement("div")
    node.dataset["above"] = ""
    const sa = ws.focus(index(0))
    const sb = ws.focus(index(1))
    const [ca, cleanupA] = _track(() => wa(sa))
    const [cb, cleanupB] = _track(() => wb(sb))
    node.appendChild(ca.node)
    node.appendChild(cb.node)
    _register(cleanupA)
    _register(cleanupB)
    return { _tag: "div", node }
  }
}

// ── State combinator ──────────────────────────────────────────────────────────

/**
 * Pair local state `S` with an external signal `A`. The child widget sees the
 * product `[S, A]`. Local state changes do not propagate to the parent.
 *
 * Implemented via rainbow's `stateful(init, outer)`.
 *
 * @example
 * // Combobox with open/closed state independent of the value signal
 * dynamic(false, comboboxWidget)  // Widget<Value>
 */
export function dynamic<S, A, E extends AnyEl>(
  init: S,
  w: Widget<[S, A], E>,
): Widget<A, E> {
  return (outer) => {
    const combined = stateful(init, outer) // Signal<[S, A]>
    return w(combined)
  }
}

// ── Transform combinator ──────────────────────────────────────────────────────

/**
 * Reinterpret the widget's value type via a total prism (isomorphism).
 * The prism must be a bijection: `match` must always return a value.
 *
 * Useful for display transforms such as number ↔ string for text inputs.
 *
 * @example
 * const numToStr = iso((n: number) => String(n), (s) => Number(s))
 * map(numberWidget, numToStr)  // Widget<string>
 */
export function map<A, B, E extends AnyEl>(
  w: Widget<A, E>,
  isoP: Prism<B, A>,
): Widget<B, E> {
  return (s) => {
    // isoP is a total bijection — narrow is always defined
    const mapped = (s as Signal<B>).narrow(isoP) as unknown as Signal<A>
    return w(mapped)
  }
}

// ── Conditional combinator ────────────────────────────────────────────────────

/**
 * Boolean gate. Renders the child widget when `predicate` holds; renders an
 * empty container otherwise. Simpler than `narrow` when there is no Prism —
 * just a boolean condition. SolidJS `<Show>` is the prior art.
 *
 * @example
 * show(detailsWidget, (form) => form.advanced)
 */
/**
 * Boolean gate. Renders the child widget when `predicate` holds; hides it
 * (via `display:none`) otherwise. Simpler than `narrow` when there is no
 * Prism — just a boolean condition. SolidJS `<Show>` is the prior art.
 *
 * The child is rendered **eagerly** and kept alive in the DOM. Toggling
 * visibility is a single style-property write — no DOM teardown/rebuild, no
 * GC pressure, and subscriptions remain active so the child stays current
 * while hidden (showing is instant, no catch-up render required).
 *
 * @example
 * show(detailsWidget, (form) => form.advanced)
 */
export function show<A>(
  w: Widget<A, FlowContent>,
  predicate: (a: A) => boolean,
): Widget<A, DivEl> {
  return (s) => {
    const node = document.createElement("div")
    node.dataset["show"] = ""

    const [child, cleanup] = _track(() => w(s))
    node.appendChild(child.node)
    _register(cleanup)

    const applyVisibility = (v: A) => {
      node.style.display = predicate(v) ? "" : "none"
    }
    applyVisibility(s.get())
    subscribe(s, applyVisibility)

    return { _tag: "div", node }
  }
}

// ── Concat combinator ─────────────────────────────────────────────────────────

/**
 * Append two list widgets over the same signal. Both widgets see the full
 * list; use `show`/`narrow`/filtering inside each to render different subsets.
 * Corresponds to unicorn's concat combinator.
 *
 * @example
 * // Active rows, then archived rows, in the same <tbody>
 * concat(
 *   each(show(rowWidget, r => r.active)),
 *   each(show(rowWidget, r => !r.active))
 * )
 */
export function concat<A>(
  wa: Widget<A[], DivEl>,
  wb: Widget<A[], DivEl>,
): Widget<A[], DivEl> {
  return (s) => {
    const node = document.createElement("div")
    node.dataset["concat"] = ""
    const [ca, cleanupA] = _track(() => wa(s))
    const [cb, cleanupB] = _track(() => wb(s))
    node.appendChild(ca.node)
    node.appendChild(cb.node)
    _register(cleanupA)
    _register(cleanupB)
    return { _tag: "div", node }
  }
}

// ── Stack combinator ──────────────────────────────────────────────────────────

/**
 * Render N widgets all receiving the same signal, stacked into one container.
 * The same-signal variant of `above` — no product type required.
 *
 * Primary use case: form fields that all operate on `FormState<T>`.
 *
 * @example
 * stack(formField("name", inputWidget()), formField("email", inputWidget()))
 */
export function stack<A>(...widgets: Widget<A, FlowContent>[]): Widget<A, DivEl> {
  return (s) => {
    const node = document.createElement("div")
    node.dataset["stack"] = ""
    for (const w of widgets) {
      const [el, cleanup] = _track(() => w(s))
      node.appendChild(el.node)
      _register(cleanup)
    }
    return { _tag: "div", node }
  }
}

// ── Template combinator ───────────────────────────────────────────────────────

/**
 * Maps a `refs` dict `{ refName: tagName }` to a typed El map:
 *   `{ refName: El<tagName, HTMLElementTagNameMap[tagName]> }`
 */
export type RefsMap<R extends Record<string, keyof HTMLElementTagNameMap>> = {
  readonly [K in keyof R]: El<R[K] & string, HTMLElementTagNameMap[R[K]]>
}

/**
 * Template combinator. Parses `innerHTML` once (at definition time), then for
 * each widget instantiation clones the template, queries out typed DOM refs via
 * `data-ref` attributes, and calls `bind` with the signal and those refs.
 *
 * Refs are queried as `tagName[data-ref="refName"]`, so `{ name: "span" }`
 * expects `<span data-ref="name">` in the template. Using `data-ref` rather
 * than `id` means the same template can be cloned many times (e.g. inside
 * `eachKeyed`) without duplicate-ID issues.
 *
 * `bind` is called inside the widget call context, so any `subscribe` calls
 * inside it are tracked and cleaned up by `mount` / parent combinators.
 *
 * @throws if a declared ref is absent from the cloned template.
 *
 * @example
 * const cardWidget = template(
 *   `<div class="card"><span data-ref="name"></span><b data-ref="score"></b></div>`,
 *   { name: "span", score: "b" } as const,
 *   (s, { name, score }) => {
 *     name.node.textContent = s.get().label
 *     score.node.textContent = String(s.get().value)
 *     subscribe(s, v => {
 *       name.node.textContent = v.label
 *       score.node.textContent = String(v.value)
 *     })
 *   }
 * )
 */
export function template<const R extends Record<string, keyof HTMLElementTagNameMap>, T>(
  innerHTML: string,
  refs: R,
  bind: (signal: Signal<T>, refs: RefsMap<R>) => void,
): Widget<T, DivEl> {
  const template = document.createElement("template")
  template.innerHTML = innerHTML

  return (s) => {
    const node = document.createElement("div")
    node.dataset["templ"] = ""
    node.appendChild(template.content.cloneNode(true))

    const queriedRefs = {} as Record<string, unknown>
    for (const refName of Object.keys(refs)) {
      const tagName = refs[refName]!
      const el = node.querySelector(`${tagName}[data-ref="${refName}"]`)
      if (el === null) {
        throw new Error(
          `templ: ref "${refName}" not found — expected <${tagName} data-ref="${refName}"> in template`,
        )
      }
      queriedRefs[refName] = { _tag: tagName, node: el }
    }

    bind(s as Signal<T>, queriedRefs as RefsMap<R>)

    return { _tag: "div", node }
  }
}

// ── Keyed list combinator ─────────────────────────────────────────────────────

/** Internal entry kept per key in eachKeyed's cache. */
type KeyEntry<A> = {
  /** The item's own mutable signal cell. */
  readonly itemSignal: Signal<A>
  /** The DOM node produced by the item widget. Used for reordering. */
  readonly childNode: ChildNode
  /** Unsubscribes widget internals + write-back listener. */
  readonly cleanup: () => void
  /** Sets itemSignal without triggering the write-back subscriber. */
  readonly setFromParent: (v: A) => void
}

/**
 * Render a keyed list. Each item gets a stable Signal<T> for its lifetime —
 * only added/removed items trigger mount/unmount. Reordering and in-place
 * updates are handled without remounting.
 *
 * Write-back: if an item widget sets its signal (e.g. an editable field),
 * the change propagates back to the parent list signal at the item's current
 * key position — but only when `s` is a writable Signal (has a `set` method).
 * A flag prevents the resulting list update from cycling back.
 *
 * GC note: O(n) `Object.is` comparisons per list update (to sync item
 * signals), but O(new keys) DOM/signal allocations. Stable lists are cheap.
 *
 * @param s       - Signal carrying the full array
 * @param getKey  - Stable key function (like React's `key` prop)
 * @param widget  - Widget factory receiving a per-item Signal<T>
 * @param options - Optional container tag (default "div"); pass a specific
 *                  HTML tag to fix CSS grid/flex layout issues that arise
 *                  from an extra wrapper div.
 *
 * @example
 * eachKeyed(todosSignal, t => t.id, todoWidget)
 * eachKeyed(rowsSignal, r => r.id, rowWidget, { container: "ul" })
 */
export function eachKeyed<T>(
  s: Signal<T[]> | ReadonlySignal<T[]>,
  getKey: (item: T) => string,
  widget: (itemSignal: Signal<T>) => AnyEl,
  options?: { container?: keyof HTMLElementTagNameMap },
): El<keyof HTMLElementTagNameMap, HTMLElement> {
  const tag = options?.container ?? "div"
  const node = document.createElement(tag)
  node.dataset["eachKeyed"] = ""

  const cache = new Map<string, KeyEntry<T>>()

  const makeEntry = (k: string, item: T): KeyEntry<T> => {
    const itemSignal = _signal(item)
    let fromParent = false

    // Write-back: item widget writes → find current index by key → update list.
    // Skipped when the update originated from the parent (fromParent flag).
    // Only wired when the parent signal is writable (has a `set` method).
    let writeBackUnsub: () => void = () => {}
    if ('set' in s) {
      writeBackUnsub = itemSignal.subscribe((v) => {
        if (fromParent) return
        const list = s.get()
        const idx = list.findIndex((a) => getKey(a) === k)
        if (idx !== -1 && !Object.is(list[idx], v)) {
          const copy = [...list]
          copy[idx] = v
          ;(s as Signal<T[]>).set(copy)
        }
      })
    }

    const [child, widgetCleanup] = _track(() => widget(itemSignal))

    return {
      itemSignal,
      childNode: child.node,
      cleanup: () => { widgetCleanup(); writeBackUnsub() },
      setFromParent: (v) => {
        fromParent = true
        itemSignal.set(v)
        fromParent = false
      },
    }
  }

  const update = (items: T[]) => {
    const nextKeys = items.map(getKey)
    const nextSet = new Set(nextKeys)

    // 1. Remove keys no longer present
    for (const [k, entry] of cache) {
      if (!nextSet.has(k)) {
        entry.cleanup()
        entry.childNode.parentNode?.removeChild(entry.childNode)
        cache.delete(k)
      }
    }

    // 2. Create entries for new keys; sync values for existing ones
    for (let i = 0; i < items.length; i++) {
      const k = nextKeys[i]!
      const item = items[i]!
      if (!cache.has(k)) {
        cache.set(k, makeEntry(k, item))
      } else {
        // O(1) no-op if value unchanged (signal.set deduplicates via Object.is)
        cache.get(k)!.setFromParent(item)
      }
    }

    // 3. Reorder DOM nodes to match new order (insert in reverse, O(n)).
    // Check parentNode too: new entries aren't in the container yet, so their
    // nextSibling is null regardless of position — always insert them.
    let ref: ChildNode | null = null
    for (let i = items.length - 1; i >= 0; i--) {
      const entry = cache.get(nextKeys[i]!)!
      if (entry.childNode.parentNode !== node || entry.childNode.nextSibling !== ref) {
        node.insertBefore(entry.childNode, ref)
      }
      ref = entry.childNode
    }
  }

  update(s.get())
  subscribe(s, update)
  _register(() => { for (const entry of cache.values()) entry.cleanup() })

  return { _tag: tag, node }
}

// ── Event helper ──────────────────────────────────────────────────────────────

/**
 * Attach a typed event listener and register its removal as cleanup.
 * Must be called during a widget call context (directly or via a combinator).
 *
 * @example
 * on(buttonEl.node, "click", () => s.set(s.get() + 1))
 */
export function on<K extends keyof HTMLElementEventMap>(
  el: EventTarget,
  event: K,
  fn: (e: HTMLElementEventMap[K]) => void,
): void {
  const handler = fn as unknown as EventListener
  el.addEventListener(event, handler)
  _register(() => el.removeEventListener(event, handler))
}

// ── Form binding helpers ──────────────────────────────────────────────────────

/**
 * Two-way bind a text `<input>` or `<textarea>` to a `Signal<string>`.
 *
 * Sets `el.value` immediately from the signal, then:
 * - DOM → signal: `input` event calls `s.set(el.value)`
 * - signal → DOM: updates `el.value` only when the new value differs
 *   (guards against cursor-position jumps on mid-type updates)
 *
 * When called inside a widget call context, cleanup is registered
 * automatically. When called outside (e.g. imperative bootstrap), use the
 * returned cleanup function.
 *
 * @returns A cleanup function that unsubscribes and removes the event listener.
 */
export function bindInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  s: Signal<string>,
): () => void {
  el.value = s.get()
  const handler = () => s.set(el.value)
  el.addEventListener("input", handler)
  const unsub = s.subscribe((v) => { if (el.value !== v) el.value = v })
  const cleanup = () => {
    el.removeEventListener("input", handler)
    unsub()
  }
  _register(cleanup)
  return cleanup
}

/**
 * Two-way bind a `<select>` to a `Signal<string>`.
 * DOM → signal on `change` event; signal → DOM when value differs.
 *
 * Must be called during a widget call context.
 */
export function bindSelect(el: HTMLSelectElement, s: Signal<string>): void {
  on(el, "change", () => s.set(el.value))
  subscribe(s, (v) => { if (el.value !== v) el.value = v })
}

/**
 * Two-way bind a checkbox `<input>` to a `Signal<boolean>`.
 * DOM → signal on `change` event; signal → DOM when checked state differs.
 *
 * Must be called during a widget call context.
 */
export function bindCheckbox(el: HTMLInputElement, s: Signal<boolean>): void {
  on(el, "change", () => s.set(el.checked))
  subscribe(s, (v) => { if (el.checked !== v) el.checked = v })
}

// ── Reactive binding helpers ──────────────────────────────────────────────────

/**
 * Run `fn` immediately with the current signal value, then subscribe to future
 * changes. Registers the subscription cleanup in the current widget context.
 *
 * Eliminates the `fn(s.get()); subscribe(s, fn)` boilerplate in template bind
 * callbacks.
 *
 * Must be called during a widget call context.
 */
export function subscribeNow<T>(s: Signal<T> | ReadonlySignal<T>, fn: (v: T) => void): void {
  fn(s.get())
  _register(s.subscribe(fn))
}

/**
 * Reactively set `el.textContent` to the value of `s`. Sets the initial value
 * synchronously, then subscribes for future changes.
 *
 * Must be called during a widget call context.
 *
 * @example
 * bindText(nameSpan.node, nameSignal)
 */
export function bindText(
  el: { textContent: string | null },
  s: Signal<string> | ReadonlySignal<string>,
): void {
  el.textContent = s.get()
  _register(s.subscribe((v) => { el.textContent = v }))
}

/**
 * Reactively set an attribute on `el` to the value of `s`. Sets the initial
 * value synchronously, then subscribes for future changes.
 *
 * Must be called during a widget call context.
 *
 * @example
 * bindAttr(imgEl.node, "src", urlSignal)
 */
export function bindAttr(
  el: Element,
  attr: string,
  s: Signal<string> | ReadonlySignal<string>,
): void {
  el.setAttribute(attr, s.get())
  _register(s.subscribe((v) => { el.setAttribute(attr, v) }))
}

/**
 * Reactively toggle a CSS class on `el` based on the boolean value of `s`.
 * Sets the initial state synchronously, then subscribes for future changes.
 *
 * Must be called during a widget call context.
 *
 * @example
 * bindClass(rowEl.node, "selected", isSelectedSignal)
 */
export function bindClass(
  el: Element,
  className: string,
  s: Signal<boolean> | ReadonlySignal<boolean>,
): void {
  el.classList.toggle(className, s.get())
  _register(s.subscribe((v) => { el.classList.toggle(className, v) }))
}

/**
 * Subscribe to multiple signals and run `fn` whenever any of them changes.
 * Calls `fn()` immediately on invocation, then re-runs on each change.
 * Returns a cleanup function that unsubscribes from all signals.
 *
 * Replaces the repetitive `subscribe(a, fn); subscribe(b, fn); fn()` pattern
 * when a single side-effectful function depends on N signals.
 *
 * @example
 * const stop = watchAll([contacts, panel, searchQuery, sortBy], renderList)
 * // later:
 * stop()
 */
export function watchAll(
  signals: ReadonlyArray<ReadonlySignal<unknown>>,
  fn: () => void,
): () => void {
  fn()
  const unsubs = signals.map((s) => s.subscribe(fn))
  return () => { for (const u of unsubs) u() }
}

/**
 * Show or hide `el` (via `style.display`) based on the boolean signal `s`.
 * Sets `display` to `""` when `s` is true, `"none"` when false.
 * Applies the initial value synchronously on call.
 * Returns a cleanup function that unsubscribes the signal.
 *
 * Use `signal.map(...)` to derive the boolean from a richer signal:
 *
 * @example
 * const stop = bindShow(viewPanel, panel.map(p => p.mode === 'viewing'))
 * // later:
 * stop()
 */
export function bindShow(el: HTMLElement, s: ReadonlySignal<boolean>): () => void {
  el.style.display = s.get() ? "" : "none"
  return s.subscribe((v) => { el.style.display = v ? "" : "none" })
}

// ── AsyncData combinator ──────────────────────────────────────────────────────

/**
 * Reactively render one of four states of an `AsyncData` signal into a
 * container div. Each state maps to an optional render function; missing cases
 * render an empty div. Replaces the container's single child on every state
 * change.
 *
 * Modelled after `narrow` — manages inner cleanup when swapping states.
 * Must be called during a widget call context.
 *
 * @example
 * const container = foldWidget(asyncDataSignal, {
 *   notAsked: () => text("—"),
 *   loading:  () => text("Loading…"),
 *   failure:  (err) => text(String(err)),
 *   success:  (data) => renderData(data),
 * })
 */
export function foldWidget<T, E>(
  s: Signal<AsyncData<T, E>> | ReadonlySignal<AsyncData<T, E>>,
  cases: {
    notAsked?: () => AnyEl
    loading?: () => AnyEl
    failure?: (err: E) => AnyEl
    success?: (value: T) => AnyEl
  },
): DivEl {
  const node = document.createElement("div")
  node.dataset["foldWidget"] = ""

  let innerCleanup: (() => void) | null = null

  const render = (ad: AsyncData<T, E>) => {
    if (innerCleanup !== null) {
      innerCleanup()
      innerCleanup = null
    }
    node.replaceChildren()

    let renderFn: (() => AnyEl) | null = null
    switch (ad.status) {
      case 'notAsked': renderFn = cases.notAsked ?? null; break
      case 'loading':  renderFn = cases.loading  ?? null; break
      case 'failure':  renderFn = cases.failure  ? () => cases.failure!(ad.error)  : null; break
      case 'success':  renderFn = cases.success  ? () => cases.success!(ad.value)  : null; break
    }

    if (renderFn !== null) {
      let el: AnyEl
      ;[el, innerCleanup] = _track(renderFn)
      node.appendChild(el.node)
    }
  }

  render(s.get())
  _register(s.subscribe(render))
  _register(() => innerCleanup?.())

  return { _tag: "div", node }
}

// ── Pre-built form widgets ────────────────────────────────────────────────────

/**
 * Text input widget. The `value` attr is omitted from `attrs` — the signal
 * owns the value. Use `focus` to connect to a field on a larger signal.
 *
 * @example
 * focus(inputWidget({ placeholder: "Name" }), field("name"))
 */
export function inputWidget(attrs?: Omit<InputAttrs, "value">): Widget<string, InputEl> {
  return (s) => {
    const ws = s as Signal<string>
    const el = _input(attrs ?? {})
    el.node.value = ws.get()
    bindInput(el.node, ws)
    return el
  }
}

/**
 * Textarea widget. Signal owns the value.
 */
export function textareaWidget(attrs?: TextareaAttrs): Widget<string, TextareaEl> {
  return (s) => {
    const ws = s as Signal<string>
    const el = _textarea(attrs ?? {})
    el.node.value = ws.get()
    bindInput(el.node, ws)
    return el
  }
}

/**
 * Checkbox widget. Signal owns the checked state.
 */
export function checkboxWidget(attrs?: Omit<InputAttrs, "type" | "checked">): Widget<boolean, InputEl> {
  return (s) => {
    const ws = s as Signal<boolean>
    const el = _input({ ...attrs, type: "checkbox" })
    el.node.checked = ws.get()
    bindCheckbox(el.node, ws)
    return el
  }
}

/**
 * Number input widget. Signal owns the numeric value. NaN inputs are ignored
 * (the signal is only updated when the parsed value is a valid number).
 */
export function numberInputWidget(attrs?: Omit<InputAttrs, "value" | "type">): Widget<number, InputEl> {
  return (s) => {
    const ws = s as Signal<number>
    const el = _input({ ...attrs, type: "number" })
    el.node.value = String(ws.get())
    on(el.node, "input", () => {
      const n = el.node.valueAsNumber
      if (!isNaN(n)) ws.set(n)
    })
    subscribe(s, (v) => { if (el.node.valueAsNumber !== v) el.node.value = String(v) })
    return el
  }
}

/**
 * Select widget with a static options list. Signal owns the selected value.
 * For dynamic options, compose `each` + `focus` over a list signal instead.
 *
 * @example
 * selectWidget([{ value: "au", label: "Australia" }, { value: "nz", label: "New Zealand" }])
 */
export function selectWidget(
  options: { value: string; label: string }[],
  attrs?: SelectAttrs,
): Widget<string, SelectEl> {
  return (s) => {
    const ws = s as Signal<string>
    const el = _select(attrs ?? {}, ...(options.map((o) => _option({ value: o.value }, o.label))))
    el.node.value = ws.get()
    bindSelect(el.node, ws)
    return el
  }
}
