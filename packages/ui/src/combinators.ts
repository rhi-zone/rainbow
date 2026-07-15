/**
 * @rhi-zone/rainbow-ui/combinators
 *
 * Page-level combinators that compose the reactive primitives (Widget, Signal,
 * eachKeyed, r.*) up to page-level patterns: data fetching, mutations, tables,
 * tabbed views, and slide-out panels.
 *
 * Generic — no design-system or application imports. Renders semantic HTML;
 * the consuming app styles via CSS.
 */

import {
  type Signal,
  type ReadonlySignal,
  type AsyncData,
  signal as _signal,
  computed,
  loading,
  success,
  failure,
  some,
} from "@rhi-zone/rainbow"
import {
  type Widget,
  subscribe,
  register,
  on,
  eachKeyed,
  narrow,
} from "./widget.js"
import type { AnyEl, FlowContent, GlobalAttrs } from "./html.js"
import type { ReactiveAttrs } from "./reactive-html.js"

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Apply reactive (or static) attributes to an element. Mirrors the logic in
 * reactive-html.ts — duplicated here to avoid coupling on an unexported helper.
 * Must be called during a widget call context so that reactive subscriptions
 * are registered for cleanup.
 */
function _applyAttrs(node: Element, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue
    if (typeof v === "function") {
      const c = computed(v as () => unknown)
      const apply = (val: unknown): void => {
        if (val === undefined || val === null || val === false) node.removeAttribute(k)
        else node.setAttribute(k, val === true ? "" : String(val))
      }
      apply(c.get())
      subscribe(c, apply)
    } else {
      if (v === null || v === false) continue
      node.setAttribute(k, v === true ? "" : String(v))
    }
  }
}

// ── query ────────────────────────────────────────────────────────────────────

export interface QueryResult<T> {
  /** Signal holding the current async state. */
  readonly state: ReadonlySignal<AsyncData<T>>
  /** Reset to loading and re-call the fetcher. */
  refetch(): void
  /**
   * Derive a computed signal from the success value, falling back to
   * `fallback` while loading or failed. Eliminates the manual
   * `computed(() => { const s = q.state.get(); return s.status === 'success' ? fn(s.value) : fallback })`
   * pattern.
   */
  select<U>(fn: (value: T) => U, fallback: U): ReadonlySignal<U>
}

/**
 * Create a reactive query from a fetcher function. Calls the fetcher
 * immediately; `refetch()` resets to loading state and re-calls.
 *
 * Must be called during a widget call context — cleanup (abort of any
 * in-flight request) is registered automatically.
 */
export function query<T>(fetcher: () => Promise<T>): QueryResult<T> {
  const state = _signal<AsyncData<T>>(loading)
  let controller = new AbortController()

  const run = () => {
    controller.abort()
    controller = new AbortController()
    state.set(loading)
    const { signal: abort } = controller
    fetcher().then(
      (v) => { if (!abort.aborted) state.set(success(v)) },
      (e) => { if (!abort.aborted) state.set(failure(e)) },
    )
  }

  run()
  register(() => controller.abort())

  const select = <U>(fn: (value: T) => U, fallback: U): ReadonlySignal<U> =>
    computed(() => {
      const s = state.get()
      return s.status === "success" ? fn(s.value) : fallback
    })

  return { state, refetch: run, select }
}

// ── mutation ─────────────────────────────────────────────────────────────────

export interface MutationState {
  readonly busy: boolean
  readonly error: Error | undefined
}

export interface MutationResult<In, Out> {
  /** Signal tracking busy/error state. */
  readonly state: ReadonlySignal<MutationState>
  /** Execute the mutation. Sets busy=true during the call. */
  submit(input: In): Promise<Out>
  /** Clear the error state. */
  reset(): void
}

/**
 * Create a reactive mutation wrapper. `submit()` calls the execute function,
 * tracking busy/error state in a signal. Does not require a widget context.
 */
