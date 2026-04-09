/**
 * Contacts app — rainbow-ui rendering.
 *
 * Demonstrates: defineElement, fromAsync, stack + bind, on, narrow/tagged,
 * error display boilerplate, show, eachKeyed.
 */

import {
  signal,
  fromAsync,
  fold,
  tagged,
  field,
  composeLens,
  type Signal,
} from "@rhi-zone/rainbow"
import {
  mount,
  on,
  subscribe,
  register,
  stack,
  narrow,
  eachKeyed,
  show,
  dynamic,
  focus,
  inputWidget,
  textareaWidget,
  type Widget,
} from "@rhi-zone/rainbow-ui/widget"
import { createForm, isDirty, type FormState } from "@rhi-zone/rainbow-ui/form-state"
import { defineElement } from "@rhi-zone/rainbow-ui/elements"

import {
  contacts,
  panel,
  appState,
  searchQuery,
  sortBy,
  contactsMap,
  editingPrism,
  viewingPrism,
  creatingPrism,
  viewContact,
  startEdit,
  startCreate,
  cancelPanel,
  saveEdit,
  deleteContact,
  createContact,
  updateContact,
  getFilteredContacts,
  type Contact,
  type PanelMode,
} from "./state.ts"

// ── Fake network layer ────────────────────────────────────────────────────────

interface ContactsPage { contacts: Contact[]; total: number }

async function fakeFetchContacts(_: AbortSignal): Promise<ContactsPage> {
  await new Promise((res) => setTimeout(res, 400))
  return {
    contacts: [
      { id: "seed-1", name: "Alice Nakamura",  email: "alice@example.com",  phone: "555-0101", notes: "Met at PyCon" },
      { id: "seed-2", name: "Bob Okonkwo",     email: "bob@example.com",    phone: "555-0102", notes: "" },
      { id: "seed-3", name: "Carol Lindqvist", email: "carol@example.com",  phone: "555-0103", notes: "Prefers Slack" },
    ],
    total: 3,
  }
}

async function fakeSaveContact(contact: Contact): Promise<Contact> {
  await new Promise((res) => setTimeout(res, 300))
  if (contact.email === "fail@example.com") throw new Error("Email already in use")
  return contact
}

// ── <contact-card> custom element ─────────────────────────────────────────────

interface ContactCardProps {
  name: string
  email: string
  phone: string
  selected: boolean
}

// FRICTION: defineElement requires you to spell out every observed attribute
// explicitly with its type tag. There is no way to derive the attrs map from
// the TypeScript type automatically. For a 4-field component you write the
// same field names four times: once in the interface, once in `defaults`,
// once in `attrs`, and once in the widget's subscribe handler.
const contactCardWidget: Widget<ContactCardProps> = (s) => {
  const root = document.createElement("div")
  root.className = "contact-card"

  const nameEl  = document.createElement("strong")
  const emailEl = document.createElement("span")
  const phoneEl = document.createElement("span")

  // FRICTION: Every individual text content update is its own subscribe line.
  // With 3 fields: 3 subscribe calls, each doing the same el.textContent = pattern.
  // A bindText(el, signal) helper would collapse each to one line.
  subscribe(s.map((p) => p.name),  (v) => { nameEl.textContent = v })
  subscribe(s.map((p) => p.email), (v) => { emailEl.textContent = v })
  subscribe(s.map((p) => p.phone), (v) => { phoneEl.textContent = v })
  subscribe(s.map((p) => p.selected), (sel) => {
    root.classList.toggle("selected", sel)
    root.setAttribute("aria-selected", String(sel))
  })

  root.appendChild(nameEl)
  root.appendChild(emailEl)
  root.appendChild(phoneEl)

  return { _tag: "div", node: root }
}

defineElement("contact-card", contactCardWidget, { name: "", email: "", phone: "", selected: false }, {
  attrs: { name: "string", email: "string", phone: "string", selected: "boolean" },
  styles: `
    :host { display: block; padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; }
    :host(.selected) { background: #eef; }
    strong { display: block; }
    span { font-size: 0.85em; color: #555; margin-right: 1em; }
  `,
})

