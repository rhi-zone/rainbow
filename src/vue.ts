import { customRef, watch, type Ref } from 'vue'
import { signal } from './signal.ts'
import type { Signal, ReadonlySignal } from './signal.ts'

/**
 * Adapt a rainbow Signal<A> to a Vue Ref<A>.
 * Changes to the signal propagate to Vue's reactivity system, and vice versa.
 */
export function signalToRef<A>(s: Signal<A>): Ref<A> {
  return customRef<A>((track, trigger) => {
    s.subscribe(() => trigger())
    return {
      get() {
        track()
        return s.get()
      },
      set(value) {
        s.set(value)
      },
    }
  })
}

/**
 * Adapt a rainbow ReadonlySignal<A> to a read-only Vue Ref<A>.
 */
export function readonlySignalToRef<A>(s: ReadonlySignal<A>): Ref<A> {
  return customRef<A>((track, trigger) => {
    s.subscribe(() => trigger())
    return {
      get() {
        track()
        return s.get()
      },
      set() {
        // read-only — writes are ignored
      },
    }
  })
}

/**
 * Convert a map of signals to a map of Vue Refs in one call.
 *
 * Distinguishes Signal (read-write) from ReadonlySignal (read-only)
 * via duck-typing on the `set` method.
 *
 * Usage:
 *   const { draft, filteredTodos, activeCount } = useSignals({ draft, filteredTodos, activeCount })
 */
export function useSignals<T extends Record<string, Signal<unknown> | ReadonlySignal<unknown>>>(
  signals: T,
): { [K in keyof T]: Ref<T[K] extends Signal<infer A> | ReadonlySignal<infer A> ? A : never> } {
  return Object.fromEntries(
    Object.entries(signals).map(([key, s]) => [
      key,
      'set' in s ? signalToRef(s as Signal<unknown>) : readonlySignalToRef(s),
    ]),
  ) as ReturnType<typeof useSignals<T>>
}

/**
 * Adapt a Vue Ref<A> to a rainbow Signal<A>.
 *
 * Creates a rainbow signal backed by the ref's current value,
 * then keeps them in sync bidirectionally.
 */
export function refToSignal<A>(r: Ref<A>): Signal<A> {
  const s = signal(r.value)

  // ref → signal
  watch(r, (v) => s.set(v))

  // signal → ref
  s.subscribe((v) => { r.value = v })

  return s
}
