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

## Pilot findings — busiless `page-tutor-marking.ts` (2026-07, 828 lines)

A real 828-line busiless page (`apps/web/src/client/components/tutor/page-tutor-marking.ts` —
stats bar, 3-way tabs, 2 tables, a review side-panel with a feedback textarea) was used as a
benchmark to find rainbow's current limits: rewritten with only today's primitives (no new
combinators), read `reactive-html.ts` / `widget.ts` / `signal.ts` first. Findings:

- [ ] **`signal.patch()` helper.** The get-spread-set ceremony —
  `const c = sig.get(); sig.set({...c, field: value})` — appears ~15 times in one page alone
  (~40 lines). `sig.patch({ field: value })` (or `patch(fn: (c) => Partial<T>)` for
  derived fields) would collapse each site to one line. Especially valuable on nullable
  composite signals (`Signal<Foo | null>`) where `focus`/lens composition doesn't apply
  cleanly without first narrowing away `null`.

- [ ] **`AsyncBoundary` component** — generic loading/success/failure dispatch for
  `Signal<AsyncData<T>>`. `widget.ts` already has `foldWidget` which is *most* of this, but
  it wasn't reachable for a top-level "gate the whole page on load state, keep skeleton/error/
  content permanently mounted with visibility toggle rather than teardown/rebuild" pattern —
  every page re-derives that ~15-line dispatch by hand (skeleton el, error el, content el,
  manual `d.status === ...` visibility wiring). Worth either promoting `foldWidget` in docs as
  the answer, or adding a `AsyncBoundary(loadingWidget, errorWidget, successWidget)` that does
  the "keep all three mounted, toggle display" strategy `foldWidget` doesn't (it tears down
  and rebuilds the inner widget on every state change, which is wrong for a top-level page
  gate where the skeleton has no state worth preserving but re-creating it costs nothing next
  to avoiding needless churn).

- [ ] **Keyed list rendering wired into the DOM/reactive-html builder layer.**
  `eachKeyed` exists in `widget.ts` (Signal-based widget combinator) but `reactive-html.ts`
  (`r.*`, thunk-attribute builders) has no equivalent — and neither module has `table`/`tr`/
  `td`/`th` factories at all (only div/span/headings/lists/basic forms), so a table body of
  rows keyed by id currently has to be hand-rolled with `tbody.replaceChildren()` +
  full-rebuild-on-any-change, exactly the pattern rainbow is supposed to eliminate.

- [ ] **Table + form element coverage gap in `reactive-html.ts` / `h.*`.** Neither the thunk-
  attribute reactive builders (`r.*`) nor the plain reactive hyperscript (`h.*` in
  `widget.ts`) include `table`, `thead`, `tbody`, `tr`, `th`, `td`, `input`, or `textarea` —
  only the static (non-reactive) factories in `html.ts` do. Any page with a data table or a
  form input is forced to drop out of the reactive-hyperscript style entirely for those nodes
  and fall back to manual `bindText`/`bindAttr`/`bindShow`/`bindInput` wiring on
  `document.createElement` nodes. This was the single biggest reason the rewrite didn't shrink
  the page — the persistent-DOM/in-place-update discipline is achievable today, but only by
  hand-writing the wiring `r.*` would otherwise generate, which is *more* code than the
  original nuke-and-rebuild `render()`, not less. Extending `r.*` (and ideally `h.*`) to cover
  table and form elements is the highest-leverage of these five items for this page's shape.

- [ ] **Composite signal decomposition via `focus`/`narrow` in the DOM layer, made the default
  path.** The optics (`focus`, `field`, lenses) exist and `widget.ts`'s `focus` combinator
  works, but it assumes a non-nullable product signal. The review-panel state here is
  `Signal<ReviewPanelState | null>` — the common "detail panel that doesn't exist until
  something is selected" shape — and composing `focus` through that null case wasn't
  straightforward without first hand-rolling a narrow/gate. A guide or helper for
  "`focus` into a field of a *possibly-null* composite signal, only live while non-null"
  would make per-field binding (e.g. a two-way-bound textarea) the natural default instead of
  the manual get/set-with-dedup-guard pattern `bindInput` currently requires call sites to
  half-reimplement for non-`Signal<string>` sources.

- [ ] **Per-section reactive scopes are achievable today but verbose.** Splitting a monolithic
  `render()` into independently-subscribed sections (stats bar reacts only to `statsData`, job
  table only to `data`+`activeTab`, submissions table only to `submissionsData`, etc.) works
  with today's `subscribeNow`/`watchAll`/`register`, and it does fix the real bug this page had
  (a textarea losing focus every keystroke because the whole panel — including the textarea
  the user was typing into — was torn down and rebuilt by a single `render()` reacting to
  every signal, including the one the keystroke itself was writing to). But doing it by hand
  costs real lines: each section needs its own wrapper div + named render function + explicit
  dependency list, where a first-class "reactive scope" primitive (something like
  `scope(widgetFn, deps)`, or leaning harder on `r.*`/`h.*` once they cover tables/forms) could
  fold most of that boilerplate away.

**Net line count**: rewrite came in at 855 lines vs. 828 original — *larger*, not smaller.
The persistent-DOM/in-place-update discipline this pilot was asked to demonstrate is real and
does fix a real bug, but every one of the five gaps above pushed the line count up rather than
down: no `patch()` meant the get-spread-set ceremony survived unchanged; no table/input/
textarea coverage in `r.*`/`h.*` meant manual `bind*` wiring instead of thunk attributes; no
`AsyncBoundary` meant hand-writing the three-way skeleton/error/content gate; no null-safe
`focus` meant manual dedup-guarded two-way binding for the textarea and grade input; no scope
primitive meant a wrapper div + named function per independent section. The original estimate
(30–40% reduction) assumed these primitives already existed in the DOM/table-aware form they'd
need to take — building the primitives first, then re-piloting, is the fair test.

## Test runner inconsistency

`bun test` at the rainbow repo root tries to run UI/router tests (which need DOM) with bun's runner and fails with "document is not defined". The actual configured runner for those packages is vitest+happy-dom. This is misleading — looks like 93 tests are broken when they aren't.

- [ ] **Make `bun test` skip vitest packages or run them via vitest** — current state misled an agent into thinking 93 tests were failing during the publish disaster.
