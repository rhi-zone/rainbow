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

### `match` combinator — discriminated union rendering ✓ done

Already implemented in `rainbow-ui/widget.ts`. Enforces exhaustiveness at compile time,
produces a single container div, eliminates `tagged()` + `narrow()` at call sites.

### `taggedIn` prism ✓ done

`taggedIn<A, K, V>(key, values)` — matches any of several tag values in a discriminated union.
Lives in `packages/core/src/prism.ts`. 3 tests.

### Slot support in `defineElement` ✓ resolved (no code change needed)

Conclusion: shadow DOM slots already work natively. When `shadow: 'open'` (the default),
the widget can include `<slot>` and `<slot name="...">` elements in its output and
children of the custom element project into them automatically. This is how
`app-shell` in busiless works — `shadow: 'open'` + native `<slot>` in `mainEl`.

Light-DOM (`shadow: false`) components can't use slots — that's a browser limitation,
not a framework gap. Components that need child projection should use shadow DOM.
No custom API (`children` prop, named-slot config) is needed — the browser's slot
mechanism is the right answer. Adding a framework-level abstraction would be
complexity without benefit.

### `dynamic()` integration with `defineElement` ✓ resolved (no code change needed)

`dynamic(init, innerWidget)` already works inside `defineElement` with no changes.
`dynamic()` returns `Widget<ExternalProps>`, which is exactly what `defineElement`
expects. Local state is encapsulated via `stateful()` — `defineElement` never sees it.
The inner widget focuses `index(0)` for local state and `index(1)` for external props.
Added JSDoc example on `defineElement` and a test demonstrating the pattern.

### `subscribeNow` helper ✓ done

Already implemented in `widget.ts`. `subscribeNow(s, fn)` = `fn(s.get()); subscribe(s, fn)`.

## Publishing aftermath (May 2026)

Burned versions on npm — cannot reuse:
- `0.1.1` — published by mistake (lower than existing 0.2.0-alpha.0)
- `0.2.0` — published by mistake (tests had widget failures from misconfigured runner)

Both deprecated with messages pointing to 0.1.0. Cannot unpublish: package has registry dependents (`@rhi-zone/rainbow-ui`, `@rhi-zone/rainbow-router`), so npm policy blocks version unpublishing.

Current dist-tags:
- `latest` → `0.1.0` (old but conventionally stable)
- `alpha` → `0.2.0-alpha.1` (current, used by `@dusklight/marinada`)

**Path to next stable:** skip `0.2.0` and `0.1.1`. Next stable should be `0.2.1` or `0.3.0`. Before publishing:
- [ ] Run `bun pm pack --dry-run` and inspect output
- [ ] Run all tests via the configured runners (`packages/core` uses bun test, `packages/ui` and `packages/router` use vitest+happy-dom — `bun test` at the repo root only sees the bun-runner tests and **lies about the others**)
- [ ] Verify exports.types is in correct position (must precede `import`/`require` in conditional exports)
- [ ] Confirm version bump makes sense relative to what's on npm

## Test runner inconsistency

`bun test` at the rainbow repo root tries to run UI/router tests (which need DOM) with bun's runner and fails with "document is not defined". The actual configured runner for those packages is vitest+happy-dom. This is misleading — looks like 93 tests are broken when they aren't.

- [ ] **Make `bun test` skip vitest packages or run them via vitest** — current state misled an agent into thinking 93 tests were failing during the publish disaster.

- [ ] Re-run ecosystem CLAUDE.md propagation (relay/blackboard discipline added upstream)

- [ ] install committed orchestrator hooks (was global, now per-repo)

- [ ] run unified harness sync (CLAUDE.md region + portable hooks)
- [ ] sync ecosystem harness/CLAUDE.md region: run github-io/tooling/propagate-harness-all.sh once clean
