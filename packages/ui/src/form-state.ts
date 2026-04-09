/**
 * @rhi-zone/rainbow-ui/form-state
 *
 * Form state as a data model. Rendering is entirely the app's responsibility.
 *
 * A form field is just a lens:
 *
 *   focus(inputWidget(), composeLens(field("values"), field("name")))
 *   // Widget<FormState<Profile>, InputEl>
 *
 * The data model:
 *
 *   FormState<T> = { values, fieldErrors, formErrors, touched, submitting, submitCount }
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

import { signal, field } from "@rhi-zone/rainbow"
import type { Signal } from "@rhi-zone/rainbow"
import { subscribe, inputWidget, textareaWidget } from "./widget.js"
import type { Widget } from "./widget.js"
import type { AnyEl } from "./html.js"

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
  /**
   * Which fields the user has interacted with. Gate error display on this
   * using `subscribe` + `on(el, "focusout", ...)` in the app's field renderer.
   */
  readonly touched: Partial<Record<keyof T & string, boolean>>
  /** True while `handleSubmit`'s `onValid` promise is pending. */
  readonly submitting: boolean
  /**
   * Increments on each submit attempt. When > 0, show all field errors
   * immediately (not just for touched fields).
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
 * True when the error for `key` should be shown to the user.
 * Errors are suppressed until the field is touched OR a submit has been attempted.
 */
