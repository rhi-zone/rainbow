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
 * An entry in `AttrSchema<T>`. Either a plain optic (attribute name = prop name)
 * or a named entry `{ name, optic }` where `name` is the HTML attribute name
 * (e.g. `"requires-review"`) and the TypeScript key remains the camelCase prop.
 *
 * - `optic.view(raw)`    — parse attribute string into `T[K]`;
 *                          `undefined` means use `defaults[K]`
 * - `optic.review(v, _)` — serialise `T[K]` back to a string for reflection
 *
 * @example
 * // Simple: attr name = prop name
 * attrs: { label: attrString, score: attrNumber }
 *
 * // Alias: HTML "requires-review" → TS prop "requiresReview"
 * attrs: { requiresReview: { name: "requires-review", optic: attrBoolean } }
 */
export type AttrEntry<V> =
  | Optic<string | null, V>
  | { name: string; optic: Optic<string | null, V> }

export type AttrSchema<T> = {
  [K in keyof T]?: AttrEntry<T[K]>
}

function resolveEntry<V>(
  key: string,
  entry: AttrEntry<V>,
): { attrName: string; optic: Optic<string | null, V> } {
  if ("name" in entry && typeof (entry as { name: unknown }).name === "string") {
    const e = entry as { name: string; optic: Optic<string | null, V> }
    return { attrName: e.name, optic: e.optic }
  }
  return { attrName: key, optic: entry as Optic<string | null, V> }
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
 *
 * @example
 * // Local UI state (e.g. open/closed) separate from external props:
 * // Use dynamic() to pair local state with the external signal.
 * // defineElement manages only the external props; local state is
 * // encapsulated inside the widget and never reflected to attributes.
 *
 * const inner = (sig: Signal<[boolean, ExternalProps]>) => {
 *   const open = sig.focus(index(0))   // local state
 *   const props = sig.focus(index(1))  // external (attr-bound)
 *   // ... build DOM using both signals
 * }
 *
 * defineElement("my-dropdown", {
 *   widget: dynamic(false, inner),  // Widget<ExternalProps>
 *   defaults: { value: "" },
 *   attrs: { value: attrString },
 * })
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

  // Build: HTML attr name → { propKey, optic }
  type AttrInfo = { propKey: keyof T & string; optic: Optic<string | null, T[keyof T]> }
  const attrMap = new Map<string, AttrInfo>()
  for (const key of Object.keys(attrs) as (keyof T & string)[]) {
    const entry = attrs[key]!
    const { attrName, optic } = resolveEntry(key, entry as AttrEntry<T[keyof T]>)
    attrMap.set(attrName, { propKey: key, optic })
  }
  const attrNames = [...attrMap.keys()]

  const styleSheets: CSSStyleSheet[] =
    styles == null ? [] :
    Array.isArray(styles) ? styles.map(toStyleSheet) :
    [toStyleSheet(styles)]

  class RainbowElement extends HTMLElement {
    // Use underscore prefix rather than # so Object.defineProperty below can
    // access instance state from outside the class body.
    _rb_signal: Signal<T> = signal({ ...defaults })
    _rb_cleanup: (() => void) | null = null

    static get observedAttributes(): string[] { return attrNames as string[] }

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
      const info = attrMap.get(name)
      if (info == null) return
      const parsed = info.optic.view(raw) ?? defaults[info.propKey]
      this._rb_signal.set({ ...this._rb_signal.get(), [info.propKey]: parsed })
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
