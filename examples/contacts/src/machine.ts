/**
 * examples/contacts/src/machine.ts
 *
 * Contact editor as an explicit state machine.
 *
 * Models the full edit lifecycle as a discriminated union:
 *
 *   idle     — nothing selected, form hidden
 *   editing  — user is editing a draft; save button enabled
 *   saving   — async save in flight; inputs disabled
 *   error    — save failed; error message shown, draft preserved
 *
 * All state transitions are pure functions. The Signal<EditorState> is the
 * single source of truth. Rendering uses Signal.narrow(tagged(...)) for
 * per-state widgets.
 *
 * FRICTION points are marked inline.
 */

import { signal, tagged, field, composeLens, prism } from "@rhi-zone/rainbow"
import type { Signal } from "@rhi-zone/rainbow"
import {
  mount,
  subscribe,
  on,
  narrow,
  stack,
  template,
  type Widget,
} from "@rhi-zone/rainbow-ui/widget"

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Contact {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly notes: string
}

// ── State machine type ────────────────────────────────────────────────────────

export type EditorState =
  | { readonly tag: "idle" }
  | { readonly tag: "editing"; readonly draft: Contact }
  | { readonly tag: "saving";  readonly draft: Contact }
  | { readonly tag: "error";   readonly draft: Contact; readonly message: string }

// ── Prisms for each variant ───────────────────────────────────────────────────

// FRICTION: Even with four named variants, the prisms below don't map 1:1 to
// widget calls — `editing` and `error` share a form widget (see `hasDraftPrism`
// below), so two of these four prisms end up unused at the render site.
// A `match` combinator keyed by tag would eliminate all four declarations.
const idlePrism   = tagged<EditorState>("tag", "idle")
const savingPrism = tagged<EditorState>("tag", "saving")
// editingPrism and errorPrism would be: tagged<EditorState>("tag", "editing") /
// tagged<EditorState>("tag", "error") — not declared because hasDraftPrism covers both.

// ── Transition functions (pure) ───────────────────────────────────────────────

/**
 * Start editing a contact. Only valid from `idle`; a no-op from any other state
 * so callers can fire it unconditionally from list-click handlers.
 */
export function startEdit(contact: Contact): (s: EditorState) => EditorState {
  return (s) => s.tag === "idle" ? { tag: "editing", draft: contact } : s
}

/**
 * Update the draft in place. Only applies in `editing` and `error` states —
 * field changes while saving are dropped (inputs should be disabled in that
 * state anyway).
 */
export function updateDraft(patch: Partial<Contact>): (s: EditorState) => EditorState {
  return (s) => {
    if (s.tag === "editing" || s.tag === "error") {
      return { ...s, draft: { ...s.draft, ...patch } }
    }
    return s
  }
}

/**
 * Begin the async save. Only valid from `editing` and `error`; guarded here
 * so the caller does not need to check.
 */
export function beginSave(s: EditorState): EditorState {
  if (s.tag === "editing" || s.tag === "error") {
    return { tag: "saving", draft: s.draft }
  }
  return s
}

/** Save succeeded — return to idle. */
export function saveSuccess(s: EditorState): EditorState {
  return { tag: "idle" }
}

/**
 * Save failed — surface the error message, preserve the draft so the user
 * does not lose their work.
 */
export function saveFailure(message: string): (s: EditorState) => EditorState {
  return (s) => {
    if (s.tag === "saving") {
      return { tag: "error", draft: s.draft, message }
    }
    return s
  }
}

/**
 * Cancel the edit. Valid from `editing`, `saving`, and `error` — returns to
 * `idle` in all cases. Saving cannot be cancelled mid-flight from the UI, but
 * this transition is available for programmatic cleanup (e.g. unmount).
 */
export function cancelEdit(s: EditorState): EditorState {
  return { tag: "idle" }
}

// ── Async save simulation ─────────────────────────────────────────────────────

async function persistContact(contact: Contact): Promise<void> {
  await new Promise<void>((res) => setTimeout(res, 800))
  if (Math.random() < 0.15) throw new Error("Server returned 500 — try again")
}

