/**
 * @rhi-zone/rainbow-ui/form-state
 *
 * Form state management over rainbow signals.
 *
 * The state shape:
 *
 *   FormState<T> = { values, fieldErrors, formErrors, touched, submitting, submitCount }
 *
 * Three validation sources, each distinct:
 *   per-field validator (formField option)   → fieldErrors[key]
 *   form-level validator (createForm option) → fieldErrors + formErrors
 *   server response (setErrors)              → fieldErrors + formErrors
 *
 * Error visibility gates:
 *   touched[key] || submitCount > 0          → show this field's error
 *   formErrors.length > 0                    → always show form-level error
 *
 * Validation adapters: FormValidator<T> is a plain function — bridge your
 * schema library in the app layer, e.g. valibot:
 *
 *   const validate: FormValidator<T> = (values) => {
 *     const r = v.safeParse(Schema, values)
 *     if (r.success) return {}
 *     const fieldErrors: FieldErrors<T> = {}
 *     for (const issue of r.issues) {
 *       const key = issue.path?.[0]?.key as keyof T & string
 *       if (key) (fieldErrors[key] ??= []).push(issue.message)
 *     }
 *     return { fieldErrors }
 *   }
 */

import { signal, composeLens, field } from "@rhi-zone/rainbow"
import type { Signal } from "@rhi-zone/rainbow"
import { subscribe, on } from "./widget.js"
import type { Widget, AnyEl } from "./widget.js"
import type { DivEl } from "./html.js"

// ── Types ──────────────────────────────────────────────────────────────────────

/** Per-field error arrays keyed by field name. */
export type FieldErrors<T> = Partial<Record<keyof T & string, string[]>>

/**
 * Complete form state. All fields are readonly — mutations go through
 * `Signal<FormState<T>>.set`.
 */
export type FormState<T> = {
  readonly values: T
  /** Per-field validation errors. Empty array or undefined = no errors. */
  readonly fieldErrors: FieldErrors<T>
  /** Cross-field or server-side errors, not attributed to a specific field. */
  readonly formErrors: string[]
  /** Which fields the user has left (via focusout). */
  readonly touched: Partial<Record<keyof T & string, boolean>>
  /** True while `handleSubmit`'s `onValid` promise is pending. */
  readonly submitting: boolean
  /**
   * Increments on each submit attempt. When > 0, all field errors are
   * shown immediately on change (not just for touched fields).
   */
  readonly submitCount: number
}

/**
 * Form-level validator. Receives the full values object; returns any
 * combination of field errors (keyed by field name) and form-level errors.
 * Return `{}` or `undefined` when valid.
 */
export type FormValidator<T> = (values: T) => {
  fieldErrors?: FieldErrors<T>
  formErrors?: string[]
} | null | undefined

/**
 * Per-field validator for use in `formField`. Returns an error string,
 * array of error strings, or null/undefined when valid.
 */
export type FieldValidator<V> = (value: V) => string | string[] | null | undefined

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Construct initial `FormState<T>` from default values. */
export function createFormState<T>(defaults: T): FormState<T> {
  return {
    values: { ...(defaults as object) } as T,
    fieldErrors: {},
    formErrors: [],
    touched: {},
    submitting: false,
    submitCount: 0,
  }
}

/**
 * True when `state` has no field errors and no form-level errors.
 * An empty array for `fieldErrors[key]` is treated as valid.
 */
export function isFormValid<T>(state: FormState<T>): boolean {
  if (state.formErrors.length > 0) return false
  return Object.values(state.fieldErrors).every(
    (errs) => !errs || errs.length === 0,
  )
}

/**
 * True when `state.values` differs from `initial` (by JSON equality).
 * Useful for enabling/disabling a "Save" button.
 */
export function isDirty<T>(initial: T, state: FormState<T>): boolean {
  return JSON.stringify(initial) !== JSON.stringify(state.values)
}

function normalizeErrors(v: string | string[] | null | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v.filter(Boolean) : [v]
}

// ── formField ─────────────────────────────────────────────────────────────────

/**
 * Form field combinator. Wraps a widget to:
 *   - Focus it on `state.values[key]` via a composed lens
 *   - Show an error message below the field when the error is visible
 *   - Mark the field as touched when focus leaves (`focusout` bubbles)
 *   - Run per-field validation on change (after first touch or submit attempt)
 *
 * Error visibility: shown when `touched[key] || submitCount > 0` and there
 * is at least one error for the key. Only the first error is displayed.
 *
 * @example
 * formField("name", inputWidget({ placeholder: "Name" }), (v) =>
 *   v.length === 0 ? "Required" : undefined
 * )
 */
