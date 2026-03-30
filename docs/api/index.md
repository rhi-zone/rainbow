# API Reference

All exports are available from `rainbow` (main package) or `rainbow/react` / `rainbow/vue` for framework adapters.

## Signals

| Export | Type | Description |
|---|---|---|
| `signal(init)` | `Signal<A>` | Create a reactive cell |
| `batch(fn)` | `void` | Defer and deduplicate notifications |
| `computed(fn, deps)` | `ReadonlySignal<T>` | Derive from multiple sources |
| `cond(pred, signal)` | `ReadonlySignal<A \| undefined>` | Conditional propagation |
| `product(a, b)` | `Signal<[A, B]>` | Pair two signals |
| `stateful(init, outer)` | `Signal<[S, A]>` | Attach local state to external signal |

## Lenses

| Export | Type | Description |
|---|---|---|
| `lens(get, set)` | `Lens<A, B>` | Construct a lens |
| `field(key)` | `Lens<A, A[K]>` | Focus on a record field |
| `fst()` | `Lens<[A, B], A>` | Focus on tuple first element |
| `snd()` | `Lens<[A, B], B>` | Focus on tuple second element |
| `id()` | `Lens<A, A>` | Identity lens |
| `composeLens(ab, bc)` | `Lens<A, C>` | Compose two lenses |

## Prisms

| Export | Type | Description |
|---|---|---|
| `prism(match, inject)` | `Prism<A, B>` | Construct a prism |
| `some()` | `Prism<A \| undefined, A>` | Focus on the Some case |
| `iso(to, from)` | `Prism<A, B>` | Isomorphism (always matches) |
| `composePrism(ab, bc)` | `Prism<A, C>` | Compose two prisms |

## Traversals

| Export | Type | Description |
|---|---|---|
| `traversal(getAll, modify)` | `Traversal<A, B>` | Construct a traversal |
| `each()` | `Traversal<B[], B>` | Every element of an array |
| `filtered(pred)` | `Traversal<B[], B>` | Elements matching predicate |
| `nth(index)` | `Traversal<B[], B>` | Single element by index |
| `composeWithLens(lens, t)` | `Traversal<A, C>` | Compose lens with traversal |
| `composeTraversal(ab, bc)` | `Traversal<A, C>` | Compose two traversals |

## React Adapter (`rainbow/react`)

| Export | Type | Description |
|---|---|---|
| `useSignal(s)` | `[A, (a: A) => void]` | Subscribe to a read-write signal |
| `useReadonlySignal(s)` | `A` | Subscribe to a read-only signal |

Uses `useSyncExternalStore` — concurrent-mode safe.

## Vue Adapter (`rainbow/vue`)

| Export | Type | Description |
|---|---|---|
| `signalToRef(s)` | `Ref<A>` | Bidirectional Signal ↔ Ref |
| `readonlySignalToRef(s)` | `Ref<A>` | ReadonlySignal → read-only Ref |
| `useSignals(map)` | `{ [K]: Ref<...> }` | Convert a map of signals to Refs |
| `refToSignal(r)` | `Signal<A>` | Bidirectional Ref ↔ Signal |
