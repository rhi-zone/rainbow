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
  lens,
  fst,
  snd,
  stateful,
} from "@rhi-zone/rainbow"
import type { AnyEl, FlowContent, DivEl } from "./html.js"

// ── Widget type ───────────────────────────────────────────────────────────────

/**
 * A widget is a pure function from a reactive signal to a typed DOM node.
 * Calling a widget subscribes it to the signal; the returned node is updated
 * in place whenever the signal changes.
 *
 * @typeParam T - The signal value type
 * @typeParam E - The element type produced (defaults to FlowContent)
 */
export type Widget<T, E extends AnyEl = FlowContent> = (signal: Signal<T>) => E

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
  signal: Signal<T>,
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
  return (s) => w(s.focus(l))
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

    const render = () => {
      narrowed = s.narrow(prism)
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
        const itemSignal = listSignal.focus(itemLens)
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
    const node = document.createElement("div")
    node.dataset["beside"] = ""
    const sa = s.focus(fst<A, B>())
    const sb = s.focus(snd<A, B>())
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
    const node = document.createElement("div")
    node.dataset["above"] = ""
    const sa = s.focus(fst<A, B>())
    const sb = s.focus(snd<A, B>())
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
    const mapped = s.narrow(isoP) as unknown as Signal<A>
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
export function show<A>(
  w: Widget<A, FlowContent>,
  predicate: (a: A) => boolean,
): Widget<A, DivEl> {
  return (s) => {
    const node = document.createElement("div")
    node.dataset["show"] = ""

    let innerCleanup: (() => void) | null = null

    const update = (v: A) => {
      if (predicate(v)) {
        if (innerCleanup === null) {
          const [child, cleanup] = _track(() => w(s))
          innerCleanup = cleanup
          node.appendChild(child.node)
        }
        // Already rendered — child's own subs handle value updates
      } else {
        if (innerCleanup !== null) {
          innerCleanup()
          innerCleanup = null
          node.replaceChildren()
        }
      }
    }

    update(s.get())
    subscribe(s, update)
    _register(() => innerCleanup?.())

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
