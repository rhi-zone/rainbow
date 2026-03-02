import { describe, it, expect, vi } from 'vitest'
import { signal } from './signal.ts'
import { product, stateful } from './product.ts'
import { fst, snd, lens } from './lens.ts'
import { prism, some } from './prism.ts'

describe('product', () => {
  it('gets pair from both signals', () => {
    const a = signal(1)
    const b = signal('hello')
    expect(product(a, b).get()).toEqual([1, 'hello'])
  })

  it('sets both signals', () => {
    const a = signal(1)
    const b = signal('hello')
    const p = product(a, b)
    p.set([2, 'world'])
    expect(a.get()).toBe(2)
    expect(b.get()).toBe('world')
  })

  it('notifies when first signal changes', () => {
    const a = signal(1)
    const b = signal('x')
    const fn = vi.fn()
    product(a, b).subscribe(fn)
    a.set(2)
    expect(fn).toHaveBeenCalledWith([2, 'x'])
  })

  it('notifies when second signal changes', () => {
    const a = signal(1)
    const b = signal('x')
    const fn = vi.fn()
    product(a, b).subscribe(fn)
    b.set('y')
    expect(fn).toHaveBeenCalledWith([1, 'y'])
  })
})

describe('product.focus via fst/snd', () => {
  it('focuses on first element', () => {
    const a = signal(1)
    const b = signal('hello')
    const p = product(a, b)
    const first = p.focus(fst<number, string>())
    expect(first.get()).toBe(1)
  })

  it('sets first element without touching second', () => {
    const a = signal(1)
    const b = signal('hello')
    const p = product(a, b)
    p.focus(fst<number, string>()).set(99)
    expect(a.get()).toBe(99)
    expect(b.get()).toBe('hello')
  })

  it('focuses on second element', () => {
    const a = signal(1)
    const b = signal('hello')
    expect(product(a, b).focus(snd<number, string>()).get()).toBe('hello')
  })

  it('sets second element without touching first', () => {
    const a = signal(1)
    const b = signal('hello')
    const p = product(a, b)
    p.focus(snd<number, string>()).set('world')
    expect(a.get()).toBe(1)
    expect(b.get()).toBe('world')
  })

  it('notifies fst focus only when first changes', () => {
    const a = signal(1)
    const b = signal('x')
    const fn = vi.fn()
    product(a, b).focus(fst<number, string>()).subscribe(fn)
    b.set('y')   // should not trigger
    a.set(2)     // should trigger
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(2)
  })

  it('notifies snd focus only when second changes', () => {
    const a = signal(1)
    const b = signal('x')
    const fn = vi.fn()
    product(a, b).focus(snd<number, string>()).subscribe(fn)
    a.set(2)     // should not trigger
    b.set('y')   // should trigger
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('y')
  })
})

describe('product batching', () => {
  it('set([a, b]) fires subscribers exactly once', () => {
    const a = signal(1)
    const b = signal('x')
    const p = product(a, b)
    const fn = vi.fn()
    p.subscribe(fn)
    p.set([2, 'y'])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith([2, 'y'])
  })

  it('independent signal updates outside a batch still fire separately', () => {
    const a = signal(1)
    const b = signal('x')
    const p = product(a, b)
    const fn = vi.fn()
    p.subscribe(fn)
    a.set(2)
    b.set('y')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('product.narrow and compositions', () => {
  // Prism that matches the first element only when it is positive
  const positiveFirst = prism<[number, string], number>(
    ([n, _]) => n > 0 ? n : undefined,
    (n) => [n, 'default'],
  )

  it('narrow reads via prism', () => {
    const p = product(signal(5), signal('x'))
    expect(p.narrow(positiveFirst).get()).toBe(5)
  })

  it('narrow returns undefined when prism does not match', () => {
    const p = product(signal(-1), signal('x'))
    expect(p.narrow(positiveFirst).get()).toBeUndefined()
  })

  it('narrow.set writes back via prism', () => {
    const a = signal(1)
    const p = product(a, signal('x'))
    p.narrow(positiveFirst).set(99)
    expect(a.get()).toBe(99)
  })

  it('narrow.narrow composes correctly', () => {
    const a = signal(5)
    const p = product(a, signal('x'))
    const n = p.narrow(positiveFirst)           // Signal<number | undefined>
    const nn = n.narrow(some<number>())         // Signal<number | undefined>
    expect(nn.get()).toBe(5)
    a.set(-1)
    expect(nn.get()).toBeUndefined()
  })

  it('narrow.focus reads through lens on narrowed value', () => {
    const a = signal(42)
    const p = product(a, signal('x'))
    const n = p.narrow(positiveFirst)           // Signal<number | undefined>
    // Lens: number | undefined → string (display)
    const asString = lens<number | undefined, string>(
      (v) => String(v ?? ''),
      (_, s) => (s === '' ? undefined : Number(s)),
    )
    expect(n.focus(asString).get()).toBe('42')
  })

  it('narrow.focus.set writes back through both', () => {
    const a = signal(1)
    const p = product(a, signal('x'))
    const n = p.narrow(positiveFirst)
    const asString = lens<number | undefined, string>(
      (v) => String(v ?? ''),
      (_, s) => (s === '' ? undefined : Number(s)),
    )
    n.focus(asString).set('99')
    expect(a.get()).toBe(99)
  })
})

describe('stateful', () => {
  type Item = { text: string; done: boolean }

  it('starts with init as local state', () => {
    const items = signal<Item[]>([])
    const combined = stateful('', items)
    const draft = combined.focus(fst<string, Item[]>())
    expect(draft.get()).toBe('')
  })

  it('external signal is accessible via snd', () => {
    const items = signal<Item[]>([{ text: 'buy milk', done: false }])
    const combined = stateful('', items)
    const list = combined.focus(snd<string, Item[]>())
    expect(list.get()).toEqual([{ text: 'buy milk', done: false }])
  })

  it('local state changes do not affect external signal', () => {
    const items = signal<Item[]>([])
    const combined = stateful('', items)
    const draft = combined.focus(fst<string, Item[]>())
    draft.set('buy milk')
    expect(items.get()).toEqual([])
    expect(draft.get()).toBe('buy milk')
  })

  it('external signal changes propagate to snd', () => {
    const items = signal<Item[]>([])
    const combined = stateful('', items)
    const list = combined.focus(snd<string, Item[]>())
    items.set([{ text: 'buy milk', done: false }])
    expect(list.get()).toEqual([{ text: 'buy milk', done: false }])
  })

  it('simulates add-todo pattern', () => {
    const items = signal<Item[]>([])
    const combined = stateful('', items)
    const draft = combined.focus(fst<string, Item[]>())
    const list = combined.focus(snd<string, Item[]>())

    // type into draft
    draft.set('buy milk')
    expect(draft.get()).toBe('buy milk')
    expect(list.get()).toEqual([])

    // submit: add to list, clear draft
    list.set([...list.get(), { text: draft.get(), done: false }])
    draft.set('')

    expect(draft.get()).toBe('')
    expect(list.get()).toEqual([{ text: 'buy milk', done: false }])
    expect(items.get()).toEqual([{ text: 'buy milk', done: false }])
  })

  it('two stateful instances have independent local state', () => {
    const items = signal<Item[]>([])
    const a = stateful('draft A', items)
    const b = stateful('draft B', items)
    const draftA = a.focus(fst<string, Item[]>())
    const draftB = b.focus(fst<string, Item[]>())
    draftA.set('changed A')
    expect(draftA.get()).toBe('changed A')
    expect(draftB.get()).toBe('draft B')
  })
})
