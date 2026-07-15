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

- [x] **`signal.patch()` helper.** Added `patch(partial: Partial<A>): void` to the `Signal<A>`
  interface (`packages/core/src/signal.ts`) — `sig.patch({ field: value })` is sugar for
  `sig.set({ ...sig.get(), ...partial })`. Implemented on `RootSignal`, `FocusedSignal`,
  `NarrowedSignal` (signal.ts) and `ProductSignal` (product.ts) — every concrete `Signal`
  implementer. Tests in `signal.test.ts` (`describe('signal.patch')`), including patching
  through a `focus`ed signal.

- [x] **`AsyncBoundary` component** — added to `packages/ui/src/widget.ts`, exported from the
  package root. `AsyncBoundary(s, { loading, failure, success })` mounts the `loading` subtree
  eagerly and the `failure`/`success` subtrees lazily on first occurrence of their state, then
  only ever toggles `display` afterward — never tears down/rebuilds (unlike `foldWidget`,
  which is left as-is for cases that want a fresh child per state change). `notAsked` and
  `loading` share the `loading` widget — no separate render function, since a top-level page
  gate has nothing more meaningful to show before the first request starts. Known limitation:
  because `success`/`failure` are mounted once, a second `success`/`failure` with a *different*
  value/error does not update the already-mounted DOM (no re-render) — acceptable for the
  page-gate use case (loading → success|failure once), not for a value that keeps changing
  after first success. Tests in `widget.test.ts` (`describe('AsyncBoundary')`).

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

### Re-pilot after building the primitives (2026-07-15) — result: still larger, root cause identified

All the gaps above got fixed: `r.*` (`reactive-html.ts`) now has full element coverage with
per-tag attrs (table/thead/tbody/tr/th/td/input/textarea included), `signal.patch()` landed on
every `Signal` implementer, `AsyncBoundary` landed in `widget.ts`. `page-tutor-marking.ts` was
rewritten a **third time** against these now-complete primitives. Result: **934 lines vs. 828
original — still larger, not smaller.**

This settles the question the first pilot left open: the ceiling isn't missing element-builder
coverage. It's architectural. **Rainbow's low-level combinators (focus, narrow, eachKeyed,
match, the new reactive-html builders) are sound, but they've never been composed up to the
*page* level.** Every page in busiless (and presumably every rainbow consumer) hand-assembles
the same shape from raw elements: fetch typed data → render a stats bar → render one or more
tables with row actions → render a detail/edit side panel → wire mutations back to a refetch.
That shape recurs, but rainbow currently offers no named, reusable, typed combinator for any
piece of it above the single-element level.

**Diagnosis, generalized beyond this one page:**
- Application code should never construct raw elements. Every `r.div(...)` / `h.div(...)` at a
  call site is a place where the page author re-derives layout, state-wiring, and design-system
  conventions from scratch instead of calling a named function that already encodes them.
  20-ish design-system-level primitives (card/stack/cluster/metricCard/dataTable/banner, in the
  busiless consumer) already exist; the missing layer is *combinators that compose those
  primitives with typed data*, not more primitives themselves.
- The "everything as data/config" alternative — a big schema object describing columns/tabs/
  actions that a generic renderer interprets — was considered and rejected. A schema is not an
  algebra: it accumulates escape hatches for every case that doesn't fit the shape, and it can't
  be composed, tested, or typed the way a function can. This is rainbow's own founding thesis
  (Unicorn: combinators, not config) — the re-pilot showed it hasn't yet been applied one level
  up, at the page layer.
- The marginal entropy of a genuine page is small: what data to fetch (a type), what columns/
  fields to show, what actions exist and what they transition to. A combinator layer that
  absorbs everything else (loading/error gating, row rendering, panel open/close, tab
  switching, mutation + refetch plumbing) should get a page like this one down to roughly
  **50 lines** of composed, typed combinator calls.

### Page-level combinator layer — landed (2026-07-15)

`packages/ui/src/combinators.ts`, new subpath export `@rhi-zone/rainbow-ui/combinators`, 38 tests
in `combinators.test.ts`:

- [x] **`query<T>(fetcher)`** — typed async data fetch backed by a signal (wraps `fromAsync`),
  giving call sites a `QueryResult<T>` (`state: ReadonlyAsyncSignal<T>`, `refetch()`) without
  hand-rolled fetch + loading-state ceremony. Includes **`query.select(fn, fallback)`** —
  projects a derived `ReadonlySignal<U>` off the query's success value without unwrapping
  `AsyncState` at every call site.
- [x] **`mutation<In, Out>(fn, { onSuccess })`** — write operations with a `MutationResult`
  (`state`, `run(input)`), replacing hand-written fetch + error-handle + state-patch ceremony.
  Includes **`mutationBanner(m)`** — a status banner widget derived from a mutation's state
  (idle/pending/success/error), so call sites don't hand-roll the banner markup.
- [x] **`table<T>(opts)`** — a typed table from data + column definitions (`header` as string or
  computed thunk), internally using row identity for in-place update rather than full rebuild.
  Includes an **`empty`** option (string or widget thunk) rendered in place of the table body
  when the data array is empty, toggled via display rather than teardown/rebuild.
- [x] **`tabs<T, K>(opts)`** — a tab group derived from classifying a dataset, replacing a
  hand-written N-way-tab state machine.
