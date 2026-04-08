import { describe, it, expect } from "vitest"
import { signal, composeLens, field } from "@rhi-zone/rainbow"
import { mount, stack, focus } from "./widget.js"
import { inputWidget } from "./widget.js"
import {
  createForm,
  createFormState,
  isFormValid,
  isDirty,
  type FormState,
} from "./form-state.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

type Profile = { name: string; email: string }
const defaults: Profile = { name: "", email: "" }

// Lens from FormState<Profile> into a specific values field —
// this is the "form field" pattern: just a composed lens.
function valuesField<T, K extends keyof T & string>(key: K) {
  return composeLens(field<FormState<T>, "values">("values"), field<T, K>(key))
}

function makeRoot() {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

// ── createFormState ───────────────────────────────────────────────────────────

describe("createFormState", () => {
  it("produces correct initial state", () => {
    const s = createFormState(defaults)
    expect(s.values).toEqual(defaults)
    expect(s.fieldErrors).toEqual({})
    expect(s.formErrors).toEqual([])
    expect(s.touched).toEqual({})
    expect(s.submitting).toBe(false)
    expect(s.submitCount).toBe(0)
  })
})

// ── isFormValid ───────────────────────────────────────────────────────────────

describe("isFormValid", () => {
  it("true for initial state", () => {
    expect(isFormValid(createFormState(defaults))).toBe(true)
  })

  it("false when a field has errors", () => {
    const s: FormState<Profile> = {
      ...createFormState(defaults),
      fieldErrors: { name: ["Required"] },
    }
    expect(isFormValid(s)).toBe(false)
  })

  it("false when formErrors is non-empty", () => {
    const s: FormState<Profile> = {
      ...createFormState(defaults),
      formErrors: ["Server error"],
    }
    expect(isFormValid(s)).toBe(false)
  })

  it("true when field error array is empty", () => {
    const s: FormState<Profile> = {
      ...createFormState(defaults),
      fieldErrors: { name: [] },
    }
    expect(isFormValid(s)).toBe(true)
  })
})

// ── isDirty ───────────────────────────────────────────────────────────────────

describe("isDirty", () => {
  it("false for initial values", () => {
    expect(isDirty(defaults, createFormState(defaults))).toBe(false)
  })

  it("true after value change", () => {
    const s: FormState<Profile> = {
      ...createFormState(defaults),
      values: { name: "Alice", email: "" },
    }
    expect(isDirty(defaults, s)).toBe(true)
  })
})

// ── lens-based form fields ────────────────────────────────────────────────────

describe("form fields via lens", () => {
  it("focus + composeLens connects input widget to values field", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const nameInput = focus(inputWidget(), valuesField<Profile, "name">("name"))
    const unmount = mount(nameInput, state, root)
    const inp = root.querySelector("input")!
    inp.value = "Alice"
    inp.dispatchEvent(new Event("input"))
    expect(state.get().values.name).toBe("Alice")
    unmount(); root.remove()
  })

  it("signal update propagates back to input DOM node", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const nameInput = focus(inputWidget(), valuesField<Profile, "name">("name"))
    const unmount = mount(nameInput, state, root)
    state.set({ ...state.get(), values: { name: "Bob", email: "" } })
    expect(root.querySelector("input")!.value).toBe("Bob")
    unmount(); root.remove()
  })

  it("two focused widgets on the same state update independently", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(
      focus(inputWidget(), valuesField<Profile, "name">("name")),
      focus(inputWidget(), valuesField<Profile, "email">("email")),
    )
    const unmount = mount(w, state, root)
    const [nameInp, emailInp] = root.querySelectorAll("input")
    nameInp!.value = "Alice"
    nameInp!.dispatchEvent(new Event("input"))
    expect(state.get().values.name).toBe("Alice")
    expect(state.get().values.email).toBe("")   // untouched
    emailInp!.value = "a@b.com"
    emailInp!.dispatchEvent(new Event("input"))
    expect(state.get().values.email).toBe("a@b.com")
    expect(state.get().values.name).toBe("Alice")  // still intact
    unmount(); root.remove()
  })
})