// ── Editor signal factory ─────────────────────────────────────────────────────

/**
 * Create the editor signal and wire the save action.
 *
 * Returns:
 *   `state`      — the reactive state signal
 *   `edit`       — start editing a contact
 *   `save`       — trigger async save (guarded: no-op unless in editing/error)
 *   `cancel`     — cancel and return to idle
 */
export function createEditorMachine(): {
  state: Signal<EditorState>
  edit:  (contact: Contact) => void
  save:  () => void
  cancel: () => void
} {
  const state = signal<EditorState>({ tag: "idle" })

  const edit = (contact: Contact): void => {
    state.set(startEdit(contact)(state.get()))
  }

  const save = (): void => {
    const current = state.get()
    // Guard: only fire from editing or error
    if (current.tag !== "editing" && current.tag !== "error") return

    state.set(beginSave(state.get()))
    const draft = (state.get() as { tag: "saving"; draft: Contact }).draft

    persistContact(draft).then(
      () => state.set(saveSuccess(state.get())),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        state.set(saveFailure(message)(state.get()))
      },
    )
  }

  const cancel = (): void => {
    state.set(cancelEdit(state.get()))
  }

  return { state, edit, save, cancel }
}

// ── Per-state widgets ─────────────────────────────────────────────────────────

// FRICTION: The `narrow` combinator renders nothing when the prism does not
// match, which is exactly right. However, every per-state sub-widget must be
// `Widget<StateVariant>` (the narrowed type), not `Widget<EditorState>`. That
// means you cannot share a sub-widget between two variants without duplicating
// it or lifting it to `Widget<EditorState>` with an unsafe cast.
//
// The concrete pain: `editing` and `error` both show the same draft form.
// They only differ in disabled state and whether the error banner is visible.
// Sharing the form widget requires either:
//   (a) defining it over the union of the two narrowed types — messy, not
//       possible via a single `narrow` call, or
//   (b) extracting the common data (`draft`) into a type alias, losing the
//       tag discrimination at the Widget level.
//
// Below we choose (b): define a `HasDraft` helper type and write one form
// widget for it, then use `show` for the error banner.

type HasDraft = { readonly tag: "editing" | "error"; readonly draft: Contact }

// FRICTION: This helper prism is hand-written because the two variants share
// a structural sub-type (`HasDraft`) but are not expressible as a single
// `tagged()` call. There is no `taggedIn("tag", ["editing", "error"])` variant
// of `tagged`. You write the match/inject manually or repeat the widget.
const hasDraftPrism = prism<EditorState, HasDraft>(
  (s) => (s.tag === "editing" || s.tag === "error") ? s as HasDraft : undefined,
  // inject: the narrowed type extends EditorState, safe upcast
  (b) => b,
)

// ── Draft form (shared between editing and error states) ──────────────────────

// FRICTION: To get a Signal<Contact> from Signal<HasDraft>, we need to compose
// two field lenses. The `field("draft")` lens is straightforward, but
// `composeLens` requires explicit typing and the result is `Signal<Contact>` —
// which is what we want. However, this means every field in the form needs
// a full lens composition, not just `field("name")`. The ergonomics are fine
// but verbose compared to a language that could destructure directly.
//
// Compare to a React component: `const { name, email, notes } = draft` — three
// words vs six (one `focus(composeLens(field("draft"), field("name")))` per field).