- [x] **`panel<T>(opts)`** — slide-out/side detail panel over a nullable signal (null-safe
  focus), with an **`header`** option (string or `Widget<T>`, rendered inside a `<header>`
  before content; omitted → no header, preserving prior behavior).

**Not built this arc** (deferred, see gaps below): `statsBar<T>(data, fields)` and the outermost
`page(...sections)` combinator — the re-pilot (below) found the page-shell/stats-bar layer isn't
the bottleneck; rendering infrastructure (design-system component wiring) is.

### Re-pilot result (2026-07-15): combinators absorb data-flow infra, not rendering infra

`page-tutor-marking.ts` was rewritten a **fourth** time against `query`/`mutation`/`table`/
`tabs`/`panel`. The combinator layer measurably absorbed data-flow boilerplate (fetch/loading/
error ceremony, mutation+refetch+banner wiring, tab state machine, null-safe panel focus) but
**actual marginal entropy on the page came in at ~285 lines, not the ~50 originally estimated.**
The ~50-line estimate assumed the combinator layer would also absorb *rendering* infrastructure
(design-system component assembly, per-field form layout, confirm-flow UI) — it doesn't, because
that infrastructure was never in scope for these five combinators individually. The remaining
~285 lines are page-specific rendering glue: wiring `table`/`panel`/`tabs` outputs into the
busiless design-system layout, per-column cell renderers, and the confirm-footer pattern below.

### Remaining gaps (next arc)

- [ ] **`confirm` / confirm-action combinator.** The marking page's confirm-footer pattern
  (~48 lines: a pending-confirmation state, a "are you sure" footer with confirm/cancel buttons,
  auto-dismiss/reset on the underlying action changing) is generic — the same shape recurs
  anywhere a destructive or high-stakes action needs a confirm step — but nothing in
  `combinators.ts` absorbs it yet. It stayed hand-rolled in the fourth pilot rewrite.
- [ ] **Widget-typing bridge for busiless design-system components.** Composing rainbow's
  `Widget<T>`/`Signal<T>` primitives with busiless's existing design-system components
  (card/stack/cluster/metricCard/dataTable etc.) currently requires ad hoc `run()`/`VOID_SIG`
  shims at each call site to satisfy the type boundary between the two systems. This is a
  systemic gap, not a one-off — every combinator that renders through a design-system component
  pays this tax. Worth a proper adapter/bridge rather than per-call-site shimming.
- [ ] **Dependent queries** — `query(fetcher, { dependsOn })`, so a second query can key off a
  first query's resolved value (e.g. fetch detail once a list/id is selected) without the call
  site hand-rolling the `computed`/`fromAsync` chaining. Not needed by the marking page pilot but
  came up as an evident near-term need for any master-detail page.

**Benchmark note for future arcs**: re-rewriting the same page a fifth time is not the right next
step — the fourth pilot already established the ceiling of what these five combinators alone can
absorb. The next combinator (`confirm`, or a widget-bridge helper) should be validated by finding
a *second* call site before being called general, per the standing rule below.

### Arc outcome (2026-07-15): `query`/`mutation` kept in core, `table`/`tabs`/`panel`/`mutationBanner` deleted

The fourth pilot rewrite in busiless (`page-tutor-marking.ts`, 934 → 672 lines) was reverted on
the busiless side — the combinators wrapped element construction (compression: fewer characters
to express the same HOW) rather than eliminating it (the page still specified which combinator,
which options, in what order; it never got to specify only WHAT to render). Resulting split,
committed `a3714ec`:

- **`query<T>` and `mutation<In, Out>` moved to `@rhi-zone/rainbow` core** (not `-ui`) as signal
  factories — they belong next to `signal`/`computed`/`AsyncData`/`fromAsync`, not the component
  layer, since they have no UI dependency (an async-to-signal bridge, nothing DOM-specific).
  `QueryResult` now exposes an explicit `dispose()` matching the `fromAsync` precedent.
- **`table`, `tabs`, `panel`, `mutationBanner` deleted from rainbow-ui.** They failed the
  primitive-status test: not irreducible, composable from smaller parts, and application-level
  shape decisions (busiless's specific table/tab/panel conventions) rather than reusable UI
  primitives. The `@rhi-zone/rainbow-ui/combinators` subpath export was removed entirely.
- **Key learning, carried into the next arc**: the combinator approach here was "compression"
  (wrap element construction more concisely) rather than "elimination" (make the page express
  only its marginal entropy — the ~50 lines of genuinely unique decisions: what data, what
  fields, what actions). The right application-level abstraction — something closer to a
  declarative descriptor a page fills in, the way busiless's route-collapse projects HTTP
  routes from an `EntityDescriptor` rather than wrapping route-registration calls — needs to be
  derived bottom-up from what's actually fundamental in a consuming codebase (measured, e.g. via
  `normalize architecture`/`normalize rank`), not designed top-down and pilot-tested after the
  fact. `query`/`mutation` survived this filter because they generalize independent of any one
  page's rendering shape; `table`/`tabs`/`panel` did not.

## Test runner inconsistency

`bun test` at the rainbow repo root tries to run UI/router tests (which need DOM) with bun's runner and fails with "document is not defined". The actual configured runner for those packages is vitest+happy-dom. This is misleading — looks like 93 tests are broken when they aren't.

- [ ] **Make `bun test` skip vitest packages or run them via vitest** — current state misled an agent into thinking 93 tests were failing during the publish disaster.
