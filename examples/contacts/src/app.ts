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
  toNextValue,
  type Signal,
} from "@rhi-zone/rainbow"
import {
  subscribe,
  register,
  watchAll,
  bindShow,
  bindText,
  bindClass,
  bindInput,
  type Widget,
} from "@rhi-zone/rainbow-ui/widget"
import { createForm } from "@rhi-zone/rainbow-ui/form-state"
import { defineElement } from "@rhi-zone/rainbow-ui/elements"

import {
  contacts,
  panel,
  searchQuery,
  sortBy,
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

  bindText(nameEl,  s.map((p) => p.name))
  bindText(emailEl, s.map((p) => p.email))
  bindText(phoneEl, s.map((p) => p.phone))
  bindClass(root, "selected", s.map((p) => p.selected))
  subscribe(s.map((p) => p.selected), (sel) => {
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
  bindInput(searchEl, searchQuery)
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

  watchAll([contacts, panel, searchQuery, sortBy], renderList)

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
  handleSubmit,
  setErrors,
  field: formField,
  formErrors: formErrorsEl,
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

  formEl.appendChild(formField("name",  "Name",  { type: "text" }))
  formEl.appendChild(formField("email", "Email", { type: "email" }))
  formEl.appendChild(formField("phone", "Phone", { type: "tel" }))
  formEl.appendChild(formField("notes", "Notes", { rows: 3 }))

  formEl.appendChild(formErrorsEl())

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
    const r = await toNextValue(saveResult, (v) => v.status === "success" || v.status === "failure")
    if (r.status === "failure") { throw r.error }
    if (p.mode === "editing") {
      updateContact(p.contactId, draft)
    } else {
      createContact(draft)
    }
    saveEdit()
  }))

  editPanel.appendChild(formEl)

  // Show/hide panels based on mode
  bindShow(viewPanel, panel.map((p) => p.mode === "viewing"))
  bindShow(editPanel, panel.map((p) => p.mode === "editing" || p.mode === "creating"))

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
