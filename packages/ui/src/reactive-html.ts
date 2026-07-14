/**
 * @rhi-zone/rainbow-ui/reactive-html
 *
 * Reactive HTML element factories — the same element tags as `h.*` in
 * widget.ts, but attribute values may be a thunk `() => T` instead of a
 * plain value. A thunk is auto-tracked (via `computed()`): reading a
 * signal's `.get()` inside it registers a dependency, and the attribute is
 * re-applied whenever that signal changes.
 *
 *   import { r } from '@rhi-zone/rainbow-ui/reactive-html'
 *   r.div({ class: () => isActive.get() ? "active" : "" }, "hello")
 *
 * Static attribute values (not functions) are set once at construction —
 * no signal, no subscription. The `typeof v === "function"` check happens
 * once per attribute at construction time; the update path per reactive
 * attribute is a flat `apply(v)` closure with no further branching.
 *
 * Children follow the same `RChild<T>` contract as `h.*`: a string (fresh
 * text node per instance) or a widget receiving the same outer signal `T`.
 * Reactive attributes are independent of `T` — a thunk may read any
 * signal(s) in scope, not just the widget's own.
 */

import { type Signal, computed } from "@rhi-zone/rainbow"
import type { AnyEl, El, GlobalAttrs } from "./html.js"
import { subscribe, type RChild, type Widget } from "./widget.js"

// ── Reactive attribute types ──────────────────────────────────────────────────

/** A value that is either static or a zero-arg auto-tracked thunk. */
export type Reactive<T> = T | (() => T)

/** Maps every attribute of `A` to accept a static value or a thunk. */
export type ReactiveAttrs<A> = { [K in keyof A]?: Reactive<A[K]> }

// ── Internal helpers ──────────────────────────────────────────────────────────

function applyReactiveAttrs(node: HTMLElement, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue

    if (typeof v === "function") {
      const thunk = v as () => unknown
      const apply = (val: unknown): void => {
        if (val === undefined || val === null || val === false) node.removeAttribute(k)
        else node.setAttribute(k, val === true ? "" : String(val))
      }
      const c = computed(thunk)
      apply(c.get())
      subscribe(c, apply)
    } else {
      if (v === null || v === false) continue
      node.setAttribute(k, v === true ? "" : String(v))
    }
  }
}

/**
 * Build a reactive element factory for `tag`. Returns a function that
 * accepts `ReactiveAttrs<GlobalAttrs>` and spread `RChild<T>` children, and
 * produces a `Widget<T, El<tag, N>>` — same call shape as `h.*`.
 */
function _reactiveEl<Tag extends keyof HTMLElementTagNameMap>(tag: Tag) {
  type N = HTMLElementTagNameMap[Tag]
  type E = El<Tag & string, N>
  // Written as an expanded function type, mirroring `_reactive` in widget.ts,
  // to avoid the `E extends AnyEl` constraint on the Widget<T, E> alias.
  return <T>(attrs: ReactiveAttrs<GlobalAttrs>, ...children: RChild<T>[]): ((s: Signal<T>) => E) => {
    return (s: Signal<T>): E => {
      const node = document.createElement(tag) as HTMLElement
      applyReactiveAttrs(node, attrs as Record<string, unknown>)
      for (const child of children) {
        if (typeof child === "function") {
          node.appendChild((child as Widget<T, AnyEl>)(s).node)
        } else {
          node.appendChild(document.createTextNode(child))
        }
      }
      return { _tag: tag, node: node as unknown as N } as unknown as E
    }
  }
}

// ── Reactive hyperscript factories ────────────────────────────────────────────

/**
 * Reactive hyperscript factories with thunk-valued attributes. Same element
 * tags as `h.*` (widget.ts). Import as:
 *
 *   import { r } from '@rhi-zone/rainbow-ui/reactive-html'
 */
export const r = {
  // Sectioning / flow
  div:      _reactiveEl("div"),
  section:  _reactiveEl("section"),
  article:  _reactiveEl("article"),
  header:   _reactiveEl("header"),
  footer:   _reactiveEl("footer"),
  main:     _reactiveEl("main"),
  nav:      _reactiveEl("nav"),
  // Headings
  h1:       _reactiveEl("h1"),
  h2:       _reactiveEl("h2"),
  h3:       _reactiveEl("h3"),
  h4:       _reactiveEl("h4"),
  h5:       _reactiveEl("h5"),
  h6:       _reactiveEl("h6"),
  // Phrasing
  p:        _reactiveEl("p"),
  span:     _reactiveEl("span"),
  a:        _reactiveEl("a"),
  em:       _reactiveEl("em"),
  strong:   _reactiveEl("strong"),
  code:     _reactiveEl("code"),
  pre:      _reactiveEl("pre"),
  // Lists
  ul:       _reactiveEl("ul"),
  ol:       _reactiveEl("ol"),
  li:       _reactiveEl("li"),
  // Forms
  button:   _reactiveEl("button"),
  label:    _reactiveEl("label"),
  form:     _reactiveEl("form"),
  fieldset: _reactiveEl("fieldset"),
} as const