// ── Contact list widget ───────────────────────────────────────────────────────

function renderContactList(container: HTMLElement): void {
  // Search input
  const searchEl = document.createElement("input")
  searchEl.type = "search"
  searchEl.placeholder = "Search contacts…"
  searchEl.value = searchQuery.get()
  // FRICTION: bindInput requires a Signal<string> but searchQuery is already a
  // focused signal (Signal<string>). This works, but the setup still requires
  // importing bindInput separately and calling it — there is no "self-binding"
  // widget that comes pre-wired to a named signal. Contrast with React where
  // value={x} onChange={setX} is one JSX expression.
  searchEl.addEventListener("input", () => searchQuery.set(searchEl.value))
  subscribe(searchQuery, (q) => { if (searchEl.value !== q) searchEl.value = q })
  container.appendChild(searchEl)

  // Contact entries list
  const listEl = document.createElement("ul")
  listEl.className = "contact-list"
  container.appendChild(listEl)

  // Derive filtered+sorted list and render it imperatively
  // FRICTION: eachKeyed() is a Widget<A[], DivEl>. But here we're rendering
  // into a <ul> with <contact-card> custom elements, not through a widget
  // combinator. Mixing imperative DOM building with declarative widgets means
  // you can't use eachKeyed here without wrapping everything in a Widget.
  // You end up re-implementing the keyed-list loop manually.
  const cache = new Map<string, { li: HTMLLIElement; cleanup: () => void }>()

  const renderList = () => {
    const q = searchQuery.get()
    const sf = sortBy.get()
    const all = contacts.get()
    const sorted = getFilteredContacts(all, q, sf)
    const selectedId = (() => {
      const p = panel.get()
      return (p.mode === "viewing" || p.mode === "editing") ? p.contactId : null
    })()
    const newKeys = new Set(sorted.map((c) => c.id))

    // Remove stale entries
    for (const [id, entry] of cache) {
      if (!newKeys.has(id)) {
        entry.cleanup()
        entry.li.remove()
        cache.delete(id)
      }
    }

    // Insert/update entries
    for (const contact of sorted) {
      if (!cache.has(contact.id)) {
        const li = document.createElement("li")
        const cardEl = document.createElement("contact-card") as HTMLElement & ContactCardProps
        cardEl.name  = contact.name
        cardEl.email = contact.email
        cardEl.phone = contact.phone
        cardEl.selected = contact.id === selectedId

        const clickHandler = () => viewContact(contact.id)
        cardEl.addEventListener("click", clickHandler)
        li.appendChild(cardEl)
        listEl.appendChild(li)
        cache.set(contact.id, { li, cleanup: () => cardEl.removeEventListener("click", clickHandler) })
      } else {
        // Update existing card element
        const { li } = cache.get(contact.id)!
        const cardEl = li.querySelector("contact-card") as HTMLElement & ContactCardProps | null
        if (cardEl) {
          cardEl.name  = contact.name
          cardEl.email = contact.email
          cardEl.phone = contact.phone
          cardEl.selected = contact.id === selectedId
        }
      }
    }
  }

  // FRICTION: Subscribing to multiple independent signals and rerunning the
  // same function requires either product() + one subscribe, or multiple
  // subscribe calls. Here we need contacts + panel + searchQuery + sortBy.
  // There is no computed() shorthand that can also trigger DOM side-effects —
  // computed() returns a ReadonlySignal, not a void effect. We need a
  // separate effect() or watch() primitive for side-effectful derived logic.
  subscribe(contacts, renderList)
  subscribe(panel, renderList)
  subscribe(searchQuery, renderList)
  subscribe(sortBy, renderList)
  renderList()

  const addBtn = document.createElement("button")
  addBtn.textContent = "+ New Contact"
  addBtn.className = "btn-add"
  addBtn.addEventListener("click", () => startCreate())
  container.appendChild(addBtn)
}

// ── Edit / Create panel form ──────────────────────────────────────────────────

