# rainbow/ui — Elements layer design

Three open design questions for completing the gap between `@rhi-zone/rainbow-ui`
and a full Lit replacement.

---

## 1. `defineElement` — custom element wrapper

**Goal:** wrap a `Widget<T>` in a native custom element so it can be used as
`<my-card label="Alice" count="3">` anywhere in HTML, with reactive attribute/
property binding flowing into a signal.

### Revised design (April 2026)

The original design used string tags (`"string"`, `"number"`, `"boolean"`, `"json"`)
for attribute coercion. These are a bespoke type system that doesn't compose with
the rest of the optics toolkit.

**Attributes are a boundary adapter.** HTML attributes are always `string | null`.
Coercing them into typed signal fields is exactly `Optic<string | null, T[K]>`:
- `view(raw)` — parse attribute string into `T[K]`; `undefined` means use `defaults[K]`
- `review(value)` — serialize `T[K]` back to a string for `getAttribute` reflection

This framing generalizes: URL search params, `localStorage`, form submissions are
all the same pattern — stringly-typed external world → typed internal signal.

```ts
type AttrSchema<T> = { [K in keyof T]?: Optic<string | null, T[K]> }

defineElement('my-card', {
  widget: myWidget,
  defaults,
  attrs: { label: attrString, count: attrNumber, active: attrBoolean },
  styles: `...`,
})
```

**Standard attribute optics** (in `@rhi-zone/rainbow-ui/elements`):

```ts
const attrString:  Optic<string | null, string>  // raw ?? undefined (use default on absent)
const attrNumber:  Optic<string | null, number>  // Number(raw); undefined on null or NaN
const attrBoolean: Optic<string | null, boolean> // undefined on null; raw !== "false" && raw !== "0"
const attrJson:    <T>() => Optic<string | null, T>  // JSON.parse; undefined on null or parse error
```

**`attrsFrom(defaults)`** — auto-derive `AttrSchema<T>` for primitive fields:

```ts
function attrsFrom<T extends object>(defaults: T): PrimitiveAttrSchema<T>
// Only includes fields where T[K] extends string | number | boolean.
// Complex fields are excluded from the return type — TypeScript will flag
// missing coercions at call sites that spread attrsFrom and need more.
```

Common case:
```ts
attrs: attrsFrom(defaults)  // zero repetition for primitive-only T
```

Mixed case:
```ts
attrs: { ...attrsFrom(defaults), createdAt: attrJson<Date>() }
```

### Config shape

```ts
defineElement(tagName: string, config: {
  widget: Widget<T, AnyEl>
  defaults: T
  attrs?: AttrSchema<T>        // omit = no observed attributes (JS-only properties)
  shadow?: 'open' | 'closed' | false   // default: 'open'
  styles?: CSSStyleSheet | string | (CSSStyleSheet | string)[]
}): void
```

Plain config object — no builder, no method chaining. Composable by factoring
out the config object and spreading/merging as needed.

### Property accessors

All fields in `T` get JS property accessors regardless of whether they're in
`attrs`. JS setters write directly into the signal. `attrs` only controls which
fields are observable as HTML attributes.

### Lifecycle

```
connectedCallback    → mount(widget, signal, shadowRoot ?? this)
disconnectedCallback → cleanup()
attributeChangedCallback(name, _, raw) →
  const optic = attrs[name]
  const parsed = optic.view(raw) ?? defaults[name]
  signal.set({ ...signal.get(), [name]: parsed })
```

`review` is used for `getAttribute` reflection: `el.getAttribute(name)` returns
`optic.review(signal.get()[name])`.

### Shadow DOM

Optional, defaulting to `"open"`. Light DOM (`shadow: false`) is useful when
global styles need to reach inside. Shadow DOM is the default because it's the
main reason to use custom elements over plain `mount`.

---

## 2. Async combinator

**Goal:** bridge `Promise<T>` / async data into the widget algebra without
putting async logic inside widgets themselves.

### Decision: signal adapter, not a widget combinator

Widgets stay synchronous. Async state is a signal value, composed with existing
combinators (`narrow`, `show`) rather than a new async-specific widget.

