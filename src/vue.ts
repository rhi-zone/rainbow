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
