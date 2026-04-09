/**
 * @rhi-zone/rainbow-ui/elements
 *
 * `defineElement` — wrap a Widget<T> in a native custom element.
 *
 * Bridges the HTML attribute/property system into rainbow signals so that
 * `<my-card label="Alice" count="3">` works from plain HTML, and
 * `el.label = "Bob"` works from JavaScript, both updating the widget reactively.
 *
 * Attributes are treated as a boundary adapter: HTML attributes are always
 * `string | null`, and `AttrSchema<T>` maps each observed attribute to an
 * `Optic<string | null, T[K]>` that parses (view) and serialises (review) it.
 *
 * Shadow DOM defaults to "open". Styles are applied via `adoptedStyleSheets`
 * when shadow DOM is used.
 */

import { signal } from "@rhi-zone/rainbow"
import type { Signal } from "@rhi-zone/rainbow"
import type { Optic } from "@rhi-zone/rainbow"
import { mount } from "./widget.js"
import type { AnyEl } from "./html.js"
import type { Widget } from "./widget.js"

// ── AttrSchema ────────────────────────────────────────────────────────────────

/**
 * Maps field names of `T` to optics that convert between `string | null`
 * (raw HTML attribute) and `T[K]` (typed signal field).
 *
 * - `optic.view(raw)`    — parse attribute string into `T[K]`;
 *                          `undefined` means use `defaults[K]`
 * - `optic.review(v, _)` — serialise `T[K]` back to a string for reflection
 */
export type AttrSchema<T> = {
  [K in keyof T]?: Optic<string | null, T[K]>
}

// ── Standard attribute optics ──────────────────────────────────────────────────

/**
 * Pass-through: `view` returns the raw string, or `undefined` when absent.
 * `review` returns the value unchanged.
 */
export const attrString: Optic<string | null, string> = {
  view(raw) { return raw ?? undefined },
  review(v) { return v },
}

/**
 * Numeric attribute: `view` converts with `Number()`; returns `undefined` on
 * absent attribute or NaN. `review` serialises with `String()`.
 */
export const attrNumber: Optic<string | null, number> = {
  view(raw) {
    if (raw == null) return undefined
    const n = Number(raw)
    return isNaN(n) ? undefined : n
  },
  review(v) { return String(v) },
}

/**
 * Boolean attribute: absent → `undefined`; `"false"` or `"0"` → `false`;
 * anything else → `true`. `review` serialises with `String()`.
 */
export const attrBoolean: Optic<string | null, boolean> = {
  view(raw) {
    if (raw == null) return undefined
    return raw !== "false" && raw !== "0"
  },
  review(v) { return String(v) },
}

/**
 * JSON attribute: `view` parses with `JSON.parse`; returns `undefined` on
 * absent attribute or parse error. `review` serialises with `JSON.stringify`.
 */
export function attrJson<T>(): Optic<string | null, T> {
  return {
    view(raw) {
      if (raw == null) return undefined
      try { return JSON.parse(raw) as T } catch { return undefined }
    },
    review(v) { return JSON.stringify(v) },
  }
}

// ── attrsFrom ──────────────────────────────────────────────────────────────────

/**
 * Subset of `AttrSchema<T>` containing only the primitive fields of `T`
 * (`string | number | boolean`).
 */
export type PrimitiveAttrSchema<T> = {
  [K in keyof T as T[K] extends string | number | boolean ? K : never]: Optic<
    string | null,
    T[K]
  >
}

/**
 * Auto-derive an `AttrSchema` from `defaults` for all primitive fields
 * (`string`, `number`, `boolean`). Complex fields are excluded.
 *
 * @example
 * // Zero repetition for primitive-only T:
 * attrs: attrsFrom(defaults)
 *
 * // Mixed case — spread and add complex fields:
 * attrs: { ...attrsFrom(defaults), createdAt: attrJson<Date>() }
 */
export function attrsFrom<T extends object>(defaults: T): PrimitiveAttrSchema<T> {
  const result: Record<string, Optic<string | null, unknown>> = {}
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const kind = typeof defaults[key]
    if (kind === "string")  { result[key] = attrString as Optic<string | null, unknown> }
    else if (kind === "number")  { result[key] = attrNumber as Optic<string | null, unknown> }
    else if (kind === "boolean") { result[key] = attrBoolean as Optic<string | null, unknown> }
  }
  return result as unknown as PrimitiveAttrSchema<T>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toStyleSheet(s: CSSStyleSheet | string): CSSStyleSheet {
  if (typeof s === "string") {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(s)
    return sheet
  }
  return s
}

// ── defineElement ──────────────────────────────────────────────────────────────

/**
 * Register a custom element backed by a `Widget<T>`.
 *
 * The element's signal starts from `defaults`. Attributes listed in `attrs`
 * are observed; each attribute change is parsed via the corresponding optic's
 * `view` method and written into the signal. All fields of `T` get JS property
 * accessors regardless of whether they appear in `attrs`.
 *
 * @example
 * defineElement("score-card", {
 *   widget: scoreCardWidget,
 *   defaults: { label: "", score: 0 },
 *   attrs: { label: attrString, score: attrNumber },
 *   styles: `:host { display: block; font-family: sans-serif }`,
 * })
 *
 * // In HTML:
 * // <score-card label="Alice" score="42"></score-card>
 */
export function defineElement<T extends object>(
  tagName: string,
  config: {
    widget: Widget<T, AnyEl>
    defaults: T
    attrs?: AttrSchema<T>
    shadow?: "open" | "closed" | false
    styles?: CSSStyleSheet | string | (CSSStyleSheet | string)[]
  },
): void {
  const {
    widget,
    defaults,
    attrs = {} as AttrSchema<T>,
    shadow = "open",
    styles,
  } = config

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
      raw: string | null,
    ): void {
      const optic = attrs[name as keyof T & string]
      if (optic == null) return
      const parsed = optic.view(raw) ?? defaults[name as keyof T]
      this._rb_signal.set({ ...this._rb_signal.get(), [name]: parsed })
    }
  }

  // JS property accessors — one per field in T (not just observed attrs).
  // Must be defined outside the class body so the loop variable `name` is
  // captured correctly per iteration (not shared across iterations).
  for (const name of Object.keys(defaults) as (keyof T & string)[]) {
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