```ts
type AsyncState<T> =
  | { status: "pending" }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown }

// One-shot: wrap a promise already in flight
function fromPromise<T>(promise: Promise<T>): ReadonlySignal<AsyncState<T>>

// Reactive: re-runs fn whenever deps change; cancels in-flight via AbortSignal
function fromAsync<D, T>(
  deps: ReadonlySignal<D>,
  fn: (deps: D, abort: AbortSignal) => Promise<T>,
): ReadonlySignal<AsyncState<T>>
```

Consumed with `narrow` prisms per state, or with purpose-built prisms:

```ts
const pending   = prism<AsyncState<T>, void>(s => s.status === "pending"   ? {} : undefined, () => ({ status: "pending" }))
const fulfilled = prism<AsyncState<T>, T>  (s => s.status === "fulfilled"  ? s.value : undefined, v => ({ status: "fulfilled", value: v }))
const rejected  = prism<AsyncState<T>, unknown>(s => s.status === "rejected" ? s.error : undefined, e => ({ status: "rejected", error: e }))
```

### Why not a widget combinator?

A combinator like `async(loadingW, resolvedW, errorW)` would be concise but
hides the state behind the combinator boundary — you can't `focus` into the
resolved value, compose two async sources, or inspect loading state from a
parent widget. Signal adapters keep the data model flat and composable.

### Home

`fromPromise` and `fromAsync` belong in `@rhi-zone/rainbow` (core signal
library), not in rainbow-ui. They produce signals, not elements.

---

## 3. Form binding

**Goal:** two-way binding between a `Signal<string>` (or `Signal<number>` etc.)
and a form control (`<input>`, `<select>`, `<textarea>`).

### The stale-value problem

Naively setting `el.value = signal.get()` on every signal update resets the
cursor mid-typing. The guard: only write `.value` when the element is not the
active focused element, or when the value genuinely differs.

```ts
function bindInput(el: HTMLInputElement | HTMLTextAreaElement, s: Signal<string>): void {
  // DOM → signal
  _register(on(el, "input", () => s.set(el.value)))
  // signal → DOM (guarded)
  subscribe(s, (v) => { if (el.value !== v) el.value = v })
}

function bindSelect(el: HTMLSelectElement, s: Signal<string>): void {
  _register(on(el, "change", () => s.set(el.value)))
  subscribe(s, (v) => { if (el.value !== v) el.value = v })
}

function bindCheckbox(el: HTMLInputElement, s: Signal<boolean>): void {
  _register(on(el, "change", () => s.set(el.checked)))
  subscribe(s, (v) => { if (el.checked !== v) el.checked = v })
}
```

Where `on(el, event, fn)` calls `addEventListener` + registers `removeEventListener`
as cleanup.

### Pre-built input widgets

Convenience widgets built on top of `bindInput`:

```ts
function inputWidget(attrs?: InputAttrs): Widget<string, InputEl>
function textareaWidget(attrs?: TextareaAttrs): Widget<string, TextareaEl>
function selectWidget(options: { value: string; label: string }[], attrs?: SelectAttrs): Widget<string, SelectEl>
function checkboxWidget(attrs?: InputAttrs): Widget<boolean, InputEl>
function numberInputWidget(attrs?: InputAttrs): Widget<number, InputEl>
```

These are the common case. `bindInput` / `bindCheckbox` are exposed for
use inside `template`'s `bind` callback.

### `on` helper

Worth exporting as a general event helper since it pairs naturally with `subscribe`:

```ts
function on<K extends keyof HTMLElementEventMap>(
  el: EventTarget,
  event: K,
  fn: (e: HTMLElementEventMap[K]) => void,
): void  // registers removeEventListener as cleanup
```

---

## Package structure

| Package | What lives there |
|---------|-----------------|
| `@rhi-zone/rainbow` | `fromPromise`, `fromAsync` (signal adapters) |
| `@rhi-zone/rainbow-ui` | `defineElement`, `bindInput`/`bindCheckbox`/`on`, input widgets, SVG factories |
