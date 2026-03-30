# Introduction

Rainbow is an optics-based reactivity library for TypeScript. It gives you composable, algebraically-grounded primitives for managing state — without the implicit synchronization that makes most UI frameworks hard to reason about.

## Motivation

Most UI state libraries give you primitives but no algebra. Derived state requires explicit synchronization; relationships between state are imperative rather than structural.

Rainbow takes a different approach. Optics — lenses, prisms, traversals — are first-class composable values. Signals are reactive cells with principled composition. The result is state code that is small, testable, and correct by construction.

The design is grounded in [Unicorn](https://github.com/art-w/unicorn), an OCaml UI library that proves the same model with 7 combinators. Rainbow is that insight in TypeScript, with signals as the execution layer.

## Core Concepts

### Signals

A `Signal<A>` is a reactive cell holding a value of type `A`. Reading is pure; writing propagates to subscribers.

```ts
import { signal, batch } from 'rainbow'

const count = signal(0)
count.set(1)
count.get() // 1
```

Derived signals update automatically:

```ts
const doubled = count.map(n => n * 2)
doubled.get() // 2
count.set(5)
doubled.get() // 10
```

### Lenses

A `Lens<A, B>` focuses on a field of type `B` within a structure of type `A`. It satisfies three laws:

```
get(set(a, b)) = b
set(a, get(a)) = a
set(set(a, b1), b2) = set(a, b2)
```

Use `field()` to focus on a record field, or compose lenses:

```ts
import { signal, field, composeLens } from 'rainbow'

const state = signal({ user: { name: 'Alice', age: 30 } })
const nameLens = composeLens(field('user'), field('name'))
const name = state.focus(nameLens)

name.get()       // 'Alice'
name.set('Bob')
state.get()      // { user: { name: 'Bob', age: 30 } }
```

### Prisms

A `Prism<A, B>` focuses on a case of type `B` within a sum type `A`. It satisfies two laws:

```
match(inject(b)) = b
if match(a) = b then inject(b) = a
```

Use `some()` to focus into an optional value, or `iso()` for an isomorphism:

```ts
import { signal, some } from 'rainbow'

const maybeValue = signal<string | undefined>('hello')
const value = maybeValue.narrow(some())

value.get()   // 'hello'
value.set('world')
maybeValue.get()  // 'world'
```

### Traversals

A `Traversal<A, B>` focuses on zero or more `B` values within `A`. Use `each()` to focus on every element of an array, `filtered()` for a predicate, or `nth()` for a single index:

```ts
import { signal, each, filtered } from 'rainbow'

const items = signal([1, 2, 3, 4, 5])
const evens = filtered<number>(n => n % 2 === 0)
evens.getAll(items.get())  // [2, 4]
```

## TodoMVC Example

The full TodoMVC state fits in ~65 lines with zero effects:

```ts
type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'
type State = { todos: Todo[]; filter: Filter; draft: string }

const state = signal<State>({ todos: [], filter: 'all', draft: '' })
const todos = state.focus(field('todos'))
const filter = state.focus(field('filter'))
const draft = state.focus(field('draft'))

const filteredTodos = computed(() => {
  const f = filter.get()
  return todos.get().filter(t =>
    f === 'all' ? true : f === 'active' ? !t.done : t.done
  )
}, [filter, todos])

const activeCount = computed(
  () => todos.get().filter(t => !t.done).length,
  [todos]
)
```

## Framework Adapters

### React

```ts
import { useSignal, useReadonlySignal } from 'rainbow/react'

function Counter() {
  const [count, setCount] = useSignal(countSignal)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

### Vue

```ts
import { signalToRef, useSignals } from 'rainbow/vue'

// Convert individual signals
const countRef = signalToRef(countSignal)

// Convert a map of signals at once
const { draft, activeCount } = useSignals({ draft, activeCount })
```