type ContactDraft = Omit<Contact, "id">

const defaultDraft: ContactDraft = { name: "", email: "", phone: "", notes: "" }

const {
  state: editFormState,
  bind: bindField,
  handleSubmit,
  reset: resetForm,
  setErrors,
} = createForm<ContactDraft>({
  defaults: defaultDraft,
  validate: ({ name, email }) => {
    const fieldErrors: Partial<Record<keyof ContactDraft, string[]>> = {}
    if (!name.trim()) fieldErrors.name = ["Name is required"]
    if (!email.trim()) fieldErrors.email = ["Email is required"]
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = ["Invalid email format"]
    return Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}
  },
})

// FRICTION: createForm returns a fixed Signal<FormState<T>>. When the panel
// switches between contacts (or from edit to create), the form's default
// values need to change. But createForm captures `defaults` at construction
// time — there is no `reinitialize(newDefaults)` method. Callers must
// manually update the signal with createFormState(newDraft) and re-call reset().
// This means form re-initialization is an undocumented manual process.

// Sync panel changes into the edit form
subscribe(panel, (p) => {
  if (p.mode === "editing" || p.mode === "creating") {
    const draft = p.mode === "editing" ? p.draft : defaultDraft
    editFormState.set({
      values: { ...draft },
      fieldErrors: {},
      formErrors: [],
      touched: {},
      submitting: false,
      submitCount: 0,
    })
  }
})

// ── Reusable field renderer ───────────────────────────────────────────────────

// FRICTION: There is no "form field" combinator that wraps label + input +
// error display into one Widget<FormState<T>>. Every field in every form
// in the codebase manually builds: a <label>, the bound input widget, an
// error <span>, and a subscribe block to show/hide the error. This is the
// single most-repeated pattern in any form-heavy app.
function renderFormField(
  container: HTMLElement,
  state: Signal<FormState<ContactDraft>>,
  key: keyof ContactDraft,
  label: string,
  inputType: "text" | "email" | "tel" | "textarea" = "text",
): void {
  const wrapper = document.createElement("div")
  wrapper.className = "form-field"

  const labelEl = document.createElement("label")
  labelEl.textContent = label
  wrapper.appendChild(labelEl)

  if (inputType === "textarea") {
    const widget = bindField(key, textareaWidget({ rows: 3 }))
    const el = widget(state)
    wrapper.appendChild(el.node)
  } else {
    const widget = bindField(key, inputWidget({ type: inputType }))
    const el = widget(state)
    wrapper.appendChild(el.node)
    // FRICTION: touched tracking requires attaching a focusout listener to the
    // raw input node. But after bind() the node is inside an El<"input", ...>
    // wrapper. To attach the listener you must call widget(state) to get the
    // El, then access .node — there is no lifecycle hook or composable
    // "mark touched on focusout" behavior built into inputWidget or bindField.
    el.node.addEventListener("focusout", () => {
      const s = state.get()
      state.set({ ...s, touched: { ...s.touched, [key]: true } })
    })
  }

  const errorEl = document.createElement("span")
  errorEl.className = "field-error"
  errorEl.style.display = "none"
  wrapper.appendChild(errorEl)

  // FRICTION: Identical 5-line subscribe block for each field error display.
  // In a form with 4 fields = 4 copies of this block. An inline field()
  // widget that accepted `{ label, errorDisplay: true }` would eliminate this.
  subscribe(state, (s) => {
    const showError = (s.touched[key] === true || s.submitCount > 0) && (s.fieldErrors[key]?.length ?? 0) > 0
    errorEl.style.display = showError ? "" : "none"
    errorEl.textContent = s.fieldErrors[key]?.[0] ?? ""
  })

  container.appendChild(wrapper)
}

// ── Save async signal ─────────────────────────────────────────────────────────

const saveTrigger = signal<Contact>({ id: "", name: "", email: "", phone: "", notes: "" })
const [saveResult, disposeSave] = fromAsync(saveTrigger, (contact, abort) => fakeSaveContact(contact))

// ── Detail / edit panel ───────────────────────────────────────────────────────