export function shouldShowError<T>(state: FormState<T>, key: keyof T & string): boolean {
  return (state.touched[key] === true || state.submitCount > 0) &&
    (state.fieldErrors[key]?.length ?? 0) > 0
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

// ── createForm ────────────────────────────────────────────────────────────────

/**
 * Create a form controller backed by a `Signal<FormState<T>>`.
 *
 * A form field is a focused widget — no special combinator needed:
 *
 *   focus(inputWidget(), composeLens(field("values"), field("name")))
 *
 * The app owns error display and touched tracking:
 *
 *   subscribe(state, (s) => {
 *     const show = (s.touched.name || s.submitCount > 0) && s.fieldErrors.name?.length
 *     errorEl.style.display = show ? "" : "none"
 *     errorEl.textContent = s.fieldErrors.name?.[0] ?? ""
 *   })
 *   on(inputEl, "focusout", () =>
 *     state.set({ ...state.get(), touched: { ...state.get().touched, name: true } })
 *   )
 *
 * @returns
 *   `state`        — the reactive form signal; pass to `mount` and `focus`
 *   `handleSubmit` — returns an event handler; attach to the form's submit event
 *   `reset`        — restore all state to `defaults`
 *   `setErrors`    — write server-returned errors back into the signal
 */
export function createForm<T extends object>(options: {
  readonly defaults: T
  readonly validate?: FormValidator<T>
}): {
  readonly state: Signal<FormState<T>>
  /**
   * Bind a widget to a specific values field. Shorthand for
   * `focus(widget, composeLens(field("values"), field(key)))`.
   * `T` is captured by closure so no explicit type parameters are needed.
   *
   * @example
   * const { state, bind } = createForm({ defaults: { name: "", email: "" } })
   * mount(stack(
   *   bind("name",  inputWidget({ placeholder: "Name" })),
   *   bind("email", inputWidget({ placeholder: "Email" })),
   * ), state, root)
   */
  readonly bind: <K extends keyof T & string, E extends AnyEl>(key: K, widget: Widget<T[K], E>) => Widget<FormState<T>, E>
  readonly handleSubmit: (onValid: (values: T) => Promise<void>) => (e?: Event) => void
  readonly reset: () => void
  readonly setErrors: (fieldErrors?: FieldErrors<T>, formErrors?: string[]) => void
  /**
   * Replace the form's defaults and reset all state to a fresh `FormState`
   * built from `newDefaults`. Use this when reusing the same form instance
   * across different records (e.g. switching between contacts).
   */
  readonly reinitialize: (newDefaults: T) => void
  /**
   * Build a fully-wired form field element: wrapper div → label → input (or
   * textarea when `rows` is set) → error span.
   *
   * The input is bound to `state` via `bind`. A `focusout` listener marks the
   * field as touched. The error span is shown when
   * `(touched[key] || submitCount > 0) && fieldErrors[key]?.length > 0`.
   *
   * Must be called inside a widget rendering context (i.e. inside a `mount`
   * call or another widget) so that the `subscribe` for error display is
   * tracked for cleanup.
   *
   * @example
   * mount(
   *   stack(
   *     (s) => form.field("name",  "Full name"),
   *     (s) => form.field("email", "Email", { type: "email" }),
   *     (s) => form.field("bio",   "Bio",   { rows: 4 }),
   *   ),
   *   form.state,
   *   root,
   * )
   */
  readonly field: (
    key: keyof T & string,
    label: string,
    options?: { type?: "text" | "email" | "tel" | "password" | "number" | "search"; rows?: number },
  ) => HTMLElement
  /**
   * Return a `<div class="form-errors">` that is hidden when `state.formErrors`
   * is empty, and shows all form-level errors (one `<p>` per error) when
   * non-empty. Uses `subscribe` to stay reactive.
   *
   * Must be called inside a widget rendering context (i.e. inside a `mount`
   * call or another widget) so that the subscription is tracked for cleanup.
   *
   * @example
   * formEl.appendChild(editFormState.formErrors())
   */
  readonly formErrors: () => HTMLElement
} {
  const { defaults, validate } = options
  const state = signal(createFormState(defaults))

  const bind = <K extends keyof T & string, E extends AnyEl>(
    key: K,
    widget: Widget<T[K], E>,
  ): Widget<FormState<T>, E> =>
    (s) => widget(s.focus(field("values")).focus(field(key)))

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

  const reinitialize = (newDefaults: T): void => {
    state.set(createFormState(newDefaults))
  }

  const fieldEl = (
    key: keyof T & string,
    labelText: string,
    options?: { type?: "text" | "email" | "tel" | "password" | "number" | "search"; rows?: number },
  ): HTMLElement => {
    const wrapper = document.createElement("div")
    wrapper.className = "form-field"

    const labelNode = document.createElement("label")
    labelNode.textContent = labelText
    wrapper.appendChild(labelNode)

    const widget = options?.rows != null
      ? bind(key as keyof T & string, textareaWidget({ rows: options.rows }) as Widget<T[keyof T & string], AnyEl>)
      : bind(key as keyof T & string, inputWidget({ type: options?.type ?? "text" }) as Widget<T[keyof T & string], AnyEl>)

    const el = (widget as Widget<FormState<T>, AnyEl>)(state)
    wrapper.appendChild(el.node)

    el.node.addEventListener("focusout", () => {
      const s = state.get()
      state.set({ ...s, touched: { ...s.touched, [key]: true } })
    })

    const errorSpan = document.createElement("span")
    errorSpan.className = "field-error"
    errorSpan.style.display = "none"
    wrapper.appendChild(errorSpan)

    subscribe(state, (s: FormState<T>) => {
      const show = shouldShowError(s, key)
      errorSpan.style.display = show ? "" : "none"
      errorSpan.textContent = s.fieldErrors[key]?.[0] ?? ""
    })

    return wrapper
  }

  const formErrorsEl = (): HTMLElement => {
    const wrapper = document.createElement("div")
    wrapper.className = "form-errors"
    wrapper.style.display = "none"

    subscribe(state, (s: FormState<T>) => {
      const hasErrors = s.formErrors.length > 0
      wrapper.style.display = hasErrors ? "" : "none"
      wrapper.textContent = ""
      if (hasErrors) {
        for (const msg of s.formErrors) {
          const p = document.createElement("p")
          p.textContent = msg
          wrapper.appendChild(p)
        }
      }
    })

    return wrapper
  }

  return { state, bind, handleSubmit, reset, setErrors, reinitialize, field: fieldEl, formErrors: formErrorsEl }
}