export function mutation<In, Out>(
  execute: (input: In) => Promise<Out>,
  opts?: { onSuccess?: (result: Out) => void },
): MutationResult<In, Out> {
  const state = _signal<MutationState>({ busy: false, error: undefined })

  const submit = async (input: In): Promise<Out> => {
    state.set({ busy: true, error: undefined })
    try {
      const result = await execute(input)
      state.set({ busy: false, error: undefined })
      opts?.onSuccess?.(result)
      return result
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      state.set({ busy: false, error })
      throw e
    }
  }

  const reset = () => {
    state.set({ busy: false, error: undefined })
  }

  return { state, submit, reset }
}

/**
 * Build an error banner element from a mutation's state. Renders a hidden
 * `<div role="alert">` that shows the error message when `m.state.get().error`
 * is truthy — reactively hidden/shown as the mutation's error state changes.
 *
 * Must be called during a widget call context.
 *
 * @example
 * mutationBanner(saveDraftMutation)
 */
export function mutationBanner(m: MutationResult<any, any>): AnyEl {
  const node = document.createElement("div")
  node.setAttribute("role", "alert")
  node.dataset["mutationBanner"] = ""

  const applyError = (err: Error | undefined) => {
    node.textContent = err ? err.message : ""
    node.style.display = err ? "" : "none"
  }
  applyError(m.state.get().error)
  subscribe(m.state, (s) => applyError(s.error))

  return { _tag: "div" as const, node } as AnyEl
}

// ── table ────────────────────────────────────────────────────────────────────

/** Content a cell value function can return. */
export type CellContent = string | number | Node

export type Column<T> = {
  header: string | (() => string)
  cell: ((row: T) => CellContent) | Widget<T>
  /** Set to `true` when `cell` is a `Widget<T>` (receives the row Signal). */
  widget?: boolean
  class?: string
}

/**
 * A `Widget<T[]>` that renders a reactive `<table>` with keyed rows.
 * Headers are built from `columns`; the body uses `eachKeyed` for efficient
 * DOM reconciliation.
 *
 * Must be called during a widget call context.
 */
