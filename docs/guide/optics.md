# Optics

Optics are composable values that focus on a part of a larger structure. Rainbow has three optic types: lenses, prisms, and traversals. All are plain objects — composable, serializable, and testable independently of signals.

## Lens

A `Lens<A, B>` focuses on exactly one `B` within an `A`.

**Laws:**
```
get(set(a, b)) = b          // what you set, you get back
set(a, get(a)) = a          // setting to the current value is a no-op
set(set(a, b1), b2) = set(a, b2)  // last write wins
```

### Constructors

| Function | Description |
|---|---|
| `lens(get, set)` | Construct a lens from get/set functions |
| `field(key)` | Focus on a record field by key |
| `fst()` | Focus on the first element of a tuple `[A, B]` |
| `snd()` | Focus on the second element of a tuple `[A, B]` |
| `id()` | Identity lens — focuses on the whole |
| `composeLens(ab, bc)` | Compose two lenses into one |

### Usage

```ts
import { lens, field, composeLens, fst, snd } from 'rainbow'

// Custom lens
const absLens = lens(
  (n: number) => Math.abs(n),
  (_: number, b: number) => b,
)

// Field lens
type User = { name: string; age: number }
const nameLens = field<User, 'name'>('name')

// Composition
type State = { user: User }
const userNameLens = composeLens(field<State, 'user'>('user'), nameLens)

// Tuple lenses
const pair = signal<[string, number]>(['hello', 42])
const str = pair.focus(fst())
const num = pair.focus(snd())
```

## Prism

A `Prism<A, B>` focuses on one possible case of a sum type. When the case doesn't match, the focused value is `undefined`.

**Laws:**
```
match(inject(b)) = b          // round-trip from B back to A then match returns B
if match(a) = b then inject(b) = a  // if it matches, inject is the inverse
```

### Constructors

| Function | Description |
|---|---|
| `prism(match, inject)` | Construct a prism from match/inject functions |
| `some()` | Focus on the `Some` case of `A \| undefined` |
| `iso(to, from)` | Prism for an isomorphism (always matches) |
| `composePrism(ab, bc)` | Compose two prisms into one |

### Usage

```ts
import { prism, some, iso, composePrism } from 'rainbow'

// Discriminated union
type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }

const circlePrism = prism<Shape, { r: number }>(
  s => s.kind === 'circle' ? s : undefined,
  c => ({ kind: 'circle', ...c }),
)

// Optional
const maybeStr = signal<string | undefined>('hello')
const str = maybeStr.narrow(some())
```

## Traversal

A `Traversal<A, B>` focuses on zero or more `B` values within an `A`. Unlike lenses and prisms, traversals are not reversible — you can read all values or modify them uniformly, but not set them independently.

**Laws:**
```
modify(a, id) = a                              // identity is a no-op
modify(modify(a, f), g) = modify(a, g ∘ f)   // composition (when f, g commute)
```

### Constructors

| Function | Description |
|---|---|
| `traversal(getAll, modify)` | Construct a traversal |
| `each()` | Focus on every element of an array |
| `filtered(pred)` | Focus on elements matching a predicate |
| `nth(index)` | Focus on a single element by index |
| `composeWithLens(lens, t)` | Compose a lens with a traversal |
| `composeTraversal(ab, bc)` | Compose two traversals |

### Usage

```ts
import { each, filtered, nth, composeWithLens, field } from 'rainbow'

type State = { todos: Todo[] }
const state = signal<State>({ todos: [...] })

// All todos
const allTodos = composeWithLens(field('todos'), each<Todo>())
allTodos.getAll(state.get())  // all todo objects
state.set(allTodos.modify(state.get(), t => ({ ...t, done: true })))  // mark all done

// Filtered
const activeTodos = composeWithLens(field('todos'), filtered<Todo>(t => !t.done))
activeTodos.getAll(state.get())  // only undone todos

// By index
const firstTodo = composeWithLens(field('todos'), nth<Todo>(0))
```

## Composition Summary

| Compose | With | Result |
|---|---|---|
| `Lens<A, B>` | `Lens<B, C>` | `Lens<A, C>` |
| `Prism<A, B>` | `Prism<B, C>` | `Prism<A, C>` |
| `Lens<A, B>` | `Traversal<B, C>` | `Traversal<A, C>` |
| `Traversal<A, B>` | `Traversal<B, C>` | `Traversal<A, C>` |
