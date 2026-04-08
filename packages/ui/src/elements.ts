/**
 * @rhi-zone/rainbow-ui/elements
 *
 * `defineElement` — wrap a Widget<T> in a native custom element.
 *
 * Bridges the HTML attribute/property system into rainbow signals so that
 * `<my-card label="Alice" count="3">` works from plain HTML, and
 * `el.label = "Bob"` works from JavaScript, both updating the widget reactively.
 *
 * Shadow DOM is opt-in (defaults to "open"). Styles are applied via
 * `adoptedStyleSheets` when shadow DOM is used.
 */

import { signal } from "@rhi-zone/rainbow"
import type { Signal } from "@rhi-zone/rainbow"
import { mount } from "./widget.js"
import type { AnyEl } from "./html.js"
import type { Widget } from "./widget.js"

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * The declared JS type of an observed attribute.
 * - `"string"`  — passed through as-is
 * - `"number"`  — coerced via `Number(val)`; absent attr resets to default
 * - `"boolean"` — presence attribute: `""` or `"true"` → `true`, absent/`"false"` → `false`
 * - `"json"`    — `JSON.parse(val)`; escape hatch for structured data
 */
export type AttrType = "string" | "number" | "boolean" | "json"

/** Maps a field value type to the attr types that can represent it. */
type CompatibleAttrType<V> =
  [V] extends [string]  ? "string" | "json" :
  [V] extends [number]  ? "number" | "json" :
  [V] extends [boolean] ? "boolean" | "json" :
  "json"

/**
 * Map of attribute names to their declared types. Only fields of `T` may be
 * listed, and each type tag must be compatible with the field's value type.
 */
export type AttrsMap<T> = {
  readonly [K in keyof T & string]?: CompatibleAttrType<T[K]>
}

export interface DefineElementOptions<T> {
  /**
   * Shadow DOM mode. `"open"` (default) or `"closed"` creates a shadow root;
   * `false` renders into light DOM (useful when global styles must reach in).
   */
  readonly shadow?: "open" | "closed" | false
  /**
   * Observed attributes and their JS types. Each listed attr is reflected as a
   * JS property accessor on the element class.
   */
  readonly attrs?: AttrsMap<T>
  /**
   * Styles to adopt into the shadow root via `adoptedStyleSheets`. Accepts a
   * `CSSStyleSheet`, a CSS string (converted with `CSSStyleSheet.replaceSync`),
   * or an array of either. No-op when `shadow` is `false`.
   */
  readonly styles?: CSSStyleSheet | string | (CSSStyleSheet | string)[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toStyleSheet(s: CSSStyleSheet | string): CSSStyleSheet {
  if (typeof s === "string") {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(s)
    return sheet
  }
  return s
}

function coerceAttr(
  type: AttrType,
  val: string | null,
  defaultValue: unknown,
): unknown {
  if (val === null) {
    // Absent attribute — reset to default for number/string; false for boolean
    return type === "boolean" ? false : defaultValue
  }
  switch (type) {
    case "string":  return val
    case "number":  return Number(val)
    case "boolean": return val === "" || val === "true"
    case "json":    try { return JSON.parse(val) } catch { return defaultValue }
  }
}

// ── defineElement ──────────────────────────────────────────────────────────

/**
 * Register a custom element backed by a `Widget<T>`.
 *
 * The element's signal starts from `defaults`. Declared attrs are observed and
 * coerced into signal fields on each attribute change. JS property accessors
 * are defined for each declared attr so `el.count = 5` and
 * `el.setAttribute("count", "5")` both update the signal.
 *
 * @example
 * defineElement("score-card", scoreCardWidget, { label: "", score: 0 }, {
 *   attrs: { label: "string", score: "number" },
 *   styles: `:host { display: block; font-family: sans-serif }`,
 * })
 *
 * // In HTML:
 * // <score-card label="Alice" score="42"></score-card>
 */
export function defineElement<T extends object>(
  tagName: string,
  widget: Widget<T, AnyEl>,
  defaults: T,
  options: DefineElementOptions<T> = {},
): void {
  const { shadow = "open", attrs = {} as AttrsMap<T>, styles } = options

  const attrNames = Object.keys(attrs) as (keyof T & string)[]

  const styleSheets: CSSStyleSheet[] =
    styles == null ? [] :
    Array.isArray(styles) ? styles.map(toStyleSheet) :
    [toStyleSheet(styles)]

  class RainbowElement extends HTMLElement {
    // Use underscore prefix rather than # so Object.defineProperty below can
    // access instance state from outside the class body.
    _rb_signal: Signal<T> = signal({ ...defaults })
    _rb_cleanup: (() => void) | null = null

    static get observedAttributes(): string[] { return attrNames }

    connectedCallback(): void {
      const root: HTMLElement | ShadowRoot =
        shadow !== false
          ? (this.shadowRoot ?? this.attachShadow({ mode: shadow }))
          : this

      if (shadow !== false && styleSheets.length > 0) {
        (root as ShadowRoot).adoptedStyleSheets = styleSheets
      }

      // mount expects HTMLElement but ShadowRoot is structurally compatible
      // (both have appendChild / replaceChildren). Cast is safe.
      this._rb_cleanup = mount(widget, this._rb_signal, root as HTMLElement)
    }

    disconnectedCallback(): void {
      this._rb_cleanup?.()
      this._rb_cleanup = null
    }

    attributeChangedCallback(
      name: string,
      _old: string | null,
      val: string | null,
    ): void {
      const attrType = attrs[name as keyof T & string]
      if (attrType == null) return
      const coerced = coerceAttr(attrType, val, defaults[name as keyof T])
      this._rb_signal.set({ ...this._rb_signal.get(), [name]: coerced })
    }
  }

  // JS property accessors — one per declared attr.
  // Must be defined outside the class body so the loop variable `name` is
  // captured correctly per iteration (not shared across iterations).
  for (const name of attrNames) {
    Object.defineProperty(RainbowElement.prototype, name, {
      get(this: RainbowElement): unknown {
        return this._rb_signal.get()[name as keyof T]
      },
      set(this: RainbowElement, value: unknown): void {
        this._rb_signal.set({
          ...this._rb_signal.get(),
          [name]: value as T[keyof T & string],
        })
      },
      configurable: true,
      enumerable: true,
    })
  }

  customElements.define(tagName, RainbowElement)
}
