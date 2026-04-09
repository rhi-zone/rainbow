/**
 * TodoMVC app — rainbow-ui wiring.
 *
 * Demonstrates: createForm, bind, stack, on, narrow/tagged, fromAsync,
 * template, manual subscribe for async status display.
 */

import {
  signal,
  tagged,
  fromAsync,
  fold,
  type Signal,
} from "@rhi-zone/rainbow"
import {
  mount,
  on,
  subscribe,
  register,
  stack,
  narrow,
  each,
  show,
  template,
  inputWidget,
  type Widget,
} from "@rhi-zone/rainbow-ui/widget"
import {
  createForm,
  type FormState,
} from "@rhi-zone/rainbow-ui/form-state"

import {
  todos,
  filter,
  filteredTodos,
  activeCount,
  allDone,
  addTodo,
  toggleTodo,
  deleteTodo,
  editTodo,
  clearCompleted,
  toggleAll,
  type Todo,
  type Filter,
} from "./state.ts"

// ── Save simulation ───────────────────────────────────────────────────────────
// Fake async persist; in a real app this would be fetch()/db call.
async function fakeSave(todos: Todo[]): Promise<{ savedAt: string }> {
  await new Promise((res) => setTimeout(res, 600))
  if (Math.random() < 0.1) throw new Error("Network error — try again")
  return { savedAt: new Date().toISOString() }
}

// ── Editing state ─────────────────────────────────────────────────────────────

type ViewMode  = { mode: "view";  id: number }
type EditMode  = { mode: "edit";  id: number; draft: string }
type EditState = ViewMode | EditMode

const editState = signal<EditState>({ mode: "view", id: -1 })

// Prism for the active editing variant
const editingPrism = tagged<EditState>("mode", "edit")

// ── New-todo form ─────────────────────────────────────────────────────────────

const { state: newTodoForm, bind, handleSubmit, reset } = createForm({
  defaults: { text: "" },
  validate: ({ text }) => {
    if (!text.trim()) return { fieldErrors: { text: ["Cannot be empty"] } }
    return {}
  },
})

// ── Async save signal ─────────────────────────────────────────────────────────

// Triggered manually — start with notAsked, then drive via fromAsync on demand.
// FRICTION: fromAsync takes a deps signal and re-runs automatically. For
// one-shot imperative triggers (e.g. "save button clicked"), there is no
// built-in helper. You must maintain a separate trigger signal and wire it
// through fromAsync, which couples what is conceptually an event to a signal.
const saveTrigger = signal<Todo[]>([])
const [saveResult, disposeSave] = fromAsync(saveTrigger, (ts) => fakeSave(ts))

// ── Field-error display helper ────────────────────────────────────────────────
// FRICTION: Every form field that wants to display its error needs the same
// 6-line subscribe block. There is no fieldError() helper widget built into
// form-state, so callers repeat this identical pattern for every field.
function renderFieldError(
  container: HTMLElement,
  state: Signal<FormState<{ text: string }>>,
  fieldName: "text",
): void {
  // FRICTION: The `touched` gate + submitCount check must be replicated by
  // the caller manually for every field that shows validation errors.
  subscribe(state, (s) => {
    const show = (s.touched[fieldName] === true || s.submitCount > 0) && (s.fieldErrors[fieldName]?.length ?? 0) > 0
    container.style.display = show ? "" : "none"
    container.textContent = s.fieldErrors[fieldName]?.[0] ?? ""
  })
}

// ── Todo item widget ──────────────────────────────────────────────────────────

