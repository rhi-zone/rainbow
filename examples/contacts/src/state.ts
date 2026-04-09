/**
 * Contacts state — normalized Record<string, Contact> store with stateful
 * local edit form, product combination, and tagged prism for view/edit mode.
 */

import {
  signal,
  product,
  stateful,
  tagged,
  field,
  index,
  recordOf,
  composeLens,
  type Signal,
} from "@rhi-zone/rainbow"

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  notes: string
}

// Discriminated union for panel mode
export type PanelMode =
  | { mode: "idle" }
  | { mode: "viewing"; contactId: string }
  | { mode: "editing"; contactId: string; draft: Omit<Contact, "id"> }
  | { mode: "creating"; draft: Omit<Contact, "id"> }

// FRICTION: Discriminated union state machines require manual tagged() prisms
// for each variant. With 4 variants you end up writing 4 prisms and you still
// can't easily "transition" between them without touching the raw signal.set().
// There is no state machine helper (e.g. send("startEdit", contactId)) that
// guards valid transitions — all transitions are imperative .set() calls.
export const viewingPrism   = tagged<PanelMode>("mode", "viewing")
export const editingPrism   = tagged<PanelMode>("mode", "editing")
export const creatingPrism  = tagged<PanelMode>("mode", "creating")
export const idlePrism      = tagged<PanelMode>("mode", "idle")

// ── App state ─────────────────────────────────────────────────────────────────

/** Normalized contacts store keyed by ID */
export const contacts = signal<Record<string, Contact>>({})

/** Which panel the user is on */
export const panel = signal<PanelMode>({ mode: "idle" })

// ── Combined product signals ──────────────────────────────────────────────────

/**
 * Product of contacts store + panel mode. This gives a single Signal<[Record, PanelMode]>
 * that re-notifies whenever either changes. Useful for widgets that need both.
 */
export const appState = product(contacts, panel)

// ── Derived lenses ────────────────────────────────────────────────────────────

// Focus into just the contacts map from the product
export const contactsLens = composeLens(index<[Record<string, Contact>, PanelMode], 0>(0), recordOf(field<Contact, "name">("name")))
// ^ gives Lens<[Record<string, Contact>, PanelMode], Record<string, string>> — all names

// FRICTION: composeLens chains are verbose and hard to read. For
// `appState.focus(index(0)).focus(field("name"))` you have to either nest
// .focus() calls (which requires reading the intermediate type from hover)
// or compose up-front with composeLens. Neither is obviously readable at a
// glance. A pipe() or lens path syntax would help: path(contacts, "email").

// ── Stateful form: local draft attached to the contacts signal ────────────────

// The search/filter input lives locally; doesn't pollute the contacts store.
export const contactListState = stateful(
  { query: "", sortBy: "name" as "name" | "email" },
  contacts,
)
// Signal<[{ query, sortBy }, Record<string, Contact>]>

export const searchQuery = contactListState.focus(index(0)).focus(field("query"))
export const sortBy      = contactListState.focus(index(0)).focus(field("sortBy"))
export const contactsMap = contactListState.focus(index(1))

// ── Actions ───────────────────────────────────────────────────────────────────

let nextContactId = 1

export function createContact(draft: Omit<Contact, "id">): Contact {
  const id = `c-${nextContactId++}`
  const contact: Contact = { id, ...draft }
  contacts.set({ ...contacts.get(), [id]: contact })
  return contact
}

export function updateContact(id: string, patch: Partial<Omit<Contact, "id">>): void {
  const existing = contacts.get()[id]
  if (!existing) return
  contacts.set({ ...contacts.get(), [id]: { ...existing, ...patch } })
}

export function deleteContact(id: string): void {
  const next = { ...contacts.get() }
  delete next[id]
  contacts.set(next)
  // If we were viewing/editing this contact, go idle
  const current = panel.get()
  if ((current.mode === "viewing" || current.mode === "editing") && current.contactId === id) {
    panel.set({ mode: "idle" })
  }
}

export function startEdit(id: string): void {
  const contact = contacts.get()[id]
  if (!contact) return
  panel.set({
    mode: "editing",
    contactId: id,
    draft: { name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes },
  })
}

export function startCreate(): void {
  panel.set({ mode: "creating", draft: { name: "", email: "", phone: "", notes: "" } })
}

export function cancelPanel(): void {
  panel.set({ mode: "idle" })
}

export function viewContact(id: string): void {
  panel.set({ mode: "viewing", contactId: id })
}

export function saveEdit(): void {
  const current = panel.get()
  if (current.mode === "editing") {
    updateContact(current.contactId, current.draft)
    panel.set({ mode: "viewing", contactId: current.contactId })
  } else if (current.mode === "creating") {
    const contact = createContact(current.draft)
    panel.set({ mode: "viewing", contactId: contact.id })
  }
}

// ── Derived: filtered + sorted contact list ───────────────────────────────────

export function getFilteredContacts(
  contactsRecord: Record<string, Contact>,
  query: string,
  sortField: "name" | "email",
): Contact[] {
  const q = query.toLowerCase()
  const all = Object.values(contactsRecord)
  const filtered = q
    ? all.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : all
  // FRICTION: Sorting and filtering computed values from multiple signal sources
  // require either computed() with an explicit dep array, or a .map() on a
  // product. Here we use a plain function called inside subscribe, but there is
  // no "reactive selector" shorthand. You end up reimplementing the same
  // subscribe-and-derive loop repeatedly across the codebase.
  return [...filtered].sort((a, b) => a[sortField].localeCompare(b[sortField]))
}