function renderDetailPanel(container: HTMLElement): void {
  register(disposeSave)

  // Viewing panel
  const viewPanel = document.createElement("div")
  viewPanel.className = "view-panel"
  viewPanel.style.display = "none"

  const viewName  = document.createElement("h2")
  const viewEmail = document.createElement("p")
  const viewPhone = document.createElement("p")
  const viewNotes = document.createElement("p")
  const editBtn   = document.createElement("button")
  const deleteBtn = document.createElement("button")
  editBtn.textContent   = "Edit"
  deleteBtn.textContent = "Delete"
  editBtn.className   = "btn-edit"
  deleteBtn.className = "btn-delete"

  // FRICTION: Subscribing to panel just to populate text fields means 3 separate
  // assignments inside one subscribe callback. There is no destructuring
  // "bind multiple elements to one signal" helper — you either nest them all
  // in one big subscribe or split into N smaller derived signals with N subscribe calls.
  subscribe(panel, (p) => {
    if (p.mode === "viewing") {
      const contact = contacts.get()[p.contactId]
      if (!contact) return
      viewName.textContent  = contact.name
      viewEmail.textContent = contact.email
      viewPhone.textContent = contact.phone
      viewNotes.textContent = contact.notes || "(no notes)"
    }
  })

  editBtn.addEventListener("click", () => {
    const p = panel.get()
    if (p.mode === "viewing") startEdit(p.contactId)
  })
  deleteBtn.addEventListener("click", () => {
    const p = panel.get()
    if (p.mode === "viewing") {
      if (confirm(`Delete ${contacts.get()[p.contactId]?.name}?`)) deleteContact(p.contactId)
    }
  })

  viewPanel.append(viewName, viewEmail, viewPhone, viewNotes, editBtn, deleteBtn)

  // Edit/Create panel
  const editPanel = document.createElement("div")
  editPanel.className = "edit-panel"
  editPanel.style.display = "none"

  const editTitle = document.createElement("h2")
  subscribe(panel, (p) => { editTitle.textContent = p.mode === "creating" ? "New Contact" : "Edit Contact" })
  editPanel.appendChild(editTitle)

  const formEl = document.createElement("form")
  formEl.className = "contact-form"

  renderFormField(formEl, editFormState, "name",  "Name",  "text")
  renderFormField(formEl, editFormState, "email", "Email", "email")
  renderFormField(formEl, editFormState, "phone", "Phone", "tel")
  renderFormField(formEl, editFormState, "notes", "Notes", "textarea")

  // Form-level error display
  const formErrorEl = document.createElement("div")
  formErrorEl.className = "form-errors"
  formErrorEl.style.display = "none"
  // FRICTION: Form-level errors have the same subscribe+display pattern as
  // field errors. There is no formErrors widget or component; callers write
  // this identical block in every form.
  subscribe(editFormState, (s) => {
    const hasErrors = s.formErrors.length > 0
    formErrorEl.style.display = hasErrors ? "" : "none"
    formErrorEl.textContent = s.formErrors.join("; ")
  })
  formEl.appendChild(formErrorEl)

  // Save status indicator
  const saveStatusEl = document.createElement("div")
  saveStatusEl.className = "save-status"
  // FRICTION: AsyncData fold display is repeated verbatim in every component
  // that does async work. In this app alone it appears in contacts/app.ts,
  // todomvc/app.ts, and async-gallery/app.ts — always the same subscribe +
  // fold + element manipulation pattern.
  subscribe(saveResult, (result) => {
    fold(result, {
      notAsked: () => { saveStatusEl.textContent = "" },
      loading:  () => { saveStatusEl.textContent = "Saving…"; saveStatusEl.className = "save-status loading" },
      failure:  (err) => {
        saveStatusEl.textContent = err instanceof Error ? err.message : String(err)
        saveStatusEl.className = "save-status error"
        setErrors(undefined, [saveStatusEl.textContent])
      },
      success:  () => { saveStatusEl.textContent = "Saved"; saveStatusEl.className = "save-status success" },
    })
  })
  formEl.appendChild(saveStatusEl)

  const submitBtn = document.createElement("button")
  submitBtn.type = "submit"
  submitBtn.textContent = "Save"
  const cancelBtn = document.createElement("button")
  cancelBtn.type = "button"
  cancelBtn.textContent = "Cancel"
  cancelBtn.addEventListener("click", () => cancelPanel())

  formEl.append(submitBtn, cancelBtn)

  formEl.addEventListener("submit", handleSubmit(async (draft) => {
    const p = panel.get()
    let contact: Contact
    if (p.mode === "editing") {
      contact = { id: p.contactId, ...draft }
    } else if (p.mode === "creating") {
      contact = { id: `c-${Date.now()}`, ...draft }
    } else {
      return
    }
    // Trigger async save
    saveTrigger.set(contact)
    // Wait for the save to complete by waiting on saveResult
    // FRICTION: fromAsync provides no Promise-based await path — you must use
    // subscribe() on saveResult and check inside the callback, or poll. For a
    // handleSubmit callback that needs to "await" the save before continuing,
    // there is no clean bridge. We settle for a manual promise wrapper.
    await new Promise<void>((resolve, reject) => {
      const unsub = saveResult.subscribe((r) => {
        if (r.status === "success") {
          unsub()
          if (p.mode === "editing") {
            updateContact(p.contactId, draft)
          } else {
            createContact(draft)
          }
          saveEdit()
          resolve()
        } else if (r.status === "failure") {
          unsub()
          reject(r.error)
        }
      })
    })
  }))

  editPanel.appendChild(formEl)

  // Show/hide panels based on mode
  // FRICTION: Panel visibility logic is entirely manual — two subscribe calls
  // (one for viewPanel, one for editPanel) that toggle style.display. The
  // `show` widget combinator could handle this, but it's a Widget<T, DivEl>
  // combinator, not a utility for raw HTMLElements. There is no showElement(el, predicate, signal) helper.
  subscribe(panel, (p) => {
    viewPanel.style.display = p.mode === "viewing"  ? "" : "none"
    editPanel.style.display = (p.mode === "editing" || p.mode === "creating") ? "" : "none"
  })

  container.appendChild(viewPanel)
  container.appendChild(editPanel)
}