// ── createForm — handleSubmit ─────────────────────────────────────────────────

describe("createForm > handleSubmit", () => {
  it("prevents default on the event", () => {
    const { handleSubmit } = createForm({ defaults })
    let prevented = false
    const e = { preventDefault: () => { prevented = true } } as unknown as Event
    handleSubmit(async () => {})(e)
    expect(prevented).toBe(true)
  })

  it("increments submitCount", () => {
    const { state, handleSubmit } = createForm({ defaults })
    handleSubmit(async () => {})()
    expect(state.get().submitCount).toBe(1)
  })

  it("marks all values keys as touched", () => {
    const { state, handleSubmit } = createForm({ defaults })
    handleSubmit(async () => {})()
    expect(state.get().touched["name"]).toBe(true)
    expect(state.get().touched["email"]).toBe(true)
  })

  it("does not call onValid when form has errors", async () => {
    const { handleSubmit } = createForm({
      defaults,
      validate: (v) => ({
        fieldErrors: { name: v.name === "" ? ["Required"] : undefined },
      }),
    })
    let called = false
    handleSubmit(async () => { called = true })()
    await Promise.resolve()
    expect(called).toBe(false)
  })

  it("calls onValid with current values when valid", async () => {
    const { state, handleSubmit } = createForm({ defaults })
    state.set({ ...state.get(), values: { name: "Alice", email: "alice@example.com" } })
    let received: Profile | undefined
    handleSubmit(async (v) => { received = v })()
    await Promise.resolve()
    expect(received?.name).toBe("Alice")
  })

  it("sets submitting=true while onValid is pending", () => {
    const { state, handleSubmit } = createForm({ defaults })
    state.set({ ...state.get(), values: { name: "Alice", email: "a@b.com" } })
    let resolve!: () => void
    handleSubmit(() => new Promise<void>((r) => { resolve = r }))()
    expect(state.get().submitting).toBe(true)
    resolve()
  })

  it("clears submitting on success", async () => {
    const { state, handleSubmit } = createForm({ defaults })
    state.set({ ...state.get(), values: { name: "Alice", email: "a@b.com" } })
    handleSubmit(async () => {})()
    await new Promise((r) => setTimeout(r, 0))
    expect(state.get().submitting).toBe(false)
  })

  it("sets formErrors on rejection", async () => {
    const { state, handleSubmit } = createForm({ defaults })
    state.set({ ...state.get(), values: { name: "Alice", email: "a@b.com" } })
    handleSubmit(async () => { throw new Error("server error") })()
    await new Promise((r) => setTimeout(r, 0))
    expect(state.get().formErrors).toEqual(["server error"])
    expect(state.get().submitting).toBe(false)
  })
})

// ── createForm — reset / setErrors ────────────────────────────────────────────

describe("createForm > reset", () => {
  it("restores all state to defaults", () => {
    const { state, handleSubmit, reset } = createForm({
      defaults,
      validate: (v) => ({ fieldErrors: { name: v.name === "" ? ["Required"] : undefined } }),
    })
    handleSubmit(async () => {})()
    reset()
    const s = state.get()
    expect(s.values).toEqual(defaults)
    expect(s.fieldErrors).toEqual({})
    expect(s.formErrors).toEqual([])
    expect(s.touched).toEqual({})
    expect(s.submitCount).toBe(0)
    expect(s.submitting).toBe(false)
  })
})

describe("createForm > setErrors", () => {
  it("writes server field errors into state", () => {
    const { state, setErrors } = createForm({ defaults })
    setErrors({ name: ["Already taken"] }, ["Please fix errors above"])
    expect(state.get().fieldErrors["name"]).toEqual(["Already taken"])
    expect(state.get().formErrors).toEqual(["Please fix errors above"])
  })
})
