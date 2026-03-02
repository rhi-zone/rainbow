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

## Incremental (do these first — easier)

### 1. Stricter TypeScript config
Add to tsconfig.json:
- `noUncheckedIndexedAccess: true` — would have caught the nth() array indexing issue
- `exactOptionalPropertyTypes: true`
Fix any errors that arise.

### 2. Fix narrow.focus / narrow.narrow stubs
`ProductSignal.narrow()` returns a signal whose `focus` and `narrow` methods throw.
These are edge cases but should either be implemented or the type system should
prevent calling them (i.e. return a type without those methods).

### 3. Batching for product.set([a, b])
Currently fires subscribers twice (once per child signal).
Options:
- Microtask batching (makes signal async — changes semantics)
- Synchronous batch queue: collect notifications, deduplicate, flush at end of set()
- Document as known limitation and accept for now
Recommendation: implement a simple synchronous batch() utility and use it in product.set.

### 4. cond() combinator
Conditional signal — only propagates when a predicate holds:
```ts
function cond<A>(pred: (a: A) => boolean, s: Signal<A>): ReadonlySignal<A | undefined>
```
Unicorn law: `cond p (cond q w) = cond (fun x -> p x && q x) w`

### 5. Property-based tests with fast-check
The lens/prism laws are currently tested with specific values.
fast-check would verify them for arbitrary inputs:
```ts
import fc from 'fast-check'
// get(set(a, b)) = b  for all a, b
```

### 6. React adapter
Alongside the Vue adapter:
```ts
function useSignal<A>(s: Signal<A>): [A, (a: A) => void]
function useReadonlySignal<A>(s: ReadonlySignal<A>): A
```
Uses useSyncExternalStore internally.

## Big unknowns (tackle after incremental)

### async
Data fetching, loading states, errors, retries. This is where the model
either holds or needs extension. Options to explore:
- `AsyncSignal<A>` — a signal over `{ status: 'loading' | 'error' | 'ok', value?: A, error?: unknown }`
- Integrate with TanStack Query at the adapter layer (keep rainbow sync-only)
- A `resource()` primitive inspired by SolidJS

### dynamic combinator
`dynamic` in Unicorn: a value of type `(widget * state) t`.
The law `stateful w dynamic = w` makes it the most powerful combinator —
enables moving/duplicating stateful components while preserving internal state.
Needs more design thought before implementing.

### Form primitives
The `on field input_string` pattern from Unicorn.
Rainbow has the pieces (focus + signal), but a form-specific API
(validation, touched/dirty, submission) would make this a compelling
alternative to react-hook-form.
