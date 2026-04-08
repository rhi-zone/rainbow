import { signal } from './signal.ts'
import type { ReadonlySignal } from './signal.ts'

/**
 * AsyncData<T, E> — the type of an asynchronous value.
 *
 * Four states:
 *   notAsked — not yet requested
 *   loading  — request in flight
 *   failure  — completed with error
 *   success  — completed with value
 *
 * Modelled as a discriminated union so exhaustive pattern matching is
 * enforced by the type system.
 */

export type AsyncData<T, E = unknown> =
  | { readonly status: 'notAsked' }
  | { readonly status: 'loading' }
  | { readonly status: 'failure'; readonly error: E }
  | { readonly status: 'success'; readonly value: T }

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Singleton for the "not yet requested" state. */
export const notAsked: AsyncData<never, never> = { status: 'notAsked' }
/** Singleton for the "request in flight" state. */
export const loading:  AsyncData<never, never> = { status: 'loading' }

/** Construct a failure value. */
export const failure = <E>(error: E): AsyncData<never, E> =>
  ({ status: 'failure', error })

/** Construct a success value. */
export const success = <T>(value: T): AsyncData<T, never> =>
  ({ status: 'success', value })

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Narrowing guard for the `notAsked` state. */
export const isNotAsked = <T, E>(ad: AsyncData<T, E>): ad is { status: 'notAsked' }                  => ad.status === 'notAsked'
/** Narrowing guard for the `loading` state. */
export const isLoading  = <T, E>(ad: AsyncData<T, E>): ad is { status: 'loading' }                   => ad.status === 'loading'
/** Narrowing guard for the `failure` state. */
export const isFailure  = <T, E>(ad: AsyncData<T, E>): ad is { status: 'failure'; error: E }         => ad.status === 'failure'
/** Narrowing guard for the `success` state. */
export const isSuccess  = <T, E>(ad: AsyncData<T, E>): ad is { status: 'success'; value: T }         => ad.status === 'success'

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

/** Transform the success value, leaving other states untouched. */
export const map = <T, U, E>(
  ad: AsyncData<T, E>,
  f: (value: T) => U,
): AsyncData<U, E> => {
  switch (ad.status) {
    case 'success':  return success(f(ad.value))
    case 'failure':  return ad
    case 'loading':  return loading
    case 'notAsked': return notAsked
  }
}

/** Transform the error value, leaving other states untouched. */
export const mapError = <T, E, F>(
  ad: AsyncData<T, E>,
  f: (error: E) => F,
): AsyncData<T, F> => {
  switch (ad.status) {
    case 'failure':  return failure(f(ad.error))
    case 'success':  return ad
    case 'loading':  return loading
    case 'notAsked': return notAsked
  }
}

/** Chain async operations — flatMap over the success case. */
export const chain = <T, U, E>(
  ad: AsyncData<T, E>,
  f: (value: T) => AsyncData<U, E>,
): AsyncData<U, E> => {
  switch (ad.status) {
    case 'success':  return f(ad.value)
    case 'failure':  return ad
    case 'loading':  return loading
    case 'notAsked': return notAsked
  }
}

/**
 * Unwrap the success value, or return `fallback` for all other states.
 * @param fallback - Value to return when not in the success state.
 */
export const getOrElse = <T, E>(ad: AsyncData<T, E>, fallback: T): T =>
  isSuccess(ad) ? ad.value : fallback

/**
 * Fold over all four states.
 * @param cases - Handlers for each state; all four must be provided.
 */
export const fold = <T, E, R>(
  ad: AsyncData<T, E>,
  cases: {
    notAsked: () => R
    loading:  () => R
    failure:  (error: E) => R
    success:  (value: T) => R
  },
): R => {
  switch (ad.status) {
    case 'notAsked': return cases.notAsked()
    case 'loading':  return cases.loading()
    case 'failure':  return cases.failure(ad.error)
    case 'success':  return cases.success(ad.value)
  }
}

// ---------------------------------------------------------------------------
// Signal adapters
// ---------------------------------------------------------------------------

/**
 * Wrap an already-in-flight promise as a `ReadonlySignal<AsyncData<T, E>>`.
 * Starts in `loading`; transitions to `success` or `failure` when the promise
 * settles. The signal is read-only — it can only be updated by the promise.
 *
 * @example
 * const user = fromPromise(fetchUser(id))
 * // user.get() === loading initially, then success({ ... }) or failure(e)
 */
export function fromPromise<T, E = unknown>(
  promise: Promise<T>,
): ReadonlySignal<AsyncData<T, E>> {
  const s = signal<AsyncData<T, E>>(loading)
  promise.then(
    (v) => s.set(success(v)),
    (e) => s.set(failure(e as E)),
  )
  return s
}

/**
 * Derive a `ReadonlySignal<AsyncData<T, E>>` that re-runs `fn` whenever
 * `deps` changes. Each new run receives a fresh `AbortSignal`; the previous
 * in-flight request is aborted before the next one starts. Starts in
 * `loading` immediately.
 *
 * Returns `[signal, dispose]`. Call `dispose()` when done — it aborts any
 * in-flight request and unsubscribes from `deps`. In a widget context, pass
 * `dispose` to `register()` so it is called automatically on unmount.
 *
 * @example
 * const [results, dispose] = fromAsync(querySignal, (q, abort) =>
 *   fetch(`/api/search?q=${q}`, { signal: abort }).then(r => r.json())
 * )
 * register(dispose)  // clean up when widget unmounts
 */
export function fromAsync<D, T, E = unknown>(
  deps: ReadonlySignal<D>,
  fn: (deps: D, abort: AbortSignal) => Promise<T>,
): [ReadonlySignal<AsyncData<T, E>>, dispose: () => void] {
  const s = signal<AsyncData<T, E>>(loading)
  let controller = new AbortController()

  const run = (d: D) => {
    controller.abort()
    controller = new AbortController()
    s.set(loading)
    const { signal: abortSignal } = controller
    fn(d, abortSignal).then(
      (v) => { if (!abortSignal.aborted) s.set(success(v)) },
      (e) => { if (!abortSignal.aborted) s.set(failure(e as E)) },
    )
  }

  run(deps.get())
  const unsub = deps.subscribe(run)

  const dispose = () => {
    controller.abort()
    unsub()
  }

  return [s, dispose]
}
