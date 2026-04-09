/**
 * @rhi-zone/rainbow-ui/keybinds
 *
 * Reactive integration between the `keybinds` library and rainbow signals.
 *
 * `keybindsContext` wires a `Signal<S>` into a keybinds registration so that
 * context is always evaluated from current signal state on each keypress.
 *
 * `bindingsStoreSignal` wraps a `BindingsStore` (from keybinds) in a
 * `ReadonlySignal` so that user-customized bindings are reactive.
 */

import type { Signal, ReadonlySignal } from "@rhi-zone/rainbow"
import { signal } from "@rhi-zone/rainbow"

// ---------------------------------------------------------------------------
// Minimal local interfaces matching the keybinds JS API
// ---------------------------------------------------------------------------

/** Minimal shape of a keybinds Command object. */
export interface Command {
  id: string
  label: string
  description?: string
  category?: string
  keys?: string[]
  mouse?: string[]
  when?: (ctx: Record<string, unknown>) => boolean
  execute: (ctx: Record<string, unknown>, event?: Event) => unknown
  hidden?: boolean
  captureInput?: boolean
  menu?: string | string[]
}

/** Options accepted by the keybinds() function. */
export interface KeybindsOptions {
  target?: EventTarget
  onExecute?: (cmd: Command, ctx: Record<string, unknown>) => void
}

/**
 * The `keybinds` function signature from the keybinds library.
 * Accept this as a parameter so callers supply the concrete import —
 * no hard dependency on the `keybinds` package from `@rhi-zone/rainbow-ui`.
 */
export type KeybindsFn = (
  commands: Command[],
  getContext: () => Record<string, unknown>,
  options?: KeybindsOptions,
) => () => void

/** The BindingsStore class shape from keybinds (extends EventTarget). */
export interface BindingsStore<T = Record<string, unknown>> extends EventTarget {
  schema: T
  storageKey: string
  overrides: Record<string, unknown>
  bindings: T
  get(): T
  getOverrides(): Record<string, unknown>
  save(newOverrides: Record<string, unknown>): void
}

// ---------------------------------------------------------------------------
// keybindsContext
// ---------------------------------------------------------------------------

/**
 * Register keybindings whose context is derived from a reactive signal.
 *
 * The `getContext` callback is invoked on each keypress, reading current
 * signal state at that moment. No re-registration is needed when state
 * changes — the closure is inherently fresh.
 *
 * The subscription to `state` is established so that callers can extend
 * this helper without forking it (e.g. to rebuild command lists reactively).
 * It also serves as a documented contract: this integration owns the signal.
 *
 * Pass the `keybinds` function imported from the `keybinds` package as the
 * first argument. This avoids a hard package dependency on `keybinds` from
 * `@rhi-zone/rainbow-ui` — callers bring their own import.
 *
 * @example
 * ```ts
 * import { keybinds } from "keybinds"
 * import { keybindsContext } from "@rhi-zone/rainbow-ui"
 *
 * const dispose = keybindsContext(keybinds, commands, appState, s => ({
 *   isAdmin: s.role === "admin",
 *   hasSelection: s.selection.length > 0,
 * }))
 * ```
 *
 * @param keybindsFn   - The `keybinds` function from the keybinds library.
 * @param commands     - Array of command definitions.
 * @param state        - Signal whose value supplies the keybind context.
 * @param buildContext - Pure function mapping signal state to a context object.
 * @param options      - Optional keybinds options (target element, onExecute hook).
 * @returns A dispose function that removes event listeners and unsubscribes
 *          from the signal. Call it when the component or scope unmounts.
 */
export function keybindsContext<S>(
  keybindsFn: KeybindsFn,
  commands: Command[],
  state: Signal<S> | ReadonlySignal<S>,
  buildContext: (s: S) => Record<string, unknown>,
  options?: KeybindsOptions,
): () => void {
  // Register bindings. getContext() closes over `state` so it always reads
  // the current signal value at dispatch time.
  const disposeKeybinds = keybindsFn(
    commands,
    () => buildContext(state.get()),
    options,
  )

  // Subscribe to state changes. The subscription is a no-op side-effector here
  // (context is already fresh via the closure above), but it establishes the
  // reactive ownership contract and is the hook point for future extensions
  // such as reactively rebuilding command lists.
  const unsubscribe = state.subscribe(() => {
    // Context is read lazily at dispatch time — nothing to do here.
    // Extensions that need to rebuild commands on state change should
    // call disposeKeybinds(), re-derive commands, then re-register.
  })

  return () => {
    unsubscribe()
    disposeKeybinds()
  }
}

// ---------------------------------------------------------------------------
// bindingsStoreSignal
// ---------------------------------------------------------------------------

/**
 * Wrap a `BindingsStore` from the keybinds library in a `ReadonlySignal<T>`
 * so that user-customized bindings propagate reactively.
 *
 * The signal holds the current merged bindings (schema + overrides). When the
 * user saves new overrides via `BindingsStore.save()`, the store dispatches a
 * `'change'` CustomEvent and this signal updates automatically.
 *
 * The returned dispose function removes the event listener. Call it when the
 * component or scope unmounts to prevent memory leaks.
 *
 * @example
 * ```ts
 * const store = new BindingsStore(schema, "app-bindings")
 * const [bindingsSignal, disposeBindings] = bindingsStoreSignal(store)
 *
 * // bindingsSignal.get() always returns the latest merged bindings
 * // bindingsSignal.subscribe(...) fires whenever the user customizes a key
 * ```
 */
export function bindingsStoreSignal<T>(
  store: BindingsStore<T>,
): [ReadonlySignal<T>, () => void] {
  const s = signal<T>(store.get())

  function handleChange(e: Event) {
    const event = e as CustomEvent<{ bindings: T; overrides: Record<string, unknown> }>
    s.set(event.detail.bindings)
  }

  store.addEventListener("change", handleChange)

  const dispose = () => store.removeEventListener("change", handleChange)

  return [s, dispose]
}