function draftFormWidget(
  save: () => void,
  cancel: () => void,
): Widget<HasDraft> {
  return template(
    `<div class="contact-form">
      <div class="field">
        <label>Name</label>
        <input data-ref="name" type="text" />
      </div>
      <div class="field">
        <label>Email</label>
        <input data-ref="email" type="email" />
      </div>
      <div class="field">
        <label>Notes</label>
        <textarea data-ref="notes"></textarea>
      </div>
      <div class="error-banner" data-ref="errorBanner" style="display:none"></div>
      <div class="form-actions">
        <button data-ref="saveBtn" type="button">Save</button>
        <button data-ref="cancelBtn" type="button">Cancel</button>
      </div>
    </div>`,
    {
      name:        "input",
      email:       "input",
      notes:       "textarea",
      errorBanner: "div",
      saveBtn:     "button",
      cancelBtn:   "button",
    } as const,
    (s, { name, email, notes, errorBanner, saveBtn, cancelBtn }) => {
      // FRICTION: template's bind fn must manually reach into s.get().draft
      // for initial values, then subscribe for updates. Because `s` is
      // `Signal<HasDraft>` (not `Signal<Contact>`), we can't use `bindInput`
      // directly — it needs `Signal<string>`, not `Signal<HasDraft>`. We end
      // up subscribing to `s` and updating DOM nodes manually, or we call
      // `s.focus(composeLens(field("draft"), field("name")))` to get a
      // `Signal<string>`.
      //
      // Neither is bad in isolation, but both add lines compared to a JSX
      // component that can just write `value={draft.name}` with two-way
      // binding implied by the framework.

      const draftLens = field<HasDraft, "draft">("draft")
      const nameSig   = s.focus(composeLens(draftLens, field<Contact, "name">("name")))
      const emailSig  = s.focus(composeLens(draftLens, field<Contact, "email">("email")))
      const notesSig  = s.focus(composeLens(draftLens, field<Contact, "notes">("notes")))

      // Two-way bind each field
      name.node.value = nameSig.get()
      on(name.node, "input", () => nameSig.set(name.node.value))
      subscribe(nameSig, (v) => { if (name.node.value !== v) name.node.value = v })

      email.node.value = emailSig.get()
      on(email.node, "input", () => emailSig.set(email.node.value))
      subscribe(emailSig, (v) => { if (email.node.value !== v) email.node.value = v })

      notes.node.value = notesSig.get()
      on(notes.node, "input", () => notesSig.set(notes.node.value))
      subscribe(notesSig, (v) => { if (notes.node.value !== v) notes.node.value = v })

      // FRICTION: shared data (draft) appears in editing/saving/error.
      // The `saving` variant does not go through this form widget — it goes
      // through the separate `savingWidget` below. So draft is NOT repeated
      // across widgets here. However, if we had wanted to show the draft
      // read-only during saving (a common UX), we would need either:
      //   (a) a third widget almost identical to this one but with readonly inputs, or
      //   (b) a `show` gate on the disabled attribute, controlled by narrowing
      //       the parent state, which requires the parent signal to be in scope.
      // Neither is clean with the current combinator set.

      // Error banner — visible only in `error` state
      // FRICTION: We must peek at the tag through the `HasDraft` opaque type.
      // `s.get().tag` is available but the type of `s` is `Signal<HasDraft>`,
      // and `HasDraft.tag` is `"editing" | "error"`. So we can check it, but
      // we cannot call `s.narrow(errorPrism)` from here because `errorPrism`
      // is over `EditorState`, not `HasDraft`. To show the banner conditionally
      // we subscribe to `s` and branch on the tag manually.
      subscribe(s, (hs) => {
        if (hs.tag === "error") {
          errorBanner.node.textContent = hs.message
          errorBanner.node.style.display = ""
        } else {
          errorBanner.node.style.display = "none"
        }
      })
      // Initial state
      const initial = s.get()
      if (initial.tag === "error") {
        errorBanner.node.textContent = initial.message
        errorBanner.node.style.display = ""
      }

      // Disabled state during saving: not applicable here (form only shown in
      // editing/error), but if we wanted to disable inputs while `saving` was
      // reached via a different path we would need the parent state signal.

      on(saveBtn.node, "click", () => save())
      on(cancelBtn.node, "click", () => cancel())
    },
  )
}

// ── Idle widget ───────────────────────────────────────────────────────────────

// FRICTION: `narrow(w, prism)` gives us `Widget<EditorState, DivEl>` where
// the inner widget only renders when the prism matches. For the `idle` state
// this is just a placeholder prompt — essentially a single text node inside a
// div. There is no "text node widget" or `pure` combinator, so we write a
// minimal custom `Widget<{ tag: "idle" }>`. The inline closure is short here,
// but the pattern of "one narrow per state variant, each producing a fresh
// div wrapper" creates four nested divs in the DOM for a four-state machine.
// A `match` combinator (see Friction Report) would collapse this to one div.

