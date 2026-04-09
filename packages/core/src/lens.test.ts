import { describe, it, expect } from 'vitest'
import { lens, composeLens, field, index, id, arrayOf, recordOf, mapOf } from './lens.ts'

describe('lens laws', () => {
  const nameLens = field<{ name: string; age: number }, 'name'>('name')

  it('view(review(b, a)) = b', () => {
    const a = { name: 'Alice', age: 30 }
    expect(nameLens.view(nameLens.review('Bob', a))).toBe('Bob')
  })

  it('review(view(a), a) = a', () => {
    const a = { name: 'Alice', age: 30 }
    expect(nameLens.review(nameLens.view(a), a)).toEqual(a)
  })

  it('review(b2, review(b1, a)) = review(b2, a)', () => {
    const a = { name: 'Alice', age: 30 }
    expect(nameLens.review('Carol', nameLens.review('Bob', a))).toEqual(nameLens.review('Carol', a))
  })
})

describe('composeLens', () => {
  type Inner = { x: number }
  type Outer = { inner: Inner }

  const innerLens = field<Outer, 'inner'>('inner')
  const xLens = field<Inner, 'x'>('x')
  const outerX = composeLens(innerLens, xLens)

  it('gets through composition', () => {
    expect(outerX.view({ inner: { x: 42 } })).toBe(42)
  })

  it('sets through composition', () => {
    expect(outerX.review(99, { inner: { x: 1 } })).toEqual({ inner: { x: 99 } })
  })

  it('obeys view(review(b, a)) = b', () => {
    const a = { inner: { x: 1 } }
    expect(outerX.view(outerX.review(7, a))).toBe(7)
  })
})

describe('index', () => {
  it('gets element at index 0', () => expect(index<[number, string], 0>(0).view([1, 'a'])).toBe(1))
  it('sets element at index 0', () => expect(index<[number, string], 0>(0).review(2, [1, 'a'])).toEqual([2, 'a']))
  it('gets element at index 1', () => expect(index<[number, string], 1>(1).view([1, 'a'])).toBe('a'))
  it('sets element at index 1', () => expect(index<[number, string], 1>(1).review('b', [1, 'a'])).toEqual([1, 'b']))
})

describe('id', () => {
  it('view returns value', () => expect(id<number>().view(5)).toBe(5))
  it('review returns new value', () => expect(id<number>().review(10, 5)).toBe(10))
})

type User = { name: string; age: number }
const nameLens = field<User, 'name'>('name')

describe('arrayOf', () => {
  const users: User[] = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]
  const l = arrayOf(nameLens)

  it('gets all values', () => expect(l.view(users)).toEqual(['Alice', 'Bob']))
  it('sets all values', () => expect(l.review(['Carol', 'Dave'], users)).toEqual([
    { name: 'Carol', age: 30 },
    { name: 'Dave', age: 25 },
  ]))
  it('view(review(b, a)) = b', () => {
    const b = ['X', 'Y']
    expect(l.view(l.review(b, users))).toEqual(b)
  })
  it('review(view(a), a) = a', () => expect(l.review(l.view(users), users)).toEqual(users))
})

describe('recordOf', () => {
  const rec: Record<string, User> = { u1: { name: 'Alice', age: 30 }, u2: { name: 'Bob', age: 25 } }
  const l = recordOf(nameLens)

  it('gets all values', () => expect(l.view(rec)).toEqual({ u1: 'Alice', u2: 'Bob' }))
  it('sets all values', () => expect(l.review({ u1: 'Carol', u2: 'Dave' }, rec)).toEqual({
    u1: { name: 'Carol', age: 30 },
    u2: { name: 'Dave', age: 25 },
  }))
  it('view(review(b, a)) = b', () => {
    const b = { u1: 'X', u2: 'Y' }
    expect(l.view(l.review(b, rec))).toEqual(b)
  })
  it('review(view(a), a) = a', () => expect(l.review(l.view(rec), rec)).toEqual(rec))
})

describe('mapOf', () => {
  const m = new Map([['u1', { name: 'Alice', age: 30 }], ['u2', { name: 'Bob', age: 25 }]])
  const l = mapOf(nameLens)

  it('gets all values', () => expect(l.view(m)).toEqual(new Map([['u1', 'Alice'], ['u2', 'Bob']])))
  it('sets all values', () => expect(l.review(new Map([['u1', 'Carol'], ['u2', 'Dave']]), m)).toEqual(
    new Map([['u1', { name: 'Carol', age: 30 }], ['u2', { name: 'Dave', age: 25 }]])
  ))
  it('view(review(b, a)) = b', () => {
    const b = new Map([['u1', 'X'], ['u2', 'Y']])
    expect(l.view(l.review(b, m))).toEqual(b)
  })
  it('review(view(a), a) = a', () => expect(l.review(l.view(m), m)).toEqual(m))
})
