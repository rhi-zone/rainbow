# TODO

## Context

Rainbow emerged from a conversation about why codebases are so large — specifically why UI code is so much bigger than it needs to be. The answer: frameworks give you primitives but no algebra. Derived state requires explicit synchronization; relationships between state are imperative rather than structural.

Unicorn (https://github.com/art-w/unicorn) proves the model works in OCaml with 7 combinators. Rainbow is that insight in TypeScript, with reactivity as the execution layer.

Reference: ~/unicorn_tutorial.ml — read this first. It's 410 lines covering the full algebra.

## Current state

Implemented and tested (90 tests):
- `Lens<A, B>` — get/set with composition, field(), fst(), snd(), id()
- `Prism<A, B>` — match/inject with composition, some(), iso()
- `Signal<A>` — reactive cell with map(), focus(lens), narrow(prism)
- `computed()` — derived signal from multiple sources
- `Traversal<A, B>` — focus on zero or more elements: each(), filtered(), nth()
- `product()` / `stateful()` — pair signals, encapsulate local state
- Vue adapter — signalToRef(), readonlySignalToRef(), refToSignal(), useSignals()
- TodoMVC — full state in ~65 lines, zero effects, 14 tests

## Incremental — done

- [x] Stricter TS config: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [x] Fix narrow.focus / narrow.narrow stubs — exported `focusSignal`/`narrowSignal`, ProductSignal delegates
- [x] Batching: `batch()` in signal.ts; product.set fires subscribers exactly once
- [x] `cond()` combinator — with composition law test
- [x] Property-based tests with fast-check — lens/prism/signal/cond laws in `src/laws.test.ts`
- [x] React adapter — `useSignal()` / `useReadonlySignal()` via `useSyncExternalStore` in `src/react.ts`

## Open questions — router

- **Does `computed` need an effect primitive for the loader model?**
  The router's loader lifecycle is currently implemented imperatively inside
  `createRouter` (subscribe → abort previous → run new loader → set signal).
  An `effect(fn)` primitive — a subscriber that runs a side-effectful function
  when its dependencies change — would make this pattern first-class and reusable
  (e.g. for any async operation, not just loaders). Worth revisiting once there
  are more consumers of the pattern.

## Big unknowns (tackle after incremental)

### async
Data fetching, loading states, errors, retries. This is where the model
either holds or needs extension. Options to explore:
- `AsyncSignal<A>` — a signal over `{ status: 'loading' | 'error' | 'ok', value?: A, error?: unknown }`
- Integrate with TanStack Query at the adapter layer (keep rainbow sync-only)
- A `resource()` primitive inspired by SolidJS

### dynamic combinator
Not in scope. Rainbow has no widget layer, so `dynamic` has no natural home.
The problems it solves (keyed reordering, identity-preserving swap) are better
addressed by making identity explicit in the data model. See `docs/design/dynamic.md`.

### Form primitives
The `on field input_string` pattern from Unicorn.
Rainbow has the pieces (focus + signal), but a form-specific API
(validation, touched/dirty, submission) would make this a compelling
alternative to react-hook-form.

## rainbow-ui backlog

Design doc: `docs/design/ui-elements.md`

### SVG child elements (delegatable — mechanical) ✓ done
Add `CircleEl`, `RectEl`, `EllipseEl`, `LineEl`, `PolylineEl`, `PolygonEl`,
`PathEl`, `TextEl`, `TspanEl`, `GEl`, `DefsEl`, `SymbolEl`, `UseEl`,
`ClipPathEl`, `MaskEl`, `LinearGradientEl`, `RadialGradientEl`, `StopEl`,
`PatternEl`, `SvgImageEl`, `ForeignObjectEl` + matching attr types + a
`SvgContent` category union in `html.ts`. Needs `_svgEl` helper using
`createElementNS("http://www.w3.org/2000/svg", ...)`.

### `on` event helper (small, unblocked) ✓ done
```ts
on(el, "click", fn)  // addEventListener + registers removeEventListener as cleanup
```
Lives in `widget.ts`, exported. Used by form binding helpers.

### Form binding helpers + input widgets (unblocked after `on`) ✓ done
`bindInput`, `bindSelect`, `bindCheckbox` low-level helpers.
Pre-built widgets: `inputWidget`, `textareaWidget`, `selectWidget`,
`checkboxWidget`, `numberInputWidget`. See design doc §3.

### `fromPromise` / `fromAsync` (rainbow core, not rainbow-ui) ✓ done
Signal adapters for async data. `fromAsync` takes deps signal + async fn +
AbortSignal for cancellation. Lives in `@rhi-zone/rainbow`, not rainbow-ui.
See design doc §2 and existing "async" open question above.

### `defineElement` custom element wrapper (blocked on nothing, but non-trivial) ✓ done
`defineElement(tag, widget, defaults, { shadow, attrs, styles })`.
Shadow DOM opt-in, attribute type coercion, JS property accessors, adopted
stylesheets. Lives in rainbow-ui. See design doc §1.

### `match` combinator — discriminated union rendering (unblocked)

Discovered via `examples/contacts/src/machine.ts` state machine example.

The current pattern for rendering an N-state machine:
- N prism declarations via `tagged()`
- N `narrow(widget, prism)` calls wrapped in `stack()`
- N+1 wrapper divs in the DOM
- No compile-time exhaustiveness check

Proposed signature:
```ts
match<S, K extends keyof S & string>(
  key: K,
  cases: { [T in S[K] & string]: Widget<Extract<S, Record<K, T>>> },
): Widget<S, DivEl>
```

This would:
- Produce a single container div (not N narrow + 1 stack div)
- Enforce exhaustiveness at compile time (missing variant = type error)
- Eliminate all `tagged()` and `narrow()` declarations at call sites
- Naturally generalise `fold` (AsyncData) to arbitrary tagged unions

Lives in `rainbow-ui/widget.ts`. Blocked on nothing.

Also needed: `taggedIn<A, K extends keyof A, V extends A[K]>(key: K, values: V[])` — a prism
matching any of several tag values, for the shared-data-across-states pattern
(e.g. `editing | error` both carrying `draft`). Lives in `packages/core/src/prism.ts`.

### `subscribeNow` helper (small, unblocked)

Inside `template` bind fns, the pattern of setting initial DOM values from `s.get()`
and then subscribing for updates repeats everywhere. A helper:
```ts
subscribeNow<T>(s: Signal<T>, fn: (v: T) => void): void
// equivalent to: fn(s.get()); subscribe(s, fn)
```
would halve the lines in every template bind fn. Lives in `widget.ts`.
