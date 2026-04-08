import { describe, it, expect } from "vitest"
import { mount, stack } from "./widget.js"
import {
  createForm,
  createFormState,
  formField,
  isFormValid,
  isDirty,
  type FormState,
} from "./form-state.js"
import { inputWidget } from "./widget.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

type Profile = { name: string; email: string }
const defaults: Profile = { name: "", email: "" }

function makeRoot() {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

function field(root: HTMLElement, key: string) {
  return root.querySelector<HTMLElement>(`[data-form-field="${key}"]`)!
}
function errorSpan(root: HTMLElement, key: string) {
  return root.querySelector<HTMLElement>(`[data-form-error="${key}"]`)!
}
function inputIn(root: HTMLElement, key: string) {
  return field(root, key).querySelector("input")!
}

function focusout(el: HTMLElement) {
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
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

// ── formField ─────────────────────────────────────────────────────────────────

describe("formField", () => {
  it("renders the inner widget inside a [data-form-field] wrapper", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(formField("name", inputWidget()))
    const unmount = mount(w, state, root)
    expect(field(root, "name")).not.toBeNull()
    expect(inputIn(root, "name")).not.toBeNull()
    unmount(); root.remove()
  })

  it("error span is hidden initially", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(
      formField("name", inputWidget(), (v) => v === "" ? "Required" : undefined),
    )
    const unmount = mount(w, state, root)
    expect(errorSpan(root, "name").style.display).toBe("none")
    unmount(); root.remove()
  })

  it("marks field touched and shows error on focusout", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(
      formField("name", inputWidget(), (v) => v === "" ? "Required" : undefined),
    )
    const unmount = mount(w, state, root)
    focusout(field(root, "name"))
    expect(state.get().touched["name"]).toBe(true)
    expect(errorSpan(root, "name").style.display).toBe("")
    expect(errorSpan(root, "name").textContent).toBe("Required")
    unmount(); root.remove()
  })

  it("hides error after value is corrected", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(
      formField("name", inputWidget(), (v) => v === "" ? "Required" : undefined),
    )
    const unmount = mount(w, state, root)
    focusout(field(root, "name"))
    expect(errorSpan(root, "name").style.display).toBe("")
    // Correct the value
    const inp = inputIn(root, "name")
    inp.value = "Alice"
    inp.dispatchEvent(new Event("input"))
    expect(errorSpan(root, "name").style.display).toBe("none")
    unmount(); root.remove()
  })

  it("does not show error for untouched field before submit", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(
      formField("name",  inputWidget(), (v) => v === "" ? "Required" : undefined),
      formField("email", inputWidget()),
    )
    const unmount = mount(w, state, root)
    // Touch only email — name error should stay hidden
    focusout(field(root, "email"))
    expect(errorSpan(root, "name").style.display).toBe("none")
    unmount(); root.remove()
  })

  it("shows all errors after submitCount > 0 regardless of touched", () => {
    const root = makeRoot()
    const { state, handleSubmit } = createForm({
      defaults,
      validate: (v) => ({
        fieldErrors: {
          name:  v.name  === "" ? ["Required"] : undefined,
          email: v.email === "" ? ["Required"] : undefined,
        },
      }),
    })
    const w = stack<FormState<Profile>>(
      formField("name",  inputWidget()),
      formField("email", inputWidget()),
    )
    const unmount = mount(w, state, root)
    handleSubmit(async () => {})(undefined)
    expect(errorSpan(root, "name").style.display).toBe("")
    expect(errorSpan(root, "email").style.display).toBe("")
    unmount(); root.remove()
  })

  it("field value changes update state.values via focused signal", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(formField("name", inputWidget()))
    const unmount = mount(w, state, root)
    const inp = inputIn(root, "name")
    inp.value = "Bob"
    inp.dispatchEvent(new Event("input"))
    expect(state.get().values.name).toBe("Bob")
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

// ── createForm — reset ────────────────────────────────────────────────────────

describe("createForm > reset", () => {
  it("restores all state to defaults", () => {
    const { state, handleSubmit, reset } = createForm({
      defaults,
      validate: (v) => ({ fieldErrors: { name: v.name === "" ? ["Required"] : undefined } }),
    })
    handleSubmit(async () => {})()   // mark submitted, add errors
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

// ── createForm — setErrors ────────────────────────────────────────────────────

describe("createForm > setErrors", () => {
  it("writes server field errors into state", () => {
    const { state, setErrors } = createForm({ defaults })
    setErrors({ name: ["Already taken"] }, ["Please fix errors above"])
    expect(state.get().fieldErrors["name"]).toEqual(["Already taken"])
    expect(state.get().formErrors).toEqual(["Please fix errors above"])
  })
})

// ── stack ─────────────────────────────────────────────────────────────────────

describe("stack", () => {
  it("renders all widgets receiving the same signal", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(
      formField("name",  inputWidget({ placeholder: "Name" })),
      formField("email", inputWidget({ placeholder: "Email" })),
    )
    const unmount = mount(w, state, root)
    expect(root.querySelectorAll("input")).toHaveLength(2)
    unmount(); root.remove()
  })

  it("all child widgets reflect signal updates", () => {
    const root = makeRoot()
    const { state } = createForm({ defaults })
    const w = stack<FormState<Profile>>(
      formField("name",  inputWidget()),
      formField("email", inputWidget()),
    )
    const unmount = mount(w, state, root)
    state.set({ ...state.get(), values: { name: "Alice", email: "alice@x.com" } })
    expect(inputIn(root, "name").value).toBe("Alice")
    expect(inputIn(root, "email").value).toBe("alice@x.com")
    unmount(); root.remove()
  })
})
