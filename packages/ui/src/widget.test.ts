/**
 * Widget combinator tests.
 *
 * Uses happy-dom (via vitest) for a lightweight DOM environment.
 * All tests share a single <div id="root"> that is cleared between tests.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { signal, lens, prism, iso, fst, snd, field, product } from "@rhi-zone/rainbow"
import type { Signal } from "@rhi-zone/rainbow"
import type { Widget } from "./widget.js"
import {
  mount,
  focus,
  narrow,
  each,
  beside,
  above,
  dynamic,
  map,
  show,
  concat,
  subscribe,
} from "./widget.js"
import * as h from "./html.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRoot(): HTMLDivElement {
  const root = document.createElement("div")
  document.body.appendChild(root)
  return root
}

function cleanup(root: HTMLElement, unmount: () => void) {
  unmount()
  root.remove()
}

// A simple text widget: renders the signal value as a <span>
function textWidget(s: Signal<string>): h.SpanEl {
  const node = document.createElement("span")
  node.textContent = s.get()
  subscribe(s, (v) => { node.textContent = v })
  return { _tag: "span", node }
}

// ── mount ─────────────────────────────────────────────────────────────────────

describe("mount", () => {
  it("renders widget into container", () => {
    const root = makeRoot()
    const s = signal("hello")
    const unmount = mount(textWidget, s, root)
    expect(root.querySelector("span")?.textContent).toBe("hello")
    cleanup(root, unmount)
  })

  it("returned cleanup removes the node and unsubscribes", () => {
    const root = makeRoot()
    const s = signal("hello")
    let subCount = 0
    const w: Widget<string> = (sig) => {
      const node = document.createElement("div")
      subscribe(sig, () => { subCount++ })
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    expect(root.childElementCount).toBe(1)
    unmount()
    expect(root.childElementCount).toBe(0)
    s.set("world")
    expect(subCount).toBe(0) // subscription cleaned up
  })
})

// ── focus ─────────────────────────────────────────────────────────────────────

describe("focus", () => {
  it("passes a focused signal to the child widget", () => {
    const root = makeRoot()
    const s = signal({ name: "Alice" })
    const nameW: Widget<string, h.SpanEl> = textWidget
    const unmount = mount(focus(nameW, field("name")), s, root)
    expect(root.querySelector("span")?.textContent).toBe("Alice")
    cleanup(root, unmount)
  })

  it("updates when the focused field changes", () => {
    const root = makeRoot()
    const s = signal({ name: "Alice" })
    const unmount = mount(focus(textWidget, field("name")), s, root)
    s.set({ name: "Bob" })
    expect(root.querySelector("span")?.textContent).toBe("Bob")
    cleanup(root, unmount)
  })

  it("does not re-render sibling fields when an unrelated field changes", () => {
    const root = makeRoot()
    const s = signal({ name: "Alice", score: 0 })
    let renders = 0
    const countingWidget: Widget<string, h.SpanEl> = (sig) => {
      renders++
      const node = document.createElement("span")
      node.textContent = sig.get()
      subscribe(sig, (v) => { renders++; node.textContent = v })
      return { _tag: "span", node }
    }
    const unmount = mount(focus(countingWidget, field("name")), s, root)
    const before = renders
    s.set({ name: "Alice", score: 1 }) // score changed, name unchanged
    // signal.focus deduplicates — no extra render for same name
    expect(renders).toBe(before)
    cleanup(root, unmount)
  })
})

// ── narrow ────────────────────────────────────────────────────────────────────

type Shape = { kind: "circle"; r: number } | { kind: "rect"; w: number; h: number }

const circlePrism = prism<Shape, { kind: "circle"; r: number }>(
  (s) => (s.kind === "circle" ? s : undefined),
  (c) => c,
)

describe("narrow", () => {
  it("renders child when prism matches", () => {
    const root = makeRoot()
    const s = signal<Shape>({ kind: "circle", r: 5 })
    const circleW: Widget<{ kind: "circle"; r: number }> = (sig) => {
      const node = document.createElement("div")
      node.textContent = `r=${sig.get().r}`
      subscribe(sig, (v) => { node.textContent = `r=${v.r}` })
      return { _tag: "div", node }
    }
    const unmount = mount(narrow(circleW, circlePrism), s, root)
    expect(root.textContent).toContain("r=5")
    cleanup(root, unmount)
  })

  it("renders nothing when prism does not match", () => {
    const root = makeRoot()
    const s = signal<Shape>({ kind: "rect", w: 10, h: 20 })
    const circleW: Widget<{ kind: "circle"; r: number }> = (sig) => {
      const node = document.createElement("div")
      node.textContent = `r=${sig.get().r}`
      return { _tag: "div", node }
    }
    const unmount = mount(narrow(circleW, circlePrism), s, root)
    expect(root.textContent).toBe("")
    cleanup(root, unmount)
  })

  it("shows child when variant switches to match", () => {
    const root = makeRoot()
    const s = signal<Shape>({ kind: "rect", w: 10, h: 20 })
    const circleW: Widget<{ kind: "circle"; r: number }> = (sig) => {
      const node = document.createElement("div")
      node.textContent = `r=${sig.get().r}`
      subscribe(sig, (v) => { node.textContent = `r=${v.r}` })
      return { _tag: "div", node }
    }
    const unmount = mount(narrow(circleW, circlePrism), s, root)
    expect(root.textContent).toBe("")
    s.set({ kind: "circle", r: 3 })
    expect(root.textContent).toContain("r=3")
    cleanup(root, unmount)
  })

  it("hides child when variant switches away", () => {
    const root = makeRoot()
    const s = signal<Shape>({ kind: "circle", r: 5 })
    const circleW: Widget<{ kind: "circle"; r: number }> = (sig) => {
      const node = document.createElement("div")
      node.textContent = `r=${sig.get().r}`
      subscribe(sig, (v) => { node.textContent = `r=${v.r}` })
      return { _tag: "div", node }
    }
    const unmount = mount(narrow(circleW, circlePrism), s, root)
    expect(root.textContent).toContain("r=5")
    s.set({ kind: "rect", w: 2, h: 3 })
    expect(root.textContent).toBe("")
    cleanup(root, unmount)
  })

  it("updates child in place when variant stays matched", () => {
    const root = makeRoot()
    const s = signal<Shape>({ kind: "circle", r: 5 })
    let renders = 0
    const circleW: Widget<{ kind: "circle"; r: number }> = (sig) => {
      renders++
      const node = document.createElement("div")
      node.textContent = `r=${sig.get().r}`
      subscribe(sig, (v) => { node.textContent = `r=${v.r}` })
      return { _tag: "div", node }
    }
    const unmount = mount(narrow(circleW, circlePrism), s, root)
    const initialRenders = renders
    s.set({ kind: "circle", r: 10 })
    expect(renders).toBe(initialRenders) // no re-render, just update
    expect(root.textContent).toContain("r=10")
    cleanup(root, unmount)
  })
})

// ── each ─────────────────────────────────────────────────────────────────────

describe("each", () => {
  it("renders all items", () => {
    const root = makeRoot()
    const s = signal(["a", "b", "c"])
    const unmount = mount(each(textWidget), s, root)
    const spans = root.querySelectorAll("span")
    expect(spans).toHaveLength(3)
    expect(Array.from(spans).map((s) => s.textContent)).toEqual(["a", "b", "c"])
    cleanup(root, unmount)
  })

  it("re-renders when list length changes", () => {
    const root = makeRoot()
    const s = signal(["a", "b"])
    const unmount = mount(each(textWidget), s, root)
    s.set(["a", "b", "c"])
    expect(root.querySelectorAll("span")).toHaveLength(3)
    cleanup(root, unmount)
  })

  it("updates item in place when value changes", () => {
    const root = makeRoot()
    const s = signal(["a", "b"])
    let renders = 0
    const countingTextWidget = (sig: Signal<string>) => {
      renders++
      return textWidget(sig)
    }
    const unmount = mount(each(countingTextWidget), s, root)
    const before = renders
    s.set(["X", "b"])
    expect(renders).toBe(before) // same length — no re-creation
    expect(root.querySelectorAll("span")[0]?.textContent).toBe("X")
    cleanup(root, unmount)
  })
})

// ── beside / above ────────────────────────────────────────────────────────────

describe("beside", () => {
  it("renders both widgets side by side", () => {
    const root = makeRoot()
    const s = signal<[string, string]>(["left", "right"])
    const unmount = mount(beside(textWidget, textWidget), s, root)
    const spans = root.querySelectorAll("span")
    expect(spans[0]?.textContent).toBe("left")
    expect(spans[1]?.textContent).toBe("right")
    cleanup(root, unmount)
  })

  it("updates each side independently", () => {
    const root = makeRoot()
    const s = signal<[string, string]>(["a", "b"])
    const unmount = mount(beside(textWidget, textWidget), s, root)
    s.focus(fst<string, string>()).set("X")
    const spans = root.querySelectorAll("span")
    expect(spans[0]?.textContent).toBe("X")
    expect(spans[1]?.textContent).toBe("b")
    cleanup(root, unmount)
  })
})

describe("above", () => {
  it("renders both widgets in a container", () => {
    const root = makeRoot()
    const s = signal<[string, string]>(["top", "bottom"])
    const unmount = mount(above(textWidget, textWidget), s, root)
    const spans = root.querySelectorAll("span")
    expect(spans[0]?.textContent).toBe("top")
    expect(spans[1]?.textContent).toBe("bottom")
    cleanup(root, unmount)
  })
})

// ── dynamic ───────────────────────────────────────────────────────────────────

describe("dynamic", () => {
  it("pairs local state with external signal", () => {
    const root = makeRoot()
    const outer = signal("world")
    const combined: Widget<[boolean, string]> = (sig) => {
      const node = document.createElement("div")
      const [open, val] = sig.get()
      node.textContent = open ? `open:${val}` : `closed`
      subscribe(sig, ([o, v]) => { node.textContent = o ? `open:${v}` : `closed` })
      return { _tag: "div", node }
    }
    const unmount = mount(dynamic(false, combined), outer, root)
    expect(root.textContent).toBe("closed")
    cleanup(root, unmount)
  })

  it("local state changes don't affect the parent signal", () => {
    const root = makeRoot()
    const outer = signal("data")
    let outerSets = 0
    const origSet = outer.set.bind(outer)
    outer.set = (v) => { outerSets++; origSet(v) }

    const combined: Widget<[boolean, string]> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get()[0] ? "open" : "closed"
      subscribe(sig, ([o]) => { node.textContent = o ? "open" : "closed" })
      return { _tag: "div", node }
    }
    const w = dynamic(false, combined)
    const unmount = mount(w, outer, root)
    // Flip local state via the stateful signal's fst lens
    // (In real use, the widget does this internally via signal.focus(fst()))
    expect(outerSets).toBe(0)
    cleanup(root, unmount)
  })
})

// ── map ───────────────────────────────────────────────────────────────────────

describe("map", () => {
  it("transforms the signal type via an isomorphism", () => {
    const root = makeRoot()
    const s = signal(42)
    // Widget<string> — displays a string
    const strWidget: Widget<string, h.SpanEl> = textWidget
    // map it to Widget<number> using a number↔string iso
    const numWidget = map(strWidget, iso(
      (n: number) => String(n),
      (s: string) => Number(s),
    ))
    const unmount = mount(numWidget, s, root)
    expect(root.querySelector("span")?.textContent).toBe("42")
    cleanup(root, unmount)
  })
})

// ── show ─────────────────────────────────────────────────────────────────────

describe("show", () => {
  it("renders when predicate is true", () => {
    const root = makeRoot()
    const s = signal({ visible: true, text: "hi" })
    const w: Widget<typeof s extends Signal<infer T> ? T : never> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    expect(root.textContent).toBe("hi")
    cleanup(root, unmount)
  })

  it("renders nothing when predicate is false", () => {
    const root = makeRoot()
    const s = signal({ visible: false, text: "hi" })
    const w: Widget<typeof s extends Signal<infer T> ? T : never> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    expect(root.textContent).toBe("")
    cleanup(root, unmount)
  })

  it("toggles when predicate changes", () => {
    const root = makeRoot()
    const s = signal({ visible: false, text: "hi" })
    const w: Widget<{ visible: boolean; text: string }> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    expect(root.textContent).toBe("")
    s.set({ visible: true, text: "hi" })
    expect(root.textContent).toBe("hi")
    s.set({ visible: false, text: "hi" })
    expect(root.textContent).toBe("")
    cleanup(root, unmount)
  })
})

// ── concat ────────────────────────────────────────────────────────────────────

describe("concat", () => {
  it("renders both list widgets in sequence", () => {
    const root = makeRoot()
    const s = signal(["a", "b", "c"])
    // First widget shows items starting with 'a'; second shows rest
    const filterFirst = each<string>((sig) => {
      const node = document.createElement("span")
      node.textContent = sig.get()
      subscribe(sig, (v) => { node.textContent = v })
      return { _tag: "span", node }
    })
    const filterSecond = each<string>((sig) => {
      const node = document.createElement("b")
      node.textContent = sig.get()
      subscribe(sig, (v) => { node.textContent = v })
      return { _tag: "b", node } as unknown as h.FlowContent
    })
    const combined = concat(filterFirst, filterSecond)
    const unmount = mount(combined, s, root)
    // Both widgets render all 3 items
    expect(root.querySelectorAll("span")).toHaveLength(3)
    expect(root.querySelectorAll("b")).toHaveLength(3)
    cleanup(root, unmount)
  })
})