export function formField<T extends object, K extends keyof T & string>(
  key: K,
  widget: Widget<T[K], AnyEl>,
  validator?: FieldValidator<T[K]>,
): Widget<FormState<T>, DivEl> {
  // Lens: FormState<T> → T[K] through values[key]
  const valueLens = composeLens(
    field<FormState<T>, "values">("values"),
    field<T, K>(key),
  )

  return (s) => {
    // Focused signal: reads/writes only values[key]; leaves errors/touched intact
    const fieldSignal = s.focus(valueLens)

    // Render the inner widget. Its subscriptions land in the current _track
    // context (set by mount / parent combinator) — cleaned up automatically.
    const fieldEl = widget(fieldSignal)

    // Error span — hidden until the field is touched (or submit attempted)
    const errorSpan = document.createElement("span")
    errorSpan.dataset["formError"] = key

    const applyErrorVisibility = (state: FormState<T>) => {
      const errs = state.fieldErrors[key] ?? []
      const visible = (state.touched[key] === true || state.submitCount > 0) && errs.length > 0
      errorSpan.style.display = visible ? "" : "none"
      const msg = errs[0] ?? ""
      if (errorSpan.textContent !== msg) errorSpan.textContent = msg
    }
    applyErrorVisibility(s.get())
    subscribe(s, applyErrorVisibility)

    // Per-field validation on change — only fires after field is first touched
    // or a submit has been attempted, so typing into a pristine field is silent.
    if (validator) {
      subscribe(fieldSignal, (v) => {
        const state = s.get()
        if (!state.touched[key] && state.submitCount === 0) return
        const errs = normalizeErrors(validator(v))
        const current = state.fieldErrors[key] ?? []
        // Avoid a set if nothing changed (prevents subscribe loops)
        if (JSON.stringify(current) !== JSON.stringify(errs)) {
          s.set({ ...state, fieldErrors: { ...state.fieldErrors, [key]: errs } })
        }
      })
    }

    // Wrapper div — focusout bubbles from any descendant input/select/textarea
    const node = document.createElement("div")
    node.dataset["formField"] = key

    on(node, "focusout", () => {
      const state = s.get()
      if (state.touched[key]) return   // already touched — no-op

      const errs = validator
        ? normalizeErrors(validator(state.values[key]))
        : (state.fieldErrors[key] ?? [])

      s.set({
        ...state,
        touched: { ...state.touched, [key]: true },
        fieldErrors: { ...state.fieldErrors, [key]: errs },
      })
    })

    node.appendChild(fieldEl.node)
    node.appendChild(errorSpan)

    return { _tag: "div", node }
  }
}

// ── createForm ────────────────────────────────────────────────────────────────

/**
 * Create a form controller backed by a `Signal<FormState<T>>`.
 *
 * @returns
 *   `state`        — the reactive form signal; pass to `mount`
 *   `handleSubmit` — returns an event handler; attach to `<form>.submit`
 *   `reset`        — restore all state to `defaults`
 *   `setErrors`    — write server-returned errors back into the signal
 *
 * @example
 * const { state, handleSubmit, reset } = createForm({
 *   defaults: { name: "", email: "" },
 *   validate: (v) => ({
 *     fieldErrors: {
 *       name:  v.name  === "" ? ["Required"] : undefined,
 *       email: !v.email.includes("@") ? ["Invalid email"] : undefined,
 *     },
 *   }),
 * })
 *
 * mount(
 *   stack(
 *     formField("name",  inputWidget({ placeholder: "Name" }),  v => v ? undefined : "Required"),
 *     formField("email", inputWidget({ placeholder: "Email" })),
 *   ),
 *   state, root,
 * )
 *
 * form.addEventListener("submit", handleSubmit(async (values) => {
 *   await api.save(values)
 * }))
 */
export function createForm<T extends object>(options: {
  readonly defaults: T
  readonly validate?: FormValidator<T>
}): {
  readonly state: Signal<FormState<T>>
  readonly handleSubmit: (onValid: (values: T) => Promise<void>) => (e?: Event) => void
  readonly reset: () => void
  readonly setErrors: (fieldErrors?: FieldErrors<T>, formErrors?: string[]) => void
} {
  const { defaults, validate } = options
  const state = signal(createFormState(defaults))

  const runValidator = (values: T): { fieldErrors: FieldErrors<T>; formErrors: string[] } => {
    if (!validate) return { fieldErrors: {}, formErrors: [] }
    const result = validate(values) ?? {}
    return {
      fieldErrors: result.fieldErrors ?? {},
      formErrors: result.formErrors ?? [],
    }
  }

  const handleSubmit =
    (onValid: (values: T) => Promise<void>) =>
    (e?: Event): void => {
      e?.preventDefault()
      const current = state.get()

      // Mark every key in values as touched
      const allTouched = Object.fromEntries(
        Object.keys(current.values as object).map((k) => [k, true]),
      ) as Partial<Record<keyof T & string, boolean>>

      // Full validation pass
      const { fieldErrors, formErrors } = runValidator(current.values)

      state.set({
        ...current,
        touched: { ...current.touched, ...allTouched },
        fieldErrors,
        formErrors,
        submitCount: current.submitCount + 1,
      })

      if (!isFormValid({ ...current, fieldErrors, formErrors })) return

      state.set({ ...state.get(), submitting: true, formErrors: [] })

      onValid(state.get().values).then(
        () => { state.set({ ...state.get(), submitting: false }) },
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          state.set({ ...state.get(), submitting: false, formErrors: [msg] })
        },
      )
    }

  const reset = (): void => {
    state.set(createFormState(defaults))
  }

  const setErrors = (
    fieldErrors?: FieldErrors<T>,
    formErrors?: string[],
  ): void => {
    state.set({
      ...state.get(),
      fieldErrors: fieldErrors ?? {},
      formErrors: formErrors ?? [],
    })
  }

  return { state, handleSubmit, reset, setErrors }
}