export function table<T>(opts: {
  columns: Column<T>[]
  key: (row: T) => string | number
  onRowClick?: (row: Signal<T>) => void
  attrs?: ReactiveAttrs<GlobalAttrs>
  /**
   * Shown in place of the table body when the data array is empty. A string
   * renders as a `<p>`; a function is called to produce the element. Toggled
   * reactively (display swap, not teardown/rebuild) so the table reappears
   * instantly once data arrives.
   */
  empty?: string | (() => AnyEl)
}): Widget<T[], FlowContent> {
  return (listSignal: Signal<T[]>): FlowContent => {
    const tableNode = document.createElement("table")
    if (opts.attrs) _applyAttrs(tableNode, opts.attrs as Record<string, unknown>)

    // ── thead ──
    const thead = document.createElement("thead")
    const headerRow = document.createElement("tr")
    for (const col of opts.columns) {
      const th = document.createElement("th")
      if (col.class) th.setAttribute("class", col.class)
      if (typeof col.header === "function") {
        const c = computed(col.header)
        th.textContent = c.get()
        subscribe(c, (v) => { th.textContent = v })
      } else {
        th.textContent = col.header
      }
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    tableNode.appendChild(thead)

    // ── tbody via eachKeyed ──
    const rowWidget = (rowSignal: Signal<T>): AnyEl => {
      const tr = document.createElement("tr")

      if (opts.onRowClick) {
        const handler = opts.onRowClick
        on(tr, "click", () => handler(rowSignal))
      }

      for (const col of opts.columns) {
        const td = document.createElement("td")
        if (col.class) td.setAttribute("class", col.class)

        if (col.widget) {
          // Widget<T> — call with the row signal, mount the returned element
          const el = (col.cell as Widget<T>)(rowSignal)
          td.appendChild(el.node)
        } else {
          // Value function — reactively render cell content
          const valueFn = col.cell as (row: T) => CellContent
          const apply = (v: T) => {
            const content = valueFn(v)
            if (content instanceof Node) {
              td.replaceChildren(content)
            } else {
              td.textContent = String(content)
            }
          }
          apply(rowSignal.get())
          subscribe(rowSignal, apply)
        }

        tr.appendChild(td)
      }

      return { _tag: "tr" as const, node: tr } as AnyEl
    }

    const tbodyEl = eachKeyed(
      listSignal,
      (item) => String(opts.key(item)),
      rowWidget,
      { container: "tbody" },
    )
    tableNode.appendChild(tbodyEl.node)

    if (opts.empty === undefined) {
      return { _tag: "table" as const, node: tableNode } as FlowContent
    }

    // ── Empty state (reactive toggle, no teardown/rebuild) ──
    const wrapper = document.createElement("div")
    wrapper.dataset["tableWithEmpty"] = ""
    wrapper.appendChild(tableNode)

    const emptyNode: HTMLElement =
      typeof opts.empty === "string"
        ? (() => {
            const p = document.createElement("p")
            p.textContent = opts.empty as string
            return p
          })()
        : ((opts.empty as () => AnyEl)().node as HTMLElement)
    wrapper.appendChild(emptyNode)

    const isEmpty = computed(() => listSignal.get().length === 0)
    const applyDisplay = (empty: boolean) => {
      tableNode.style.display = empty ? "none" : ""
      emptyNode.style.display = empty ? "" : "none"
    }
    applyDisplay(isEmpty.get())
    subscribe(isEmpty, applyDisplay)

    return { _tag: "div" as const, node: wrapper } as FlowContent
  }
}

// ── tabs ─────────────────────────────────────────────────────────────────────

/**
 * A `Widget<T[]>` that classifies items into tab groups, renders a tab bar
 * with counts, and shows the content for the active tab. All tab contents are
 * rendered eagerly (persistent DOM) and toggled via `display:none`.
 *
 * Must be called during a widget call context.
 */
export function tabs<T, K extends string>(opts: {
  classify: (item: T) => K
  order: K[]
  labels: Record<K, string | (() => string)>
  content: Record<K, Widget<T[]>>
  attrs?: ReactiveAttrs<GlobalAttrs>
}): Widget<T[], FlowContent> {
  return (listSignal: Signal<T[]>): FlowContent => {
    const container = document.createElement("div")
    container.dataset["tabs"] = ""
    if (opts.attrs) _applyAttrs(container, opts.attrs as Record<string, unknown>)

    const activeTab = _signal<K>(opts.order[0]!)

    // ── Tab bar ──
    const nav = document.createElement("nav")
    for (const tabKey of opts.order) {
      const btn = document.createElement("button")
      btn.setAttribute("type", "button")

      const count = computed(() =>
        listSignal.get().filter((item) => opts.classify(item) === tabKey).length,
      )

      const label = opts.labels[tabKey]
      if (typeof label === "function") {
        const labelC = computed(label)
        const updateText = () => { btn.textContent = `${labelC.get()} (${count.get()})` }
        updateText()
        subscribe(labelC, updateText)
        subscribe(count, updateText)
      } else {
        const updateText = () => { btn.textContent = `${label} (${count.get()})` }
        updateText()
        subscribe(count, updateText)
      }

      // Active state
      const isActive = computed(() => activeTab.get() === tabKey)
      const applyActive = (active: boolean) => {
        btn.setAttribute("aria-selected", String(active))
        if (active) btn.dataset["active"] = ""
        else delete btn.dataset["active"]
      }
      applyActive(isActive.get())
      subscribe(isActive, applyActive)

      on(btn, "click", () => activeTab.set(tabKey))
      nav.appendChild(btn)
    }
    container.appendChild(nav)

    // ── Content panels (all rendered, toggle display) ──
    for (const tabKey of opts.order) {
      const filtered = computed(() =>
        listSignal.get().filter((item) => opts.classify(item) === tabKey),
      )

      const wrapper = document.createElement("div")
      const isActive = computed(() => activeTab.get() === tabKey)
      const applyDisplay = (active: boolean) => {
        wrapper.style.display = active ? "" : "none"
      }
      applyDisplay(isActive.get())
      subscribe(isActive, applyDisplay)

      const contentWidget = opts.content[tabKey]!
      const el = contentWidget(filtered as unknown as Signal<T[]>)
      wrapper.appendChild(el.node)
      container.appendChild(wrapper)
    }

    return { _tag: "div" as const, node: container } as FlowContent
  }
}

// ── panel ────────────────────────────────────────────────────────────────────

export interface PanelHandle<T> {
  open(data: T): void
  close(): void
  readonly isOpen: ReadonlySignal<boolean>
  readonly data: Signal<T | undefined>
}

export interface PanelKit<T> {
  readonly handle: PanelHandle<T>
  /** Render the panel overlay. Call once inside a widget context and mount. */
  widget(): AnyEl
}

/**
 * Create panel state and an overlay widget. NOT a Widget itself — call
 * `widget()` once inside a widget context to mount the overlay. Use the
 * returned `handle` to open/close the panel imperatively.
 */
export function panel<T>(opts: {
  render: Widget<T>
  /**
   * Rendered as a `<header>` inside the panel container, before the content.
   * A string renders the title plus a close button wired to `handle.close()`.
   * A `Widget<T>` renders its output (receives the panel's data signal).
   * Omitted → no header (previous behavior).
   */
  header?: string | Widget<T>
  beforeClose?: () => boolean
  attrs?: ReactiveAttrs<GlobalAttrs>
}): PanelKit<T> {
  const data = _signal<T | undefined>(undefined)
  const isOpen = computed(() => data.get() !== undefined)

  const handle: PanelHandle<T> = {
    open: (d: T) => data.set(d),
    close: () => {
      if (opts.beforeClose && !opts.beforeClose()) return
      data.set(undefined)
    },
    isOpen,
    data,
  }

  const widget = (): AnyEl => {
    const overlay = document.createElement("div")
    overlay.dataset["panelOverlay"] = ""
    if (opts.attrs) _applyAttrs(overlay, opts.attrs as Record<string, unknown>)

    // Click on overlay background = close
    on(overlay, "click", (e) => {
      if (e.target === overlay) handle.close()
    })

    // Toggle overlay visibility
    const applyDisplay = (open: boolean) => {
      overlay.style.display = open ? "" : "none"
    }
    applyDisplay(isOpen.get())
    subscribe(isOpen, applyDisplay)

    // Panel container
    const panelContainer = document.createElement("div")
    panelContainer.dataset["panel"] = ""
    overlay.appendChild(panelContainer)

    // Header (optional) — inside the panel container, before the content.
    if (opts.header !== undefined) {
      const headerNode = document.createElement("header")
      if (typeof opts.header === "string") {
        const title = document.createElement("span")
        title.textContent = opts.header
        const closeBtn = document.createElement("button")
        closeBtn.setAttribute("type", "button")
        closeBtn.setAttribute("aria-label", "Close")
        closeBtn.textContent = "×"
        on(closeBtn, "click", () => handle.close())
        headerNode.appendChild(title)
        headerNode.appendChild(closeBtn)
      } else {
        const headerWidget = narrow(opts.header as Widget<T, FlowContent>, some<T>())
        const headerEl = headerWidget(data)
        headerNode.appendChild(headerEl.node)
      }
      panelContainer.appendChild(headerNode)
    }

    // Content: narrow(render, some()) renders when data is non-undefined
    const contentWidget = narrow(opts.render as Widget<T, FlowContent>, some<T>())
    const contentEl = contentWidget(data)
    panelContainer.appendChild(contentEl.node)

    return { _tag: "div" as const, node: overlay } as AnyEl
  }

  return { handle, widget }
}
