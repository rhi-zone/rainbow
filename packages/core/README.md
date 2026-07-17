# @rhi-zone/rainbow

Optics-based reactivity for TypeScript. Seven composable primitives, no framework coupling, no magic.

## What it is

Rainbow gives you structured state management grounded in the algebra of optics. Instead of scattered reactive variables or a centralized store with action boilerplate, you get:

- **Signals** — reactive cells with `get`, `set`, `subscribe`, and `map`.
- **Lenses** — focus on a field of a record, composable and law-abiding.
- **Prisms** — focus on a case of a sum type (discriminated unions, optionals).
- **Traversals** — focus on zero or more values within a collection.
- **Computed** — derive from multiple sources with an explicit dep list.
- **Cond** — conditional propagation, composable like `&&`.
- **Product** — pair two signals into one `Signal<[A, B]>`.

Everything is a plain TypeScript value. No decorators, no global state, no framework requirement.

## Install

```sh
npm install @rhi-zone/rainbow
```

## Quick example

```ts
import { signal, field, computed } from '@rhi-zone/rainbow'

type State = { user: { name: string }; count: number }

const state = signal<State>({ user: { name: 'Alice' }, count: 0 })

// Focus on a nested field — reads and writes go through the lens
const name = state.focus(field('user')).focus(field('name'))

name.get()        // 'Alice'
name.set('Bob')
state.get()       // { user: { name: 'Bob' }, count: 0 }

// Derive from multiple sources
const summary = computed(
  () => `${name.get()} has visited ${state.focus(field('count')).get()} times`,
  [name, state],
)
summary.get()     // 'Bob has visited 0 times'
```

## Docs

Full guides, API reference, and design notes are at the [Rainbow VitePress site](https://rhi.zone/rainbow/).

## License

MIT
