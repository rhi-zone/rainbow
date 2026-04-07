import { describe, expect, test } from 'vitest'
import {
  notAsked, loading, failure, success,
  isNotAsked, isLoading, isFailure, isSuccess,
  map, mapError, chain, getOrElse, fold,
} from './async-data.ts'

describe('constructors', () => {
  test('notAsked', () => expect(notAsked.status).toBe('notAsked'))
  test('loading',  () => expect(loading.status).toBe('loading'))
  test('failure',  () => expect(failure('oops')).toEqual({ status: 'failure', error: 'oops' }))
  test('success',  () => expect(success(42)).toEqual({ status: 'success', value: 42 }))
})

describe('guards', () => {
  test('isNotAsked', () => expect(isNotAsked(notAsked)).toBe(true))
  test('isLoading',  () => expect(isLoading(loading)).toBe(true))
  test('isFailure',  () => expect(isFailure(failure('e'))).toBe(true))
  test('isSuccess',  () => expect(isSuccess(success(1))).toBe(true))
  test('cross-guards are false', () => {
    expect(isSuccess(notAsked)).toBe(false)
    expect(isSuccess(loading)).toBe(false)
    expect(isSuccess(failure('e'))).toBe(false)
  })
})

describe('map', () => {
  test('transforms success',      () => expect(map(success(2), x => x * 3)).toEqual(success(6)))
  test('passes through notAsked', () => expect(map(notAsked, x => x)).toBe(notAsked))
  test('passes through loading',  () => expect(map(loading, x => x)).toBe(loading))
  test('passes through failure',  () => {
    expect(map(failure('err'), x => x)).toEqual(failure('err'))
  })
})

describe('mapError', () => {
  test('transforms failure',     () => expect(mapError(failure('oops'), e => e + '!')).toEqual(failure('oops!')))
  test('passes through success', () => {
    expect(mapError(success(1), e => e)).toEqual(success(1))
  })
})

describe('chain', () => {
  test('chains on success',          () => expect(chain(success(2), x => success(x + 1))).toEqual(success(3)))
  test('short-circuits on failure',  () => {
    expect(chain(failure('err'), () => success(1))).toEqual(failure('err'))
  })
  test('short-circuits on loading',  () => expect(chain(loading,  () => success(1))).toBe(loading))
  test('short-circuits on notAsked', () => expect(chain(notAsked, () => success(1))).toBe(notAsked))
})

describe('getOrElse', () => {
  test('returns value on success',     () => expect(getOrElse(success(5), 0)).toBe(5))
  test('returns fallback on notAsked', () => expect(getOrElse(notAsked, 0)).toBe(0))
  test('returns fallback on loading',  () => expect(getOrElse(loading,  0)).toBe(0))
  test('returns fallback on failure',  () => expect(getOrElse(failure('e'), 0)).toBe(0))
})

describe('fold', () => {
  const cases = {
    notAsked: () => 'notAsked',
    loading:  () => 'loading',
    failure:  (e: unknown) => `fail:${e}`,
    success:  (v: unknown) => `ok:${v}`,
  }
  test('notAsked', () => expect(fold(notAsked, cases)).toBe('notAsked'))
  test('loading',  () => expect(fold(loading,  cases)).toBe('loading'))
  test('failure',  () => expect(fold(failure('x'), cases)).toBe('fail:x'))
  test('success',  () => expect(fold(success(42), cases)).toBe('ok:42'))
})