const idleWidget: Widget<{ tag: "idle" }> = (_s) => {
  const node = document.createElement("div")
  node.className = "contact-editor-idle"
  node.textContent = "Select a contact to edit."
  return { _tag: "div", node }
}

// ── Saving widget ─────────────────────────────────────────────────────────────

// FRICTION: The `saving` state carries `draft`, but this widget only shows a
// spinner — it never touches `draft`. Yet the prism gives us
// `Signal<{ tag: "saving"; draft: Contact }>`. The draft data is "in the
// signal" but unused. That is harmless, but it highlights that the type
// carries more information than the widget consumes. A `match` combinator
// that takes the whole state and dispatches by tag would feel more natural
// for stateful widgets that don't need the per-variant payload.

const savingWidget: Widget<{ tag: "saving"; draft: Contact }> = (_s) => {
  const node = document.createElement("div")
  node.className = "contact-editor-saving"
  node.innerHTML = `<div class="spinner" aria-label="Saving…"></div><p>Saving…</p>`
  return { _tag: "div", node }
}

// ── Full editor widget ────────────────────────────────────────────────────────

/**
 * Renders the contact editor. The outer widget receives `Signal<EditorState>`;
 * each per-state sub-widget is reached via `narrow(tagged(...))`.
 *
 * FRICTION: The render pattern for a four-state machine requires four
 * `narrow(widget, prism)` calls, each producing a `Widget<EditorState, DivEl>`.
 * These four calls must then be composed — here via `stack`, which renders all
 * four and lets each `narrow` show/hide its content.
 *
 * The result is that all four divs are always in the DOM (because `narrow`
 * renders a container immediately and mounts/unmounts its child when the prism
 * matches, but the container div itself is always present). That is correct
 * semantics, but produces this DOM structure:
 *
 *   <div data-stack>
 *     <div data-narrow>          ← idle
 *     <div data-narrow>          ← editing (+ error, via hasDraftPrism)
 *     <div data-narrow>          ← saving
 *   </div>
 *
 * A `match` combinator would produce a single container that re-mounts one
 * child at a time, matching the mental model of a state machine more closely.
 */
export function createEditorWidget(
  save:   () => void,
  cancel: () => void,
): Widget<EditorState> {
  // FRICTION: narrow() returns Widget<EditorState, DivEl> — the outer type is
  // always EditorState regardless of which prism we pass. That is correct
  // (the parent signal does not change type), but it means `stack` sees four
  // `Widget<EditorState, DivEl>` with no compile-time proof that they cover all
  // four variants. If you add a fifth variant and forget to add a fifth `narrow`
  // call, TypeScript does not warn you. With a `match` combinator that took a
  // record keyed by the tag discriminant, the exhaustiveness check would be
  // structural.

  return stack(
    // FRICTION: narrow over hasDraftPrism covers both `editing` and `error`.
    // This is the right abstraction (one form widget shared between two states),
    // but `hasDraftPrism` was written by hand because `tagged` only handles a
    // single value. If rainbow had `taggedIn("tag", ["editing", "error"])` this
    // would be a one-liner.
    narrow(draftFormWidget(save, cancel), hasDraftPrism),
    narrow(savingWidget,                  savingPrism),
    narrow(idleWidget,                    idlePrism),
  )
}

// ── Bootstrap helper ──────────────────────────────────────────────────────────

/**
 * Mount the contact editor into a container element.
 *
 * @example
 * const cleanup = mountContactEditor(document.getElementById("editor")!)
 * // Programmatically start an edit:
 * cleanup.edit({ id: "1", name: "Alice", email: "alice@example.com", notes: "" })
 */
export function mountContactEditor(container: HTMLElement): {
  edit:    (contact: Contact) => void
  save:    () => void
  cancel:  () => void
  cleanup: () => void
} {
  const { state, edit, save, cancel } = createEditorMachine()
  const widget = createEditorWidget(save, cancel)
  const cleanup = mount(widget, state, container)
  return { edit, save, cancel, cleanup }
}