const todoItemWidget: Widget<Todo> = template(
  `<li class="todo-item">
    <input type="checkbox" data-ref="checkbox">
    <span class="todo-text" data-ref="label"></span>
    <input type="text" class="todo-edit" data-ref="editInput" style="display:none">
    <button class="btn-edit" data-ref="editBtn">Edit</button>
    <button class="btn-delete" data-ref="deleteBtn">Delete</button>
  </li>`,
  { checkbox: "input", label: "span", editInput: "input", editBtn: "button", deleteBtn: "button" } as const,
  (s, { checkbox, label, editInput, editBtn, deleteBtn }) => {
    // Sync todo values to DOM
    // FRICTION: template bind fn must set initial values AND subscribe —
    // the same s.get() + subscribe(s, ...) double-write is unavoidable because
    // template gives no "run immediately on subscribe" option. Users end up
    // writing the callback twice or pulling it into a named function.
    const syncTodo = (todo: Todo) => {
      checkbox.node.checked = todo.done
      label.node.textContent = todo.text
      editInput.node.value = todo.text
    }
    syncTodo(s.get())
    subscribe(s, syncTodo)

    // Toggle done
    on(checkbox.node, "change", () => toggleTodo(s.get().id))

    // Delete
    on(deleteBtn.node, "click", () => deleteTodo(s.get().id))

    // Enter edit mode
    on(editBtn.node, "click", () => {
      editState.set({ mode: "edit", id: s.get().id, draft: s.get().text })
    })

    // Show/hide edit input vs label based on editState
    // FRICTION: Subscribing to an external signal (editState) from inside a
    // template bind fn is awkward — the signal is not the one the template is
    // focused on. You have to manually call subscribe() with the external
    // signal, which is fine, but it makes the intent less clear and the
    // lifecycle less obvious to readers.
    const syncEditMode = (es: EditState) => {
      const isThisOne = es.mode === "edit" && es.id === s.get().id
      label.node.style.display = isThisOne ? "none" : ""
      editInput.node.style.display = isThisOne ? "" : "none"
      editBtn.node.textContent = isThisOne ? "Cancel" : "Edit"
      if (isThisOne) editInput.node.focus()
    }
    syncEditMode(editState.get())
    subscribe(editState, syncEditMode)

    // Save edit on Enter, cancel on Escape
    on(editInput.node, "keydown", (e) => {
      const id = s.get().id
      if (e.key === "Enter") {
        const text = editInput.node.value.trim()
        if (text) editTodo(id, text)
        editState.set({ mode: "view", id: -1 })
      } else if (e.key === "Escape") {
        editState.set({ mode: "view", id: -1 })
      }
    })
  },
)

// ── Filter tabs widget ────────────────────────────────────────────────────────

const filterLabels: { value: Filter; label: string }[] = [
  { value: "all",       label: "All" },
  { value: "active",    label: "Active" },
  { value: "completed", label: "Completed" },
]

function renderFilterTabs(container: HTMLElement): void {
  for (const { value, label } of filterLabels) {
    const btn = document.createElement("button")
    btn.textContent = label
    btn.dataset["filter"] = value

    // FRICTION: No bind-class or toggleClass helper — every attribute/class
    // that needs to react to a signal requires a manual subscribe block. Here
    // we need to toggle `aria-current` on the active filter button, which
    // means one subscribe call per button.
    subscribe(filter, (f) => {
      btn.setAttribute("aria-current", f === value ? "true" : "false")
      btn.classList.toggle("active", f === value)
    })

    btn.addEventListener("click", () => filter.set(value))
    container.appendChild(btn)
  }
}

// ── Save status display ───────────────────────────────────────────────────────

function renderSaveStatus(container: HTMLElement): void {
  // FRICTION: fold() is a pure data combinator, not a widget. Every time you
  // want to show different UI for each AsyncData state you must write this
  // full subscribe + fold inline. An asyncWidget() or foldWidget() combinator
  // that accepts four child widgets would eliminate this pattern entirely.
  subscribe(saveResult, (result) => {
    fold(result, {
      notAsked: () => { container.textContent = "" },
      loading:  () => { container.textContent = "Saving…"; container.className = "status loading" },
      failure:  (err) => { container.textContent = `Error: ${String(err)}`; container.className = "status error" },
      success:  (res) => { container.textContent = `Saved at ${res.savedAt}`; container.className = "status success" },
    })
  })
}

// ── Root app widget ───────────────────────────────────────────────────────────

