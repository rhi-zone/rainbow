import { describe, it, expect } from 'vitest'
import { lens, composeLens, field, index, id } from './lens.ts'

describe('lens laws', () => {
  const nameLens = field<{ name: string; age: number }, 'name'>('name')

  it('get(set(a, b)) = b', () => {
    const a = { name: 'Alice', age: 30 }
    expect(nameLens.get(nameLens.set(a, 'Bob'))).toBe('Bob')
  })

  it('set(a, get(a)) = a', () => {
    const a = { name: 'Alice', age: 30 }
    expect(nameLens.set(a, nameLens.get(a))).toEqual(a)
  })

  it('set(set(a, b1), b2) = set(a, b2)', () => {
    const a = { name: 'Alice', age: 30 }
    expect(nameLens.set(nameLens.set(a, 'Bob'), 'Carol')).toEqual(nameLens.set(a, 'Carol'))
  })
})

describe('composeLens', () => {
  type Inner = { x: number }
  type Outer = { inner: Inner }

  const innerLens = field<Outer, 'inner'>('inner')
  const xLens = field<Inner, 'x'>('x')
  const outerX = composeLens(innerLens, xLens)

  it('gets through composition', () => {
    expect(outerX.get({ inner: { x: 42 } })).toBe(42)
  })

  it('sets through composition', () => {
    expect(outerX.set({ inner: { x: 1 } }, 99)).toEqual({ inner: { x: 99 } })
  })

  it('obeys get(set(a, b)) = b', () => {
    const a = { inner: { x: 1 } }
    expect(outerX.get(outerX.set(a, 7))).toBe(7)
  })
})

describe('index', () => {
  it('gets element at index 0', () => expect(index<[number, string]>(0).get([1, 'a'])).toBe(1))
  it('sets element at index 0', () => expect(index<[number, string]>(0).set([1, 'a'], 2)).toEqual([2, 'a']))
  it('gets element at index 1', () => expect(index<[number, string]>(1).get([1, 'a'])).toBe('a'))
  it('sets element at index 1', () => expect(index<[number, string]>(1).set([1, 'a'], 'b')).toEqual([1, 'b']))
})

describe('id', () => {
  it('get returns value', () => expect(id<number>().get(5)).toBe(5))
  it('set returns new value', () => expect(id<number>().set(5, 10)).toBe(10))
})