// ── Friction Report ──────────────────────────────────────────────────────────
//
// This section summarises friction points encountered while modelling a state
// machine with rainbow's tagged prism + signal. Each point maps to one or more
// inline FRICTION comments above.
//
// ── 1. Per-state narrow + render verbosity ────────────────────────────────────
//
// A four-state machine requires:
//   - 4 prism declarations (`tagged(...)`)
//   - 4 `narrow(widget, prism)` calls
//   - 4 per-state Widget implementations
//   - 1 `stack(...)` to compose them
//
// In a language with built-in exhaustive pattern matching (Elm, OCaml, Rust),
// this collapses to a single `match` expression. The `fold` combinator on
// `AsyncData` achieves this for a fixed four-state type; rainbow lacks a
// general equivalent for arbitrary discriminated unions.
//
// PROPOSAL: A `match` combinator analogous to `fold` for AsyncData:
//
//   match<S extends Record<K, string>, K extends keyof S>(
//     key: K,
//     cases: { [T in S[K]]: Widget<Extract<S, Record<K, T>>> },
//   ): Widget<S>
//
// This would:
//   - Produce a single container div (not N narrow divs)
//   - Enforce exhaustiveness at compile time (missing variant = type error)
//   - Eliminate the prism declarations (the record key is the discriminant)
//   - Eliminate `stack` (the match combinator handles composition internally)
//
// ── 2. Shared data across states causes `hasDraftPrism` boilerplate ───────────
//
// `editing` and `error` both carry `draft: Contact`. Sharing a form widget
// between them requires a hand-written union prism (`hasDraftPrism`) because
// `tagged()` only handles one value. A `taggedIn("tag", ["editing", "error"])`
// variant would eliminate three lines of boilerplate.
//
// Alternatively, the proposed `match` combinator would make this moot: the
// `editing` and `error` cases would each get their own call, and a shared
// helper function (not a widget) would render the form for both.
//
// ── 3. Transition functions feel natural ──────────────────────────────────────
//
// Pure `EditorState → EditorState` functions compose well and are easy to test.
// Wiring them via `state.set(transition(state.get()))` is idiomatic and not
// verbose. No friction here.
//
// ── 4. Guards are natural ─────────────────────────────────────────────────────
//
// `if (s.tag !== "editing" && s.tag !== "error") return` is readable. No
// special guard mechanism is needed — TypeScript narrows the type in the branch.
// No friction here.
//
// ── 5. `narrow` produces container divs, `stack` produces another ─────────────
//
// For an N-state machine, the DOM contains N+1 wrappers (N from `narrow`, 1
// from `stack`) where 1 wrapper would do. This is a cosmetic issue for most
// apps, but can complicate CSS grid/flex layouts and makes DevTools harder to
// read. The proposed `match` combinator would fix this structurally.
//
// ── 6. No compile-time exhaustiveness over state variants ─────────────────────
//
// `stack(narrow(...), narrow(...), narrow(...))` compiles even if you miss a
// variant. The type system does not force you to handle every case. `match`
// keyed by the tag discriminant would make this a compile-time error.
//
// ── 7. `template` bind fn: initial value + subscribe duplication ──────────────
//
// (Pre-existing FRICTION from todomvc example — confirmed here.)
// Inside `template`, you must write `s.get().foo` for initial values AND
// `subscribe(s, v => ...)` for updates. A `subscribeNow` helper that fires the
// callback immediately with the current value would halve the lines in every
// template bind fn.
//
// ── Summary ───────────────────────────────────────────────────────────────────
//
// The state machine pattern is viable with the current API. Transitions and
// guards require no new primitives. The primary gap is the absence of a `match`
// combinator: without it, every discriminated-union rendering task requires 2–4×
// more declarations than it conceptually needs. `match` is the natural
// generalisation of `fold` (AsyncData) to arbitrary tagged unions, and would
// address friction points 1, 5, and 6 simultaneously.
