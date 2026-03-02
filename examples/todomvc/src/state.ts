/**
 * TodoMVC state — pure rainbow, no framework.
 *
 * The entire app state is a single signal. All derived values are
 * structural (computed/map), not imperative (no effects).
 */
import { signal, computed } from '../../../src/index.ts'
import { stateful } from '../../../src/product.ts'
import { fst, snd, field } from '../../../src/lens.ts'
import { each, filtered } from '../../../src/traversal.ts'

export type Filter = 'all' | 'active' | 'completed'

export interface Todo {
  id: number
  text: string
  done: boolean
}

// ── App state ────────────────────────────────────────────────────────────────

/** The committed todo list */
export const todos = signal<Todo[]>([])

/** Which filter is active */
export const filter = signal<Filter>('all')

// ── Local state via stateful ─────────────────────────────────────────────────

/** draft text + todo list, with draft encapsulated */
const addForm = stateful('', todos)
export const draft = addForm.focus(fst<string, Todo[]>())
export const addFormTodos = addForm.focus(snd<string, Todo[]>())

// ── Derived state (no effects needed) ───────────────────────────────────────

let nextId = 1

export const filteredTodos = computed(() => {
  const f = filter.get()
  const all = todos.get()
  if (f === 'active') return all.filter((t) => !t.done)
  if (f === 'completed') return all.filter((t) => t.done)
  return all
}, [todos, filter])

export const activeCount = computed(
  () => todos.get().filter((t) => !t.done).length,
  [todos],
)

export const allDone = computed(
  () => todos.get().length > 0 && todos.get().every((t) => t.done),
  [todos],
)

// ── Actions ──────────────────────────────────────────────────────────────────

export function addTodo(): void {
  const text = draft.get().trim()
  if (!text) return
  addFormTodos.set([...addFormTodos.get(), { id: nextId++, text, done: false }])
  draft.set('')
}

export function toggleTodo(id: number): void {
  todos.set(todos.get().map((t) => t.id === id ? { ...t, done: !t.done } : t))
}

export function deleteTodo(id: number): void {
  todos.set(todos.get().filter((t) => t.id !== id))
}

export function editTodo(id: number, text: string): void {
  todos.set(todos.get().map((t) => t.id === id ? { ...t, text } : t))
}

export function clearCompleted(): void {
  todos.set(todos.get().filter((t) => !t.done))
}

export function toggleAll(): void {
  const done = !allDone.get()
  todos.set(todos.get().map((t) => ({ ...t, done })))
}
