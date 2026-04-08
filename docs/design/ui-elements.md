# rainbow/ui — Elements layer design

Three open design questions for completing the gap between `@rhi-zone/rainbow-ui`
and a full Lit replacement.

---

## 1. `defineElement` — custom element wrapper

**Goal:** wrap a `Widget<T>` in a native custom element so it can be used as
`<my-card label="Alice" count="3">` anywhere in HTML, with reactive attribute/
property binding flowing into a signal.

### Shadow DOM

Optional per element, defaulting to `"open"`:

```ts
defineElement("my-card", cardWidget, defaults, {
  shadow: "open",   // "open" | "closed" | false  (false = light DOM)
  attrs: { label: "string", count: "number", active: "boolean" },
  styles: sheet,    // CSSStyleSheet | string | (CSSStyleSheet | string)[]
})
```

Light DOM (`shadow: false`) is useful when global styles need to reach inside.
Shadow DOM is the default because it's the main reason to use custom elements
over plain `mount`.

### Attribute type coercion

Attributes are always strings on the wire. Declared types coerce them:

- `"string"` — pass through
- `"number"` — `Number(val)`; `null` attr → signal field reset to default
- `"boolean"` — presence attribute: `""` or `"true"` → `true`, absent/`"false"` → `false`
- `"json"` — `JSON.parse(val)` for complex fields (escape hatch; prefer flat attrs)

### Property accessors

Declared attrs also generate JS property accessors on the element class so
`el.count = 5` works alongside `el.setAttribute("count", "5")`. Both paths
write into the signal via a field lens.

### `T` shape

`T` can be any shape. The `attrs` map only bridges the HTML attribute surface —
which is inherently flat — into signal fields. Nested state lives entirely in
the signal and is never exposed as attributes.

### Lifecycle

```
connectedCallback   → mount(widget, signal, shadowRoot ?? this)
disconnectedCallback → cleanup()
attributeChangedCallback → coerce + signal.set(lens.set(signal.get(), value))
```

Adopted styles are applied once in `connectedCallback` before `mount`.

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
