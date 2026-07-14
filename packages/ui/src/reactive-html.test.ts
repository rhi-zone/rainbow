/**
 * reactive-html tests.
 *
 * Uses happy-dom (via vitest) for a lightweight DOM environment.
 */

import { describe, it, expect } from "vitest"
import { signal } from "@rhi-zone/rainbow"
import { mount } from "./widget.js"
import { r } from "./reactive-html.js"

function makeRoot(): HTMLDivElement {
  const root = document.createElement("div")
  document.body.appendChild(root)
  return root
}

describe("r.*", () => {
  it("sets a static attribute once", () => {
    const root = makeRoot()
    const s = signal(0)
    const unmount = mount(r.div({ id: "foo", class: "bar" }, "hi"), s, root)
    const el = root.querySelector("div")!
    expect(el.getAttribute("id")).toBe("foo")
    expect(el.getAttribute("class")).toBe("bar")
    expect(el.textContent).toBe("hi")
    unmount()
  })

  it("sets a reactive attribute from a thunk and updates on signal change", () => {
    const root = makeRoot()
    const active = signal(false)
    const s = signal(0)
    const unmount = mount(
      r.div({ class: () => (active.get() ? "active" : "") }),
      s,
      root,
    )
    const el = root.querySelector("div")!
    expect(el.getAttribute("class")).toBe("")

    active.set(true)
    expect(el.getAttribute("class")).toBe("active")

    active.set(false)
    expect(el.getAttribute("class")).toBe("")
    unmount()
  })

  it("removes the attribute when the thunk returns undefined/false", () => {
    const root = makeRoot()
    const show = signal(true)
    const s = signal(0)
    const unmount = mount(
      r.div({ "data-flag": () => (show.get() ? "yes" : undefined) }),
      s,
      root,
    )
    const el = root.querySelector("div")!
    expect(el.getAttribute("data-flag")).toBe("yes")

    show.set(false)
    expect(el.hasAttribute("data-flag")).toBe(false)
    unmount()
  })

  it("supports mixed static and reactive attributes plus nested r.* children", () => {
    const root = makeRoot()
    const s = signal(0)
    const unmount = mount(
      r.div(
        { id: "wrap" },
        r.span({ class: () => `count-${s.get()}` }, "hello"),
      ),
      s,
      root,
    )
    const wrap = root.querySelector("div")!
    const span = wrap.querySelector("span")!
    expect(wrap.getAttribute("id")).toBe("wrap")
    expect(span.getAttribute("class")).toBe("count-0")
    expect(span.textContent).toBe("hello")

    s.set(5)
    expect(span.getAttribute("class")).toBe("count-5")
    unmount()
  })

  it("cleans up subscriptions on unmount", () => {
    const root = makeRoot()
    const active = signal(false)
    const s = signal(0)
    const unmount = mount(r.div({ class: () => (active.get() ? "active" : "") }), s, root)
    const el = root.querySelector("div")!
    unmount()

    // After unmount, further signal changes must not throw or touch the (removed) node.
    active.set(true)
    expect(el.getAttribute("class")).toBe("")
  })
})
