import { describe, it, expect } from 'vitest'
import { each, filtered, nth, composeWithLens, composeTraversal } from './traversal.ts'
import { field } from './lens.ts'

describe('each', () => {
  const t = each<number>()

  it('gets all elements', () => expect(t.getAll([1, 2, 3])).toEqual([1, 2, 3]))
  it('modifies all elements', () => expect(t.modify([1, 2, 3], (x) => x * 2)).toEqual([2, 4, 6]))
  it('identity law: modify(a, id) = a', () => {
    const a = [1, 2, 3]
    expect(t.modify(a, (x) => x)).toEqual(a)
  })
})

describe('filtered', () => {
  const evens = filtered<number>((x) => x % 2 === 0)

  it('gets matching elements', () => expect(evens.getAll([1, 2, 3, 4])).toEqual([2, 4]))
  it('modifies only matching elements', () =>
    expect(evens.modify([1, 2, 3, 4], (x) => x * 10)).toEqual([1, 20, 3, 40]))
  it('leaves non-matching elements alone', () =>
    expect(evens.modify([1, 3, 5], (x) => x * 10)).toEqual([1, 3, 5]))
})

describe('nth', () => {
  const second = nth<string>(1)

  it('gets element at index', () => expect(second.getAll(['a', 'b', 'c'])).toEqual(['b']))
  it('returns empty for out of bounds', () => expect(second.getAll(['a'])).toEqual([]))
  it('modifies element at index', () =>
    expect(second.modify(['a', 'b', 'c'], (s) => s.toUpperCase())).toEqual(['a', 'B', 'c']))
})

describe('composeWithLens', () => {
  type User = { name: string; tags: string[] }
  const tagsLens = field<User, 'tags'>('tags')
  const allTags = composeWithLens(tagsLens, each<string>())

  it('gets all via lens + traversal', () => {
    const u: User = { name: 'Alice', tags: ['a', 'b'] }
    expect(allTags.getAll(u)).toEqual(['a', 'b'])
  })

  it('modifies via lens + traversal', () => {
    const u: User = { name: 'Alice', tags: ['a', 'b'] }
    expect(allTags.modify(u, (s) => s.toUpperCase())).toEqual({
      name: 'Alice',
      tags: ['A', 'B'],
    })
  })
})

describe('composeTraversal', () => {
  const nested = composeTraversal(each<number[]>(), each<number>())

  it('gets all from nested', () =>
    expect(nested.getAll([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]))

  it('modifies all in nested', () =>
    expect(nested.modify([[1, 2], [3, 4]], (x) => x * 2)).toEqual([[2, 4], [6, 8]]))
})
