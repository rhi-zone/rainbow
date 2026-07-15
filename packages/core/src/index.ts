// rainbow — optics-based reactivity

export type { Optic } from './optic.ts'
export type { Lens } from './lens.ts'
export { lens, composeLens, field, index, id, arrayOf, recordOf, mapOf } from './lens.ts'

export type { Prism } from './prism.ts'
export { prism, composePrism, some, iso, guard, nullable, tagged, taggedIn } from './prism.ts'

export type { Signal, ReadonlySignal } from './signal.ts'
export { signal, batch } from './signal.ts'

export { computed } from './computed.ts'

export { cond } from './cond.ts'

export { product, stateful } from './product.ts'

export type { Traversal } from './traversal.ts'
export { traversal, each, filtered, nth, composeWithLens, composeTraversal } from './traversal.ts'

export type { AsyncData } from './async-data.ts'
export {
  notAsked, loading, failure, success,
  isNotAsked, isLoading, isFailure, isSuccess,
  map as mapAsyncData,
  mapError,
  chain as chainAsyncData,
  getOrElse,
  fold,
  fromPromise,
  fromAsync,
  fromAsyncImperative,
  toNextValue,
} from './async-data.ts'

export type { QueryResult, MutationResult, MutationState } from './query.ts'
export { query, mutation } from './query.ts'

// Vue adapter (import from 'rainbow/vue' to avoid pulling in Vue as a dependency)
// export { signalToRef, readonlySignalToRef, refToSignal } from './vue.ts'
