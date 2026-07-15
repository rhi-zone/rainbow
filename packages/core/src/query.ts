import { signal, type ReadonlySignal } from './signal.ts'
import { computed } from './computed.ts'
import { loading, success, failure, type AsyncData } from './async-data.ts'

/**
 * query / mutation — signal-level async wrappers.
 *
 * Both are pure `Signal`/`computed`/`AsyncData` compositions with no DOM or
 * widget-context dependency, so they live in core alongside their building
 * blocks. Neither auto-registers cleanup the way a DOM-bound helper would —
 * `query` follows the same explicit-`dispose()` convention as
 * `fromAsync`/`fromAsyncImperative` in `async-data.ts`: call `dispose()`
 * yourself, or in a widget context pass it to `register()`.
 */

// ── query ────────────────────────────────────────────────────────────────────

export interface QueryResult<T> {
  /** Signal holding the current async state. */
  readonly state: ReadonlySignal<AsyncData<T>>
  /** Reset to loading and re-call the fetcher. */
  refetch(): void
  /**
   * Derive a computed signal from the success value, falling back to
   * `fallback` while loading or failed. Eliminates the manual
   * `computed(() => { const s = q.state.get(); return s.status === 'success' ? fn(s.value) : fallback })`
   * pattern.
   */
  select<U>(fn: (value: T) => U, fallback: U): ReadonlySignal<U>
  /**
   * Abort any in-flight request and stop further state updates. Call this
   * yourself on teardown, or — in a widget context — pass it to `register()`
   * so it runs automatically on unmount.
   */
  dispose(): void
}

/**
 * Create a reactive query from a fetcher function. Calls the fetcher
 * immediately; `refetch()` resets to loading state and re-calls.
 *
 * Does not require a widget context. Call `dispose()` (or `register(dispose)`
 * in a widget context) to abort any in-flight request on teardown.
 */
export function query<T>(fetcher: () => Promise<T>): QueryResult<T> {
  const state = signal<AsyncData<T>>(loading)
  let controller = new AbortController()
  let disposed = false

  const run = () => {
    controller.abort()
    controller = new AbortController()
    state.set(loading)
    const { signal: abort } = controller
    fetcher().then(
      (v) => { if (!abort.aborted && !disposed) state.set(success(v)) },
      (e) => { if (!abort.aborted && !disposed) state.set(failure(e)) },
    )
  }

  run()

  const dispose = () => {
    disposed = true
    controller.abort()
  }

  const select = <U>(fn: (value: T) => U, fallback: U): ReadonlySignal<U> =>
    computed(() => {
      const s = state.get()
      return s.status === 'success' ? fn(s.value) : fallback
    })

  return { state, refetch: run, select, dispose }
}

// ── mutation ─────────────────────────────────────────────────────────────────

export interface MutationState {
  readonly busy: boolean
  readonly error: Error | undefined
}

export interface MutationResult<In, Out> {
  /** Signal tracking busy/error state. */
  readonly state: ReadonlySignal<MutationState>
  /** Execute the mutation. Sets busy=true during the call. */
  submit(input: In): Promise<Out>
  /** Clear the error state. */
  reset(): void
}

/**
 * Create a reactive mutation wrapper. `submit()` calls the execute function,
 * tracking busy/error state in a signal. Does not require a widget context.
 */
export function mutation<In, Out>(
  execute: (input: In) => Promise<Out>,
  opts?: { onSuccess?: (result: Out) => void },
): MutationResult<In, Out> {
  const state = signal<MutationState>({ busy: false, error: undefined })

  const submit = async (input: In): Promise<Out> => {
    state.set({ busy: true, error: undefined })
    try {
      const result = await execute(input)
      state.set({ busy: false, error: undefined })
      opts?.onSuccess?.(result)
      return result
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      state.set({ busy: false, error })
      throw e
    }
  }

  const reset = () => {
    state.set({ busy: false, error: undefined })
  }

  return { state, submit, reset }
}
