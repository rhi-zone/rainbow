/**
 * TodoMVC state tests — verifying the model without any framework.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { signal } from '../../../src/index.ts'
import { stateful } from '../../../src/product.ts'
import { fst, snd } from '../../../src/lens.ts'
import { computed } from '../../../src/index.ts'
import type { Todo, Filter } from './state.ts'

// Re-implement state locally so each test gets a fresh instance
function makeStore() {
  const todos = signal<Todo[]>([])
  const filter = signal<Filter>('all')
  const addForm = stateful('', todos)
  const draft = addForm.focus(fst<string, Todo[]>())
  const addFormTodos = addForm.focus(snd<string, Todo[]>())

  let nextId = 1

  const filteredTodos = computed(() => {
    const f = filter.get()
    const all = todos.get()
    if (f === 'active') return all.filter((t) => !t.done)
    if (f === 'completed') return all.filter((t) => t.done)
    return all
  }, [todos, filter])

  const activeCount = computed(() => todos.get().filter((t) => !t.done).length, [todos])
  const allDone = computed(() => todos.get().length > 0 && todos.get().every((t) => t.done), [todos])

  function addTodo() {
    const text = draft.get().trim()
    if (!text) return
    addFormTodos.set([...addFormTodos.get(), { id: nextId++, text, done: false }])
    draft.set('')
  }

  function toggleTodo(id: number) {
    todos.set(todos.get().map((t) => t.id === id ? { ...t, done: !t.done } : t))
  }

  function deleteTodo(id: number) {
    todos.set(todos.get().filter((t) => t.id !== id))
  }

  function editTodo(id: number, text: string) {
    todos.set(todos.get().map((t) => t.id === id ? { ...t, text } : t))
  }

  function clearCompleted() {
    todos.set(todos.get().filter((t) => !t.done))
  }

  function toggleAll() {
    const done = !allDone.get()
    todos.set(todos.get().map((t) => ({ ...t, done })))
  }

  return { todos, filter, draft, filteredTodos, activeCount, allDone, addTodo, toggleTodo, deleteTodo, editTodo, clearCompleted, toggleAll }
}

describe('TodoMVC state', () => {
  it('starts empty', () => {
    const { todos, activeCount } = makeStore()
    expect(todos.get()).toEqual([])
    expect(activeCount.get()).toBe(0)
  })

  it('adds a todo', () => {
    const { todos, draft, addTodo } = makeStore()
    draft.set('buy milk')
    addTodo()
    expect(todos.get()).toHaveLength(1)
    expect(todos.get()[0]!.text).toBe('buy milk')
    expect(todos.get()[0]!.done).toBe(false)
  })

  it('clears draft after adding', () => {
    const { draft, addTodo } = makeStore()
    draft.set('buy milk')
    addTodo()
    expect(draft.get()).toBe('')
  })

  it('ignores empty draft', () => {
    const { todos, draft, addTodo } = makeStore()
    draft.set('   ')
    addTodo()
    expect(todos.get()).toHaveLength(0)
  })

  it('toggles a todo', () => {
    const { todos, draft, addTodo, toggleTodo } = makeStore()
    draft.set('buy milk')
    addTodo()
    const id = todos.get()[0]!.id
    toggleTodo(id)
    expect(todos.get()[0]!.done).toBe(true)
    toggleTodo(id)
    expect(todos.get()[0]!.done).toBe(false)
  })

  it('deletes a todo', () => {
    const { todos, draft, addTodo, deleteTodo } = makeStore()
    draft.set('buy milk')
    addTodo()
    const id = todos.get()[0]!.id
    deleteTodo(id)
    expect(todos.get()).toHaveLength(0)
  })

  it('edits a todo', () => {
    const { todos, draft, addTodo, editTodo } = makeStore()
    draft.set('buy milk')
    addTodo()
    const id = todos.get()[0]!.id
    editTodo(id, 'buy oat milk')
    expect(todos.get()[0]!.text).toBe('buy oat milk')
  })

  it('counts active todos', () => {
    const { activeCount, draft, addTodo, toggleTodo, todos } = makeStore()
    draft.set('a'); addTodo()
    draft.set('b'); addTodo()
    draft.set('c'); addTodo()
    expect(activeCount.get()).toBe(3)
    toggleTodo(todos.get()[0]!.id)
    expect(activeCount.get()).toBe(2)
  })

  it('filters active', () => {
    const { filteredTodos, filter, draft, addTodo, toggleTodo, todos } = makeStore()
    draft.set('a'); addTodo()
    draft.set('b'); addTodo()
    toggleTodo(todos.get()[0]!.id) // mark first done
    filter.set('active')
    expect(filteredTodos.get()).toHaveLength(1)
    expect(filteredTodos.get()[0]!.text).toBe('b')
  })

  it('filters completed', () => {
    const { filteredTodos, filter, draft, addTodo, toggleTodo, todos } = makeStore()
    draft.set('a'); addTodo()
    draft.set('b'); addTodo()
    toggleTodo(todos.get()[0]!.id)
    filter.set('completed')
    expect(filteredTodos.get()).toHaveLength(1)
    expect(filteredTodos.get()[0]!.text).toBe('a')
  })

  it('clears completed', () => {
    const { todos, draft, addTodo, toggleTodo, clearCompleted } = makeStore()
    draft.set('a'); addTodo()
    draft.set('b'); addTodo()
    toggleTodo(todos.get()[0]!.id)
    clearCompleted()
    expect(todos.get()).toHaveLength(1)
    expect(todos.get()[0]!.text).toBe('b')
  })

  it('toggleAll marks all done', () => {
    const { todos, draft, addTodo, toggleAll } = makeStore()
    draft.set('a'); addTodo()
    draft.set('b'); addTodo()
    toggleAll()
    expect(todos.get().every((t) => t.done)).toBe(true)
  })

  it('toggleAll when all done marks all active', () => {
    const { todos, draft, addTodo, toggleAll, allDone } = makeStore()
    draft.set('a'); addTodo()
    draft.set('b'); addTodo()
    toggleAll() // all done
    expect(allDone.get()).toBe(true)
    toggleAll() // all active
    expect(todos.get().every((t) => !t.done)).toBe(true)
  })

  it('allDone is false for empty list', () => {
    const { allDone } = makeStore()
    expect(allDone.get()).toBe(false)
  })
})
