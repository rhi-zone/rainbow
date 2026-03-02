# TODO

## Context

Rainbow emerged from a conversation about why codebases are so large — specifically why UI code is so much bigger than it needs to be. The answer: frameworks give you primitives but no algebra. Derived state requires explicit synchronization; relationships between state are imperative rather than structural.

Unicorn (https://github.com/art-w/unicorn) proves the model works in OCaml with 7 combinators. Rainbow is that insight in TypeScript, with reactivity as the execution layer.

Reference: ~/unicorn_tutorial.ml — read this first. It's 410 lines covering the full algebra.

## The core insight

Optics make structure visible. A lens focuses on a field of a product type; a prism focuses on a case of a sum type. Both are composable values with laws. Reactivity grounded in optics means derived state is structural — you declare relationships, the framework maintains consistency.

The key laws:
- `on lens (a & b) = on lens a & on lens b`  (distributivity)
- `on f (on g w) = on (compose f g) w`  (composition)
- `stateful w dynamic = w`  (dynamic identity)

## Next: define the algebra in TypeScript

Start with types, not implementation. Get the interfaces right first.

### 1. Core types

```ts
// A lens focuses on a field B within a structure A
interface Lens<A, B> {
  get(a: A): B
  set(a: A, b: B): A
}

// A prism focuses on a case B within a sum type A
interface Prism<A, B> {
  match(a: A): B | undefined
  inject(b: B): A
}

// Laws (as property-based tests):
// Lens: get(set(a, b)) = b
// Lens: set(a, get(a)) = a
// Lens: set(set(a, b1), b2) = set(a, b2)
// Prism: match(inject(b)) = b
// Prism: if match(a) = b then inject(b) = a
```

### 2. Composition

```ts
function composeLens<A, B, C>(ab: Lens<A, B>, bc: Lens<B, C>): Lens<A, C>
function composePrism<A, B, C>(ab: Prism<A, B>, bc: Prism<B, C>): Prism<A, C>
```

### 3. Reactivity layer

A `Signal<A>` is a reactive cell holding a value of type A. Reading it tracks the dependency; writing it propagates to dependents.

```ts
interface Signal<A> {
  get(): A
  set(a: A): void
  // derived:
  map<B>(f: (a: A) => B): Signal<B>  // read-only
  focus<B>(lens: Lens<A, B>): Signal<B>  // read-write
}
```

`signal.focus(lens)` is the key primitive — a focused signal reads through the lens and writes back through it. This is what makes `on name input_string` work.

### 4. Laws as tests

Write property-based tests (fast-check) verifying the lens/prism laws before writing any UI layer. The laws are the spec.

## Later

- Traversals (focus on multiple elements — e.g. all items in a list)
- Vue adapter: `Signal<A>` ↔ Vue `Ref<A>`
- React adapter: `Signal<A>` ↔ useState/useSyncExternalStore
- `stateful` combinator for local state encapsulation
- `dynamic` combinator for widget-as-value
- Form primitives: `on field input` pattern
- TodoMVC as the first real test of the model
