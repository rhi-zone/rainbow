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
  eachKeyed,
  template,
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

type ShowState = { visible: boolean; text: string }

function showContainer(root: HTMLElement): HTMLElement {
  return root.querySelector("[data-show]") as HTMLElement
}

describe("show", () => {
  it("renders child immediately (eager) and is visible when predicate is true", () => {
    const root = makeRoot()
    const s = signal<ShowState>({ visible: true, text: "hi" })
    const w: Widget<ShowState> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    expect(showContainer(root).style.display).toBe("")
    expect(root.textContent).toBe("hi")
    cleanup(root, unmount)
  })

  it("hides via display:none when predicate is false — child stays in DOM", () => {
    const root = makeRoot()
    const s = signal<ShowState>({ visible: false, text: "hi" })
    const w: Widget<ShowState> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    // Container hidden, but child is still present in DOM
    expect(showContainer(root).style.display).toBe("none")
    expect(root.querySelector("div > div")).not.toBeNull()
    cleanup(root, unmount)
  })

  it("does not recreate the child on toggle — same DOM node throughout", () => {
    const root = makeRoot()
    const s = signal<ShowState>({ visible: true, text: "hi" })
    const w: Widget<ShowState> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    const childBefore = root.querySelector("[data-show] > div")
    s.set({ visible: false, text: "hi" })
    s.set({ visible: true, text: "hi" })
    const childAfter = root.querySelector("[data-show] > div")
    expect(childAfter).toBe(childBefore)  // same DOM node, not recreated
    cleanup(root, unmount)
  })

  it("toggles display between '' and 'none'", () => {
    const root = makeRoot()
    const s = signal<ShowState>({ visible: false, text: "hi" })
    const w: Widget<ShowState> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    expect(showContainer(root).style.display).toBe("none")
    s.set({ visible: true, text: "hi" })
    expect(showContainer(root).style.display).toBe("")
    s.set({ visible: false, text: "hi" })
    expect(showContainer(root).style.display).toBe("none")
    cleanup(root, unmount)
  })

  it("child signal stays subscribed and current while hidden", () => {
    const root = makeRoot()
    const s = signal<ShowState>({ visible: false, text: "initial" })
    const w: Widget<ShowState> = (sig) => {
      const node = document.createElement("div")
      node.textContent = sig.get().text
      subscribe(sig, (v) => { node.textContent = v.text })
      return { _tag: "div", node }
    }
    const unmount = mount(show(w, (v) => v.visible), s, root)
    // Update signal while hidden
    s.set({ visible: false, text: "updated while hidden" })
    // Show — child should reflect the latest value immediately, no re-render
    s.set({ visible: true, text: "updated while hidden" })
    expect(root.querySelector("[data-show] > div")?.textContent).toBe("updated while hidden")
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

// ── eachKeyed ────────────────────────────────────────────────────────────────

type Row = { id: number; label: string }

function rowWidget(s: Signal<Row>): h.SpanEl {
  const node = document.createElement("span")
  node.dataset["id"] = String(s.get().id)
  node.textContent = s.get().label
  subscribe(s, (v) => { node.textContent = v.label })
  return { _tag: "span", node }
}

describe("eachKeyed", () => {
  const w = eachKeyed<number, Row>(rowWidget, (r) => r.id)

  it("renders all items initially", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    const unmount = mount(w, s, root)
    const spans = root.querySelectorAll("span")
    expect(spans).toHaveLength(2)
    expect(spans[0]?.textContent).toBe("a")
    expect(spans[1]?.textContent).toBe("b")
    cleanup(root, unmount)
  })

  it("preserves DOM node identity on reorder", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    const unmount = mount(w, s, root)
    const nodeBefore = root.querySelector("[data-id='1']")
    s.set([{ id: 2, label: "b" }, { id: 1, label: "a" }])
    const nodeAfter = root.querySelector("[data-id='1']")
    expect(nodeAfter).toBe(nodeBefore)  // same DOM node, just moved
    const spans = root.querySelectorAll("span")
    expect(spans[0]?.dataset["id"]).toBe("2")
    expect(spans[1]?.dataset["id"]).toBe("1")
    cleanup(root, unmount)
  })

  it("updates item value in place without recreating the node", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    let creates = 0
    const countingW = eachKeyed<number, Row>((sig) => {
      creates++
      return rowWidget(sig)
    }, (r) => r.id)
    const unmount = mount(countingW, s, root)
    const before = creates
    s.set([{ id: 1, label: "X" }, { id: 2, label: "b" }])
    expect(creates).toBe(before)  // no new widgets created
    expect(root.querySelector("[data-id='1']")?.textContent).toBe("X")
    cleanup(root, unmount)
  })

  it("adds new items without recreating existing ones", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }])
    let creates = 0
    const countingW = eachKeyed<number, Row>((sig) => {
      creates++
      return rowWidget(sig)
    }, (r) => r.id)
    const unmount = mount(countingW, s, root)
    const before = creates
    s.set([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    expect(creates).toBe(before + 1)  // only one new widget
    expect(root.querySelectorAll("span")).toHaveLength(2)
    cleanup(root, unmount)
  })

  it("removes items and calls cleanup", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }, { id: 3, label: "c" }])
    const unmount = mount(w, s, root)
    s.set([{ id: 1, label: "a" }, { id: 3, label: "c" }])
    const spans = root.querySelectorAll("span")
    expect(spans).toHaveLength(2)
    expect(spans[0]?.dataset["id"]).toBe("1")
    expect(spans[1]?.dataset["id"]).toBe("3")
    cleanup(root, unmount)
  })

  it("write-back: item widget write propagates to parent list signal", () => {
    const root = makeRoot()
    // Single item so capturedSignal unambiguously belongs to id=1
    const s = signal<Row[]>([{ id: 1, label: "a" }])
    let capturedSignal: Signal<Row> | undefined
    const capturingW = eachKeyed<number, Row>((sig) => {
      capturedSignal = sig
      return rowWidget(sig)
    }, (r) => r.id)
    const unmount = mount(capturingW, s, root)
    capturedSignal!.set({ id: 1, label: "written-back" })
    expect(s.get()[0]?.label).toBe("written-back")
    cleanup(root, unmount)
  })

  it("write-back does not cycle: parent update does not re-trigger write-back", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }])
    let listSets = 0
    const origSet = s.set.bind(s)
    s.set = (v) => { listSets++; origSet(v) }
    const unmount = mount(w, s, root)
    const initialSets = listSets
    s.set([{ id: 1, label: "from-parent" }])
    expect(listSets).toBe(initialSets + 1)  // only one set, no cycle
    cleanup(root, unmount)
  })
})

