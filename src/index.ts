// rainbow — optics-based reactivity

export type { Lens } from './lens.ts'
export { lens, composeLens, field, fst, snd, id } from './lens.ts'

export type { Prism } from './prism.ts'
export { prism, composePrism, some, iso } from './prism.ts'

export type { Signal, ReadonlySignal } from './signal.ts'
export { signal } from './signal.ts'