// ── Root bootstrap ─────────────────────────────────────────────────────────────

const initSignal = signal(0) // dummy deps signal for initial fetch
const [initData, disposeInit] = fromAsync(initSignal, (_, abort) => fakeFetchContacts(abort))

subscribe(initData, (result) => {
  fold(result, {
    notAsked: () => {},
    loading:  () => { document.getElementById("loading-banner")?.removeAttribute("hidden") },
    failure:  (err) => {
      const banner = document.getElementById("loading-banner")
      if (banner) { banner.textContent = `Failed to load contacts: ${String(err)}`; banner.setAttribute("role", "alert") }
    },
    success:  ({ contacts: loaded }) => {
      document.getElementById("loading-banner")?.setAttribute("hidden", "")
      // Seed the signal
      const map: Record<string, Contact> = {}
      for (const c of loaded) map[c.id] = c
      contacts.set(map)
    },
  })
})

function bootstrap(): void {
  const root = document.getElementById("app")
  if (!root) throw new Error("No #app element")

  const layout = document.createElement("div")
  layout.className = "contacts-layout"

  const sidebar = document.createElement("div")
  sidebar.className = "sidebar"

  const detail = document.createElement("div")
  detail.className = "detail"

  // FRICTION: The cleanup registry (register()) is only available inside a
  // widget call context set up by mount() or _track(). Calling register()
  // outside of a widget context (e.g. in a top-level bootstrap function) is a
  // silent no-op. There is no app-level cleanup registry, so top-level
  // subscriptions and fromAsync disposers leak unless the caller tracks them manually.
  register(disposeInit)

  renderContactList(sidebar)
  renderDetailPanel(detail)

  layout.appendChild(sidebar)
  layout.appendChild(detail)
  root.appendChild(layout)
}

bootstrap()
