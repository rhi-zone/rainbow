# Rainbow

Optics-based reactivity for the web.

Part of the [rhi ecosystem](https://rhi.zone).

## Motivation

Most UI state management frameworks give you primitives but no algebra. Derived state requires explicit synchronization; relationships between state are imperative rather than structural. Rainbow takes a different approach: optics are first-class composable values, and the reactivity system is grounded in laws you can reason about.

The design is grounded in [Unicorn](https://github.com/art-w/unicorn), an OCaml UI library that proves the same model with 7 combinators. Rainbow is that insight in TypeScript, with signals as the execution layer.

## What's implemented

- `Lens<A, B>` — get/set with composition, `field()`, `fst()`, `snd()`, `id()`
- `Prism<A, B>` — match/inject with composition, `some()`, `iso()`
- `Signal<A>` — reactive cell with `map()`, `focus(lens)`, `narrow(prism)`
- `computed()` — derived signal from multiple sources
- `cond()` — conditional combinator with composition law
- `Traversal<A, B>` — `each()`, `filtered()`, `nth()`, `composeWithLens()`, `composeTraversal()`
- `product()` / `stateful()` — pair signals, encapsulate local state
- `batch()` — deferred, deduplicated notification flush
- React adapter — `useSignal()` / `useReadonlySignal()` via `useSyncExternalStore`
- Vue adapter — `signalToRef()`, `readonlySignalToRef()`, `refToSignal()`, `useSignals()`
- TodoMVC — full state in ~65 lines, 14 tests
- Property-based tests (fast-check) — lens/prism/signal/cond laws

## Quick example

```ts
import { signal, field, computed, stateful, fst, snd } from 'rainbow'

type Todo = { id: number; text: string; done: boolean }
type State = { todos: Todo[]; draft: string }

const state = signal<State>({ todos: [], draft: '' })
const todos = state.focus(field('todos'))
const draft = state.focus(field('draft'))

const activeCount = computed(
  () => todos.get().filter(t => !t.done).length,
  [todos],
)
```

## License

MIT
