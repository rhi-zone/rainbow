/**
 * Shared supertype for Lens and Prism.
 *
 * - `view`   — extract B from A; may return undefined (Prism) or always
 *              succeeds (Lens, which narrows the return to B, not B|undefined).
 * - `review` — embed B back into A. Prism implements this as `(b) => A`,
 *              satisfying the `(b, a) => A` signature because TypeScript
 *              allows fewer parameters. Lens uses both `b` and `a` to
 *              preserve surrounding structure.
 *
 * Use `Optic<A, B>` at call sites that accept either optic kind.
 */
export interface Optic<A, B> {
  view(a: A): B | undefined
  review(b: B, a: A): A
}
