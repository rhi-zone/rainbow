import type { ReadonlySignal } from './signal.ts'

/**
 * Conditional signal — propagates the value when `pred` holds, undefined otherwise.
 *
 * Accepts both `ReadonlySignal<A>` and `ReadonlySignal<A | undefined>` so that
 * cond calls can be composed directly:
 *
 *   cond(p, cond(q, w))  ≡  cond(x => q(x) && p(x), w)
 *
 * When the source already carries `undefined` (from a prior `cond` or `narrow`),
 * undefined passes through unchanged — equivalent to short-circuit `&&`.
 *
 * Usage:
 *   const positiveCount = cond(n => n > 0, countSignal)
 *   const positiveEven  = cond(n => n % 2 === 0, positiveCount)
 */
export function cond<A>(pred: (a: A) => boolean, s: ReadonlySignal<A>): ReadonlySignal<A | undefined>
export function cond<A>(pred: (a: A) => boolean, s: ReadonlySignal<A | undefined>): ReadonlySignal<A | undefined>
export function cond<A>(pred: (a: A) => boolean, s: ReadonlySignal<A | undefined>): ReadonlySignal<A | undefined> {
  return s.map(a => (a !== undefined && pred(a)) ? a : undefined)
}
