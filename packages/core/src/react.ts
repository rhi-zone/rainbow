import { useSyncExternalStore } from 'react'
import type { Signal, ReadonlySignal } from './signal.ts'

/**
 * Subscribe to a read-only rainbow signal in a React component.
 *
 * Uses useSyncExternalStore for concurrent-mode safety.
 * The component re-renders whenever the signal value changes.
 *
 * Usage:
 *   const count = useReadonlySignal(activeCount)
 */
export function useReadonlySignal<A>(s: ReadonlySignal<A>): A {
  return useSyncExternalStore(
    (onStoreChange) => s.subscribe(onStoreChange),
    () => s.get(),
    () => s.get(),
  )
}

/**
 * Subscribe to a read-write rainbow signal in a React component.
 *
 * Returns [currentValue, setter] — analogous to useState, but backed
 * by a shared signal rather than local component state.
 *
 * Usage:
 *   const [draft, setDraft] = useSignal(draftSignal)
 */
export function useSignal<A>(s: Signal<A>): [A, (a: A) => void] {
  return [useReadonlySignal(s), (a: A) => s.set(a)]
}
