# Reactivity

Rainbow's reactivity model is built on signals — reactive cells that push updates to subscribers when their value changes. The design is explicit and minimal: no implicit tracking, no scheduler magic.

## Signal

A `Signal<A>` is a reactive cell:
- `get()` — read current value
- `set(a)` — update value and notify subscribers
- `subscribe(fn)` — register a subscriber; returns an unsubscribe function
- `map(f)` — derive a `ReadonlySignal<B>` that updates when the source does
- `focus(lens)` — derive a read-write `Signal<B>` focused through a lens
- `narrow(prism)` — derive a `Signal<B | undefined>` focused through a prism

```ts
import { signal } from 'rainbow'

const name = signal('Alice')
const upper = name.map(s => s.toUpperCase())

const unsub = upper.subscribe(v => console.log(v))
name.set('Bob')  // logs 'BOB'
unsub()          // stop listening
```

## ReadonlySignal

A `ReadonlySignal<A>` has `get()`, `subscribe()`, and `map()` but no `set()`. Returned by `map()` and `computed()`.

## computed

`computed(fn, deps)` derives a signal from multiple sources:

```ts
import { computed } from 'rainbow'

const a = signal(1)
const b = signal(2)
const sum = computed(() => a.get() + b.get(), [a, b])

sum.get()  // 3
a.set(10)
sum.get()  // 12
```

Unlike `signal.map()` (one source), `computed()` accepts any number of dependency signals. It only notifies subscribers when the computed value actually changes (using `Object.is`).

## cond

`cond(pred, signal)` is a conditional combinator. It propagates the value when `pred` holds, and `undefined` otherwise:

```ts
import { cond } from 'rainbow'

const count = signal(5)
const positiveCount = cond(n => n > 0, count)
positiveCount.get()  // 5

count.set(-1)
positiveCount.get()  // undefined
```

`cond` composes — the output of one `cond` can feed the next:

```ts
const positiveEven = cond(n => n % 2 === 0, positiveCount)
// equivalent to cond(n => n > 0 && n % 2 === 0, count)
```

## batch

`batch(fn)` defers and deduplicates notifications until `fn` returns. Batches may nest — flush only happens when the outermost batch completes.

```ts
import { batch } from 'rainbow'

batch(() => {
  a.set(10)
  b.set(20)
  // subscribers notified once, after batch completes
})
```

The deduplication key is the subscriber function itself — if the same subscriber would be triggered multiple times in one batch, it is only called once.

## product and stateful

`product(a, b)` creates a `Signal<[A, B]>` backed by two independent signals. Reads from both; writes decompose and route to each child.

```ts
import { product, signal } from 'rainbow'

const a = signal('hello')
const b = signal(42)
const pair = product(a, b)

pair.get()   // ['hello', 42]
pair.set(['world', 99])  // updates both, batched
```

`stateful(init, outer)` encapsulates local state `S` alongside an external signal `A`:

```ts
import { stateful, signal, fst, snd } from 'rainbow'

const items = signal<string[]>(['a', 'b', 'c'])
const withDraft = stateful('', items)  // Signal<[string, string[]]>

const draft = withDraft.focus(fst())   // Signal<string> — local
const list  = withDraft.focus(snd())   // Signal<string[]> — external
```

This is the pattern for attaching ephemeral UI state to domain data without polluting the domain model.

## Subscriber Deduplication

Subscribers are deduplicated by reference. If the same function is subscribed multiple times (e.g. via a `ProductSignal`), it is only called once per batch. This makes `batch()` safe to use even when signals share subscribers.

## Laws

Rainbow signals satisfy these laws (verified with fast-check property-based tests):

**Lens laws** on `signal.focus(lens)`:
- `s.focus(l).get()` equals `l.get(s.get())`
- After `s.focus(l).set(b)`, `s.focus(l).get()` equals `b`
- Setting to the current value is a no-op (no notification)

**Prism laws** on `signal.narrow(prism)`:
- `s.narrow(p).get()` equals `p.match(s.get())`
- If `p.match(s.get())` is defined, setting via `narrow` round-trips correctly

**cond law**:
- `cond(p, cond(q, w))` is equivalent to `cond(x => q(x) && p(x), w)`
