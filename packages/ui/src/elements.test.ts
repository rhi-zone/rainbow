import { describe, it, expect } from "vitest"
import type { Signal } from "@rhi-zone/rainbow"
import { index } from "@rhi-zone/rainbow"
import { subscribe, dynamic } from "./widget.js"
import { defineElement, attrString, attrNumber, attrBoolean } from "./elements.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

type Card = { label: string; count: number; active: boolean }
const cardDefaults: Card = { label: "", count: 0, active: false }

// Counter for unique tag names — vitest runs tests in the same global scope
// so each `customElements.define` call must use a unique tag name.
let seq = 0
const tag = () => `test-el-${seq++}`

function makeCardWidget(onRender: (sig: Signal<Card>) => void) {
  return (sig: Signal<Card>) => {
    const node = document.createElement("div")
    node.textContent = `${sig.get().label}:${sig.get().count}`
    subscribe(sig, (v) => { node.textContent = `${v.label}:${v.count}` })
    onRender(sig)
    return { _tag: "div" as const, node }
  }
}

// ── defineElement ──────────────────────────────────────────────────────────────

describe("defineElement", () => {
  it("renders widget content into shadow root on connection", () => {
    const t = tag()
    defineElement(t, {
      widget: makeCardWidget(() => {}),
      defaults: cardDefaults,
      attrs: { label: attrString, count: attrNumber, active: attrBoolean },
    })
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(el.shadowRoot?.querySelector("div")?.textContent).toBe(":0")
    el.remove()
  })

  it("reflects initial attributes into signal before first render", () => {
    const t = tag()
    let captured: Card | undefined
    defineElement(t, {
      widget: makeCardWidget((s) => { captured = s.get() }),
      defaults: cardDefaults,
      attrs: { label: attrString, count: attrNumber, active: attrBoolean },
    })
    const el = document.createElement(t)
    el.setAttribute("label", "Alice")
    el.setAttribute("count", "7")
    document.body.appendChild(el)
    expect(captured?.label).toBe("Alice")
    expect(captured?.count).toBe(7)
    el.remove()
  })

  it("updates signal and DOM when attribute changes", () => {
    const t = tag()
    defineElement(t, {
      widget: makeCardWidget(() => {}),
      defaults: cardDefaults,
      attrs: { label: attrString, count: attrNumber },
    })
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.setAttribute("label", "Bob")
    expect(el.shadowRoot?.querySelector("div")?.textContent).toBe("Bob:0")
    el.remove()
  })

  it("coerces number attributes", () => {
    const t = tag()
    let captured: Card | undefined
    defineElement(t, {
      widget: makeCardWidget((s) => { captured = s.get() }),
      defaults: cardDefaults,
      attrs: { count: attrNumber },
    })
    const el = document.createElement(t)
    el.setAttribute("count", "42")
    document.body.appendChild(el)
    expect(captured?.count).toBe(42)
    expect(typeof captured?.count).toBe("number")
    el.remove()
  })

  it("coerces boolean attributes — presence = true", () => {
    const t = tag()
    let captured: Card | undefined
    defineElement(t, {
      widget: makeCardWidget((s) => { captured = s.get() }),
      defaults: cardDefaults,
      attrs: { active: attrBoolean },
    })
    const el = document.createElement(t)
    el.setAttribute("active", "")  // presence attribute
    document.body.appendChild(el)
    expect(captured?.active).toBe(true)
    el.remove()
  })

  it("coerces boolean attributes — absent = false", () => {
    const t = tag()
    let captured: Card | undefined
    defineElement(t, {
      widget: makeCardWidget((s) => { captured = s.get() }),
      defaults: cardDefaults,
      attrs: { active: attrBoolean },
    })
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(captured?.active).toBe(false)
    el.setAttribute("active", "true")
    el.removeAttribute("active")
    expect(captured?.active).toBe(false)
    el.remove()
  })

  it("JS property setter updates signal", () => {
    const t = tag()
    defineElement(t, {
      widget: makeCardWidget(() => {}),
      defaults: cardDefaults,
      attrs: { label: attrString, count: attrNumber },
    })
    const el = document.createElement(t) as HTMLElement & { label: string; count: number }
    document.body.appendChild(el)
    el.label = "Charlie"
    expect(el.shadowRoot?.querySelector("div")?.textContent).toBe("Charlie:0")
    el.remove()
  })

  it("JS property getter reads current signal value", () => {
    const t = tag()
    defineElement(t, {
      widget: makeCardWidget(() => {}),
      defaults: cardDefaults,
      attrs: { count: attrNumber },
    })
    const el = document.createElement(t) as HTMLElement & { count: number }
    document.body.appendChild(el)
    el.setAttribute("count", "99")
    expect(el.count).toBe(99)
    el.remove()
  })

  it("cleans up subscriptions on disconnection", () => {
    const t = tag()
    let subCalls = 0
    const w = (sig: Signal<Card>) => {
      const node = document.createElement("div")
      subscribe(sig, () => { subCalls++ })
      return { _tag: "div" as const, node }
    }
    defineElement(t, { widget: w, defaults: cardDefaults, attrs: { count: attrNumber } })
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.remove()  // triggers disconnectedCallback → cleanup
    const before = subCalls
    el.setAttribute("count", "1")  // should not fire subscriptions
    expect(subCalls).toBe(before)
  })

  it("remounts correctly on reconnection", () => {
    const t = tag()
    defineElement(t, {
      widget: makeCardWidget(() => {}),
      defaults: cardDefaults,
      attrs: { label: attrString },
    })
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.remove()
    document.body.appendChild(el)
    el.setAttribute("label", "reconnected")
    expect(el.shadowRoot?.querySelector("div")?.textContent).toBe("reconnected:0")
    el.remove()
  })

  it("light DOM mode renders into element itself", () => {
    const t = tag()
    defineElement(t, {
      widget: makeCardWidget(() => {}),
      defaults: cardDefaults,
      shadow: false,
      attrs: { label: attrString },
    })
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(el.shadowRoot).toBeNull()
    expect(el.querySelector("div")?.textContent).toBe(":0")
    el.remove()
  })

  it("attr alias: kebab HTML attribute maps to camelCase signal field", () => {
    type Props = { isActive: boolean; label: string }
    const t = tag()
    defineElement(t, {
      widget: (sig) => {
        const node = document.createElement("div")
        subscribe(sig, (v) => { node.textContent = `${v.label}:${v.isActive}` })
        node.textContent = `${sig.get().label}:${sig.get().isActive}`
        return { _tag: "div" as const, node }
      },
      defaults: { isActive: false, label: "" },
      attrs: {
        isActive: { name: "is-active", optic: attrBoolean },
        label: attrString,
      },
      shadow: false,
    })
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.setAttribute("is-active", "true")
    el.setAttribute("label", "hello")
    expect(el.querySelector("div")?.textContent).toBe("hello:true")
    el.remove()
  })

  it("applies CSS string as adoptedStyleSheets on shadow root", () => {
    const t = tag()
    defineElement(t, {
      widget: makeCardWidget(() => {}),
      defaults: cardDefaults,
      styles: ":host { display: block }",
    })
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(el.shadowRoot?.adoptedStyleSheets).toHaveLength(1)
    el.remove()
  })

  it("dynamic() works inside widget for local state separate from attrs", () => {
    // External props: what defineElement manages via attributes
    type ExternalProps = { label: string; count: number }
    const defaults: ExternalProps = { label: "", count: 0 }

    // Inner widget receives Signal<[boolean, ExternalProps]>
    // index(0) = local open state, index(1) = external props
    const innerWidget = (sig: Signal<[boolean, ExternalProps]>) => {
      const node = document.createElement("div")
      const localSig = sig.focus(index(0))
      const propsSig = sig.focus(index(1))

      const render = () => {
        const open = localSig.get()
        const props = propsSig.get()
        node.textContent = `${props.label}:${props.count}:${open ? "open" : "closed"}`
      }
      render()
      subscribe(sig, render)

      // Toggle local state on click
      node.addEventListener("click", () => { localSig.set(!localSig.get()) })

      return { _tag: "div" as const, node }
    }

    // dynamic(false, innerWidget) => Widget<ExternalProps> — local state hidden
    const t = tag()
    defineElement(t, {
      widget: dynamic(false, innerWidget),
      defaults,
      attrs: { label: attrString, count: attrNumber },
      shadow: false,
    })

    const el = document.createElement(t)
    document.body.appendChild(el)

    // Initial: defaults + local state = false
    expect(el.querySelector("div")?.textContent).toBe(":0:closed")

    // Attribute change updates external props only
    el.setAttribute("label", "Alice")
    expect(el.querySelector("div")?.textContent).toBe("Alice:0:closed")

    // Click toggles local state without affecting external props
    el.querySelector("div")!.click()
    expect(el.querySelector("div")?.textContent).toBe("Alice:0:open")

    // Attribute change preserves local state
    el.setAttribute("count", "5")
    expect(el.querySelector("div")?.textContent).toBe("Alice:5:open")

    el.remove()
  })
})
