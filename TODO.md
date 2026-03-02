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