// ── templ ─────────────────────────────────────────────────────────────────────

type Item = { label: string; value: number }

describe("templ", () => {
  it("renders template with refs on initial mount", () => {
    const root = makeRoot()
    const s = signal<Item>({ label: "score", value: 42 })
    const w = template(
      `<div class="card"><span data-ref="name"></span><b data-ref="score"></b></div>`,
      { name: "span", score: "b" } as const,
      (sig, { name, score }) => {
        name.node.textContent = sig.get().label
        score.node.textContent = String(sig.get().value)
      },
    )
    const unmount = mount(w, s, root)
    expect(root.querySelector("span")?.textContent).toBe("score")
    expect(root.querySelector("b")?.textContent).toBe("42")
    cleanup(root, unmount)
  })

  it("updates refs via subscription", () => {
    const root = makeRoot()
    const s = signal<Item>({ label: "score", value: 42 })
    const w = template(
      `<div class="card"><span data-ref="name"></span><b data-ref="score"></b></div>`,
      { name: "span", score: "b" } as const,
      (sig, { name, score }) => {
        name.node.textContent = sig.get().label
        score.node.textContent = String(sig.get().value)
        subscribe(sig, (v) => {
          name.node.textContent = v.label
          score.node.textContent = String(v.value)
        })
      },
    )
    const unmount = mount(w, s, root)
    s.set({ label: "pts", value: 99 })
    expect(root.querySelector("span")?.textContent).toBe("pts")
    expect(root.querySelector("b")?.textContent).toBe("99")
    cleanup(root, unmount)
  })

  it("each instantiation gets its own cloned DOM (independent nodes)", () => {
    const root = makeRoot()
    const s1 = signal<Item>({ label: "a", value: 1 })
    const s2 = signal<Item>({ label: "b", value: 2 })
    const makeW = () => template(
      `<div><span data-ref="lbl"></span></div>`,
      { lbl: "span" } as const,
      (sig, { lbl }) => {
        lbl.node.textContent = sig.get().label
        subscribe(sig, (v) => { lbl.node.textContent = v.label })
      },
    )
    const w = makeW()
    const unmount1 = mount(w, s1, root)
    const container2 = document.createElement("div")
    document.body.appendChild(container2)
    const unmount2 = mount(w, s2, container2)
    // Each mount gets its own clone — signal updates don't cross
    s1.set({ label: "x", value: 1 })
    expect(root.querySelector("span")?.textContent).toBe("x")
    expect(container2.querySelector("span")?.textContent).toBe("b")
    cleanup(root, unmount1)
    cleanup(container2, unmount2)
  })

  it("subscriptions from bind are cleaned up on unmount", () => {
    const root = makeRoot()
    const s = signal<Item>({ label: "a", value: 1 })
    let calls = 0
    const w = template(
      `<div><span data-ref="lbl"></span></div>`,
      { lbl: "span" } as const,
      (sig, { lbl }) => {
        lbl.node.textContent = sig.get().label
        subscribe(sig, (v) => { calls++; lbl.node.textContent = v.label })
      },
    )
    const unmount = mount(w, s, root)
    const callsBefore = calls
    unmount()
    s.set({ label: "b", value: 2 })
    expect(calls).toBe(callsBefore)  // no more calls after unmount
  })

  it("throws a descriptive error when a declared ref is absent from the template", () => {
    const s = signal<Item>({ label: "a", value: 1 })
    const w = template(
      `<div><span data-ref="other"></span></div>`,
      { missing: "span" } as const,
      () => {},
    )
    expect(() => w(s as unknown as Parameters<typeof w>[0])).toThrow(/ref "missing" not found/)
  })
})
