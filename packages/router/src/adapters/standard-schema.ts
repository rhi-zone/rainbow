import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ParamParser } from '../types.ts'

/**
 * Adapt a Standard Schema validator to a `ParamParser<T>`.
 *
 * Async schemas are not supported at the routing boundary: route matching must
 * be synchronous so the router can produce a `MatchedRoute` in one pass.
 * If `validate` returns a Promise we return `null` (no match) rather than
 * attempting to await it.
 */
export const fromSchema = <T>(schema: StandardSchemaV1<string, T>): ParamParser<T> =>
  (raw) => {
    const result = schema['~standard'].validate(raw)

    // Guard against async schemas — Promises are not supported here.
    if (result instanceof Promise) return null

    if (result.issues !== undefined) return null

    return (result as StandardSchemaV1.SuccessResult<T>).value
  }