function renderApp(root: HTMLElement): void {
  // Save cleanup
  register(disposeSave)

  // ── Header: new-todo form ──────────────────────────────────────────────────
  const formEl = document.createElement("form")
  formEl.className = "new-todo-form"

  // The text field via createForm bind
  // FRICTION: bind() returns a Widget<FormState<T>, E> but mount() wants a
  // Signal<T>. To mount a bound widget you call it directly with the form's
  // state signal rather than using mount(). This asymmetry means bind() and
  // mount() don't compose naturally — callers must know to call
  // `widget(state)` instead of `mount(widget, state, container)`.
  const textWidget = bind("text", inputWidget({ placeholder: "What needs to be done?", class: "new-todo-input" }))
  const inputEl = textWidget(newTodoForm)
  formEl.appendChild(inputEl.node)

  const textErrorEl = document.createElement("span")
  textErrorEl.className = "field-error"
  textErrorEl.style.display = "none"
  formEl.appendChild(textErrorEl)
  renderFieldError(textErrorEl, newTodoForm, "text")

  on(formEl, "submit", handleSubmit(async ({ text }) => {
    addTodo()
    reset()
    // Trigger async save
    saveTrigger.set([...todos.get()])
  }))

  root.appendChild(formEl)

  // ── Toggle-all checkbox ────────────────────────────────────────────────────
  const toggleAllEl = document.createElement("input")
  toggleAllEl.type = "checkbox"
  toggleAllEl.id = "toggle-all"
  toggleAllEl.title = "Toggle all todos"

  // FRICTION: No two-way binding helper for derived/computed booleans. allDone
  // is a ReadonlySignal<boolean> but bindCheckbox() requires a Signal<boolean>.
  // Users must manually wire the subscribe and the change event listener.
  subscribe(allDone, (done) => { toggleAllEl.checked = done })
  toggleAllEl.addEventListener("change", () => toggleAll())
  root.appendChild(toggleAllEl)

  // ── Todo list ──────────────────────────────────────────────────────────────
  // filteredTodos is a ReadonlySignal but each() needs a Signal.
  // FRICTION: The type system distinguishes Signal<T> and ReadonlySignal<T>,
  // but most widget combinators (each, stack, narrow...) only accept Signal<T>.
  // Derived/computed signals that shouldn't be writable still need to be passed
  // as Signal<T> at mount sites, requiring an explicit cast or a wrapper signal.
  const listEl = document.createElement("div")
  listEl.className = "todo-list"

  // We use the underlying todos signal + show for filtering since filteredTodos
  // is readonly. A writable proxy approach:
  const displayTodos = signal(filteredTodos.get())
  subscribe(filteredTodos, (ft) => displayTodos.set(ft))
  register(
    displayTodos.subscribe(() => {}) // keep alive
  )

  const listWidget = each(todoItemWidget)
  const listResult = listWidget(displayTodos)
  listEl.appendChild(listResult.node)
  root.appendChild(listEl)

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = document.createElement("footer")
  footer.className = "todo-footer"

  const countEl = document.createElement("span")
  // FRICTION: Updating a text node based on a signal always requires the same
  // subscribe(sig, v => el.textContent = ...) pattern. There is no text() or
  // textContent() binding helper.
  subscribe(activeCount, (n) => { countEl.textContent = `${n} item${n !== 1 ? "s" : ""} left` })
  footer.appendChild(countEl)

  const tabsEl = document.createElement("nav")
  tabsEl.className = "filter-tabs"
  renderFilterTabs(tabsEl)
  footer.appendChild(tabsEl)

  const clearBtn = document.createElement("button")
  clearBtn.textContent = "Clear completed"
  clearBtn.className = "clear-completed"
  clearBtn.addEventListener("click", () => clearCompleted())
  footer.appendChild(clearBtn)

  root.appendChild(footer)

  // ── Save status bar ────────────────────────────────────────────────────────
  const statusEl = document.createElement("div")
  statusEl.className = "save-status"
  renderSaveStatus(statusEl)
  root.appendChild(statusEl)

  // ── Show/hide footer when there are no todos ───────────────────────────────
  // FRICTION: `show` is a Widget combinator, but here we have a plain DOM
  // element we built imperatively, not a Widget<T>. To conditionally show a
  // manually-built element we fall back to another subscribe block with a
  // style toggle — there is no helper for this pattern.
  subscribe(todos, (ts) => {
    footer.style.display = ts.length === 0 ? "none" : ""
    toggleAllEl.style.display = ts.length === 0 ? "none" : ""
  })
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const rootEl = document.getElementById("app")
if (!rootEl) throw new Error("No #app element")
renderApp(rootEl)
