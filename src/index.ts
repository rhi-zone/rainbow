// rainbow — optics-based reactivity

export type { Lens } from './lens.ts'
export { lens, composeLens, field, fst, snd, id } from './lens.ts'

export type { Prism } from './prism.ts'
export { prism, composePrism, some, iso } from './prism.ts'

export type { Signal, ReadonlySignal } from './signal.ts'
export { signal, batch } from './signal.ts'

export { computed } from './computed.ts'

export { product, stateful } from './product.ts'

export type { Traversal } from './traversal.ts'
export { traversal, each, filtered, nth, composeWithLens, composeTraversal } from './traversal.ts'

// Vue adapter (import from 'rainbow/vue' to avoid pulling in Vue as a dependency)
// export { signalToRef, readonlySignalToRef, refToSignal } from './vue.ts'
