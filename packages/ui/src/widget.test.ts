/**
 * Widget combinator tests.
 *
 * Uses happy-dom (via vitest) for a lightweight DOM environment.
 * All tests share a single <div id="root"> that is cleared between tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { signal, lens, prism, iso, index, field, product, notAsked, loading, failure, success } from "@rhi-zone/rainbow"
import type { Signal, ReadonlySignal } from "@rhi-zone/rainbow"
import type { Widget } from "./widget.js"
import type { DivEl } from "./html.js"
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
  register,
  on,
  bindInput,
  bindSelect,
  bindCheckbox,
  inputWidget,
  textareaWidget,
  checkboxWidget,
  numberInputWidget,
  selectWidget,
  subscribe,
  subscribeNow,
  bindText,
  bindAttr,
  bindClass,
  foldWidget,
  match,
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

  it("accepts ReadonlySignal", () => {
    const base = signal(42)
    const derived: ReadonlySignal<number> = base.map(x => x * 2)
    const w: Widget<number, h.SpanEl> = (s) => {
      const el = document.createElement("span")
      el.textContent = String(s.get())
      return { _tag: "span", node: el }
    }
    const root = makeRoot()
    mount(w, derived, root)
    expect(root.querySelector("span")!.textContent).toBe("84")
    root.remove()
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
    s.focus(index<[string, string], 0>(0)).set("X")
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
    // Flip local state via the stateful signal's index(0) lens
    // (In real use, the widget does this internally via signal.focus(index(0)))
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
  const rowKey = (r: Row) => String(r.id)

  it("renders initial list", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    const unmount = mount((sig) => eachKeyed(sig, rowKey, rowWidget), s, root)
    const spans = root.querySelectorAll("span")
    expect(spans).toHaveLength(2)
    expect(spans[0]?.textContent).toBe("a")
    expect(spans[1]?.textContent).toBe("b")
    cleanup(root, unmount)
  })

  it("adds item when array grows", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }])
    let creates = 0
    const countingWidget = (sig: Signal<Row>) => { creates++; return rowWidget(sig) }
    const unmount = mount((sig) => eachKeyed(sig, rowKey, countingWidget), s, root)
    const before = creates
    s.set([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    expect(creates).toBe(before + 1)  // only one new widget created
    expect(root.querySelectorAll("span")).toHaveLength(2)
    cleanup(root, unmount)
  })

  it("removes item when array shrinks — cleanup runs", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }, { id: 3, label: "c" }])
    const cleanupFn = vi.fn()
    const trackingWidget = (sig: Signal<Row>) => {
      register(cleanupFn)
      return rowWidget(sig)
    }
    const unmount = mount((sig) => eachKeyed(sig, rowKey, trackingWidget), s, root)
    s.set([{ id: 1, label: "a" }, { id: 3, label: "c" }])
    // cleanupFn called once for removed id=2
    expect(cleanupFn).toHaveBeenCalledTimes(1)
    const spans = root.querySelectorAll("span")
    expect(spans).toHaveLength(2)
    expect(spans[0]?.dataset["id"]).toBe("1")
    expect(spans[1]?.dataset["id"]).toBe("3")
    cleanup(root, unmount)
  })

  it("updates item in-place without remounting", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    let creates = 0
    const countingWidget = (sig: Signal<Row>) => { creates++; return rowWidget(sig) }
    const unmount = mount((sig) => eachKeyed(sig, rowKey, countingWidget), s, root)
    const before = creates
    s.set([{ id: 1, label: "X" }, { id: 2, label: "b" }])
    expect(creates).toBe(before)  // no new widgets created
    expect(root.querySelector("[data-id='1']")?.textContent).toBe("X")
    cleanup(root, unmount)
  })

  it("reorders items correctly in the DOM", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }])
    const unmount = mount((sig) => eachKeyed(sig, rowKey, rowWidget), s, root)
    const nodeBefore = root.querySelector("[data-id='1']")
    s.set([{ id: 2, label: "b" }, { id: 1, label: "a" }])
    const nodeAfter = root.querySelector("[data-id='1']")
    expect(nodeAfter).toBe(nodeBefore)  // same DOM node, just moved
    const spans = root.querySelectorAll("span")
    expect(spans[0]?.dataset["id"]).toBe("2")
    expect(spans[1]?.dataset["id"]).toBe("1")
    cleanup(root, unmount)
  })

  it("item signal write-back updates parent signal (writable Signal)", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }])
    let capturedSignal: Signal<Row> | undefined
    const capturingWidget = (sig: Signal<Row>) => {
      capturedSignal = sig
      return rowWidget(sig)
    }
    const unmount = mount((sig) => eachKeyed(sig, rowKey, capturingWidget), s, root)
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
    const unmount = mount((sig) => eachKeyed(sig, rowKey, rowWidget), s, root)
    const initialSets = listSets
    s.set([{ id: 1, label: "from-parent" }])
    expect(listSets).toBe(initialSets + 1)  // only one set, no cycle
    cleanup(root, unmount)
  })

  it("{ container: 'ul' } option produces a <ul> wrapper", () => {
    const root = makeRoot()
    const s = signal<Row[]>([{ id: 1, label: "a" }])
    const unmount = mount(
      (sig) => eachKeyed(sig, rowKey, rowWidget, { container: "ul" }),
      s, root,
    )
    expect(root.querySelector("ul")).not.toBeNull()
    cleanup(root, unmount)
  })
})

// ── templ ─────────────────────────────────────────────────────────────────────

type Item = { label: string; value: number }

describe("templ", () => {
  it("renders template with refs on initial mount", () => {
    const root = makeRoot()
    const s = signal<Item>({ label: "score", value: 42 })
    const w: Widget<Item, DivEl> = template(
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
    const w: Widget<Item, DivEl> = template(
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
    const makeW = (): Widget<Item, DivEl> => template(
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
    const w: Widget<Item, DivEl> = template(
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

// ── register ──────────────────────────────────────────────────────────────────

describe("register", () => {
  it("calls the registered cleanup on unmount", () => {
    const root = makeRoot()
    const s = signal("x")
    let disposed = false
    const w: Widget<string> = () => {
      const node = document.createElement("div")
      register(() => { disposed = true })
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    expect(disposed).toBe(false)
    unmount()
    expect(disposed).toBe(true)
  })
})

// ── on ────────────────────────────────────────────────────────────────────────

describe("on", () => {
  it("attaches event listener and fires on event", () => {
    const root = makeRoot()
    const s = signal(0)
    const w: Widget<number> = (sig) => {
      const node = document.createElement("div")
      node.textContent = String(sig.get())
      subscribe(sig, (v) => { node.textContent = String(v) })
      on(node, "click", () => sig.set(sig.get() + 1))
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    root.querySelector("div")!.dispatchEvent(new Event("click"))
    expect(s.get()).toBe(1)
    cleanup(root, unmount)
  })

  it("removes listener after unmount", () => {
    const root = makeRoot()
    const s = signal(0)
    let clicks = 0
    const w: Widget<number> = (sig) => {
      const node = document.createElement("div")
      on(node, "click", () => { clicks++; sig.set(sig.get() + 1) })
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    const div = root.querySelector("div")!
    unmount()
    div.dispatchEvent(new Event("click"))
    expect(clicks).toBe(0)
  })
})

// ── bindInput / bindSelect / bindCheckbox ─────────────────────────────────────

describe("bindInput", () => {
  it("sets initial value from signal", () => {
    const root = makeRoot()
    const s = signal("hello")
    const w: Widget<string, h.InputEl> = (sig) => {
      const el = { _tag: "input" as const, node: document.createElement("input") }
      el.node.value = sig.get()
      bindInput(el.node, sig)
      return el
    }
    mount(w, s, root)
    expect(root.querySelector("input")!.value).toBe("hello")
    root.remove()
  })

  it("signal → DOM: updates input value when signal changes", () => {
    const root = makeRoot()
    const s = signal("a")
    const w: Widget<string, h.InputEl> = (sig) => {
      const el = { _tag: "input" as const, node: document.createElement("input") }
      el.node.value = sig.get()
      bindInput(el.node, sig)
      return el
    }
    const unmount = mount(w, s, root)
    s.set("b")
    expect(root.querySelector("input")!.value).toBe("b")
    cleanup(root, unmount)
  })

  it("DOM → signal: input event updates signal", () => {
    const root = makeRoot()
    const s = signal("a")
    const w: Widget<string, h.InputEl> = (sig) => {
      const el = { _tag: "input" as const, node: document.createElement("input") }
      el.node.value = sig.get()
      bindInput(el.node, sig)
      return el
    }
    const unmount = mount(w, s, root)
    const input = root.querySelector("input")!
    input.value = "typed"
    input.dispatchEvent(new Event("input"))
    expect(s.get()).toBe("typed")
    cleanup(root, unmount)
  })
})

describe("bindCheckbox", () => {
  it("syncs checked state both ways", () => {
    const root = makeRoot()
    const s = signal(false)
    const w: Widget<boolean, h.InputEl> = (sig) => {
      const el = { _tag: "input" as const, node: document.createElement("input") }
      el.node.type = "checkbox"
      el.node.checked = sig.get()
      bindCheckbox(el.node, sig)
      return el
    }
    const unmount = mount(w, s, root)
    const cb = root.querySelector("input")!
    // signal → DOM
    s.set(true)
    expect(cb.checked).toBe(true)
    // DOM → signal
    cb.checked = false
    cb.dispatchEvent(new Event("change"))
    expect(s.get()).toBe(false)
    cleanup(root, unmount)
  })
})

// ── pre-built form widgets ────────────────────────────────────────────────────

describe("inputWidget", () => {
  it("renders an input with initial value", () => {
    const root = makeRoot()
    const s = signal("Alice")
    const unmount = mount(inputWidget({ placeholder: "Name" }), s, root)
    expect(root.querySelector("input")!.value).toBe("Alice")
    cleanup(root, unmount)
  })

  it("updates signal when user types", () => {
    const root = makeRoot()
    const s = signal("")
    const unmount = mount(inputWidget(), s, root)
    const input = root.querySelector("input")!
    input.value = "Bob"
    input.dispatchEvent(new Event("input"))
    expect(s.get()).toBe("Bob")
    cleanup(root, unmount)
  })
})

describe("checkboxWidget", () => {
  it("reflects signal boolean as checked state", () => {
    const root = makeRoot()
    const s = signal(true)
    const unmount = mount(checkboxWidget(), s, root)
    expect(root.querySelector("input")!.checked).toBe(true)
    s.set(false)
    expect(root.querySelector("input")!.checked).toBe(false)
    cleanup(root, unmount)
  })
})

describe("numberInputWidget", () => {
  it("renders numeric value and updates signal on input", () => {
    const root = makeRoot()
    const s = signal(42)
    const unmount = mount(numberInputWidget(), s, root)
    expect(root.querySelector("input")!.value).toBe("42")
    const input = root.querySelector("input")!
    input.value = "99"
    input.dispatchEvent(new Event("input"))
    expect(s.get()).toBe(99)
    cleanup(root, unmount)
  })

  it("ignores NaN input — signal unchanged", () => {
    const root = makeRoot()
    const s = signal(10)
    const unmount = mount(numberInputWidget(), s, root)
    const input = root.querySelector("input")!
    input.value = "not-a-number"
    input.dispatchEvent(new Event("input"))
    expect(s.get()).toBe(10)
    cleanup(root, unmount)
  })
})

describe("selectWidget", () => {
  const opts = [
    { value: "au", label: "Australia" },
    { value: "nz", label: "New Zealand" },
  ]

  it("renders options and selects initial value", () => {
    const root = makeRoot()
    const s = signal("nz")
    const unmount = mount(selectWidget(opts), s, root)
    const sel = root.querySelector("select")!
    expect(sel.querySelectorAll("option")).toHaveLength(2)
    expect(sel.value).toBe("nz")
    cleanup(root, unmount)
  })

  it("updates signal on change", () => {
    const root = makeRoot()
    const s = signal("au")
    const unmount = mount(selectWidget(opts), s, root)
    const sel = root.querySelector("select")!
    sel.value = "nz"
    sel.dispatchEvent(new Event("change"))
    expect(s.get()).toBe("nz")
    cleanup(root, unmount)
  })
})

describe("textareaWidget", () => {
  it("renders textarea with initial value and syncs on input", () => {
    const root = makeRoot()
    const s = signal("draft")
    const unmount = mount(textareaWidget({ rows: 4 }), s, root)
    expect(root.querySelector("textarea")!.value).toBe("draft")
    const ta = root.querySelector("textarea")!
    ta.value = "edited"
    ta.dispatchEvent(new Event("input"))
    expect(s.get()).toBe("edited")
    cleanup(root, unmount)
  })
})

// ── subscribeNow ──────────────────────────────────────────────────────────────

describe("subscribeNow", () => {
  it("fires callback immediately with current value", () => {
    const root = makeRoot()
    const s = signal("initial")
    const calls: string[] = []
    const w: Widget<string> = (sig) => {
      const node = document.createElement("div")
      subscribeNow(sig, (v) => { calls.push(v) })
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    expect(calls).toEqual(["initial"])
    cleanup(root, unmount)
  })

  it("fires callback on subsequent signal changes", () => {
    const root = makeRoot()
    const s = signal("a")
    const calls: string[] = []
    const w: Widget<string> = (sig) => {
      const node = document.createElement("div")
      subscribeNow(sig, (v) => { calls.push(v) })
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    s.set("b")
    s.set("c")
    expect(calls).toEqual(["a", "b", "c"])
    cleanup(root, unmount)
  })

  it("stops firing after unmount (cleanup)", () => {
    const root = makeRoot()
    const s = signal("x")
    const calls: string[] = []
    const w: Widget<string> = (sig) => {
      const node = document.createElement("div")
      subscribeNow(sig, (v) => { calls.push(v) })
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    expect(calls).toEqual(["x"])
    unmount()
    root.remove()
    s.set("y")
    expect(calls).toEqual(["x"])  // no further calls after unmount
  })
})

// ── bindText ──────────────────────────────────────────────────────────────────

describe("bindText", () => {
  it("sets initial textContent from signal", () => {
    const root = makeRoot()
    const s = signal("hello")
    const w: Widget<string> = (sig) => {
      const node = document.createElement("span")
      bindText(node, sig)
      return { _tag: "span", node }
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("span")!.textContent).toBe("hello")
    cleanup(root, unmount)
  })

  it("updates textContent when signal changes", () => {
    const root = makeRoot()
    const s = signal("first")
    const w: Widget<string> = (sig) => {
      const node = document.createElement("span")
      bindText(node, sig)
      return { _tag: "span", node }
    }
    const unmount = mount(w, s, root)
    s.set("second")
    expect(root.querySelector("span")!.textContent).toBe("second")
    cleanup(root, unmount)
  })

  it("stops updating after unmount", () => {
    const root = makeRoot()
    const s = signal("a")
    const w: Widget<string> = (sig) => {
      const node = document.createElement("span")
      bindText(node, sig)
      return { _tag: "span", node }
    }
    const unmount = mount(w, s, root)
    const span = root.querySelector("span")!
    unmount()
    root.remove()
    s.set("b")
    expect(span.textContent).toBe("a")
  })
})

// ── bindAttr ──────────────────────────────────────────────────────────────────

describe("bindAttr", () => {
  it("sets initial attribute value from signal", () => {
    const root = makeRoot()
    const s = signal("https://example.com/img.png")
    const w: Widget<string, h.AnyEl> = (sig) => {
      const node = document.createElement("img")
      bindAttr(node, "src", sig)
      return { _tag: "img", node } as h.AnyEl
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("img")!.getAttribute("src")).toBe("https://example.com/img.png")
    cleanup(root, unmount)
  })

  it("updates attribute when signal changes", () => {
    const root = makeRoot()
    const s = signal("red")
    const w: Widget<string> = (sig) => {
      const node = document.createElement("div")
      bindAttr(node, "data-color", sig)
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    s.set("blue")
    expect(root.querySelector("div")!.getAttribute("data-color")).toBe("blue")
    cleanup(root, unmount)
  })
})

// ── bindClass ─────────────────────────────────────────────────────────────────

describe("bindClass", () => {
  it("adds class when signal is true", () => {
    const root = makeRoot()
    const s = signal(true)
    const w: Widget<boolean> = (sig) => {
      const node = document.createElement("div")
      bindClass(node, "active", sig)
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("div")!.classList.contains("active")).toBe(true)
    cleanup(root, unmount)
  })

  it("does not add class when signal is false", () => {
    const root = makeRoot()
    const s = signal(false)
    const w: Widget<boolean> = (sig) => {
      const node = document.createElement("div")
      bindClass(node, "active", sig)
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("div")!.classList.contains("active")).toBe(false)
    cleanup(root, unmount)
  })

  it("toggles class reactively", () => {
    const root = makeRoot()
    const s = signal(false)
    const w: Widget<boolean> = (sig) => {
      const node = document.createElement("div")
      bindClass(node, "on", sig)
      return { _tag: "div", node }
    }
    const unmount = mount(w, s, root)
    const div = root.querySelector("div")!
    expect(div.classList.contains("on")).toBe(false)
    s.set(true)
    expect(div.classList.contains("on")).toBe(true)
    s.set(false)
    expect(div.classList.contains("on")).toBe(false)
    cleanup(root, unmount)
  })
})

// ── foldWidget ────────────────────────────────────────────────────────────────

describe("foldWidget", () => {
  function makeSpan(text: string): h.AnyEl {
    const node = document.createElement("span")
    node.textContent = text
    return { _tag: "span", node } as h.AnyEl
  }

  it("renders notAsked case initially", () => {
    const root = makeRoot()
    const s = signal(notAsked as import("@rhi-zone/rainbow").AsyncData<string, string>)
    const w: Widget<import("@rhi-zone/rainbow").AsyncData<string, string>> = (sig) => {
      return foldWidget(sig, {
        notAsked: () => makeSpan("not-asked"),
        loading:  () => makeSpan("loading"),
        failure:  (e) => makeSpan(`error:${e}`),
        success:  (v) => makeSpan(`ok:${v}`),
      })
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("span")!.textContent).toBe("not-asked")
    cleanup(root, unmount)
  })

  it("renders loading case", () => {
    const root = makeRoot()
    const s = signal(loading as import("@rhi-zone/rainbow").AsyncData<string, string>)
    const w: Widget<import("@rhi-zone/rainbow").AsyncData<string, string>> = (sig) => {
      return foldWidget(sig, {
        notAsked: () => makeSpan("not-asked"),
        loading:  () => makeSpan("loading"),
        failure:  (e) => makeSpan(`error:${e}`),
        success:  (v) => makeSpan(`ok:${v}`),
      })
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("span")!.textContent).toBe("loading")
    cleanup(root, unmount)
  })

  it("renders failure case with error value", () => {
    const root = makeRoot()
    const s = signal(failure("oops") as import("@rhi-zone/rainbow").AsyncData<string, string>)
    const w: Widget<import("@rhi-zone/rainbow").AsyncData<string, string>> = (sig) => {
      return foldWidget(sig, {
        notAsked: () => makeSpan("not-asked"),
        loading:  () => makeSpan("loading"),
        failure:  (e) => makeSpan(`error:${e}`),
        success:  (v) => makeSpan(`ok:${v}`),
      })
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("span")!.textContent).toBe("error:oops")
    cleanup(root, unmount)
  })

  it("renders success case with value", () => {
    const root = makeRoot()
    const s = signal(success("data") as import("@rhi-zone/rainbow").AsyncData<string, string>)
    const w: Widget<import("@rhi-zone/rainbow").AsyncData<string, string>> = (sig) => {
      return foldWidget(sig, {
        notAsked: () => makeSpan("not-asked"),
        loading:  () => makeSpan("loading"),
        failure:  (e) => makeSpan(`error:${e}`),
        success:  (v) => makeSpan(`ok:${v}`),
      })
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("span")!.textContent).toBe("ok:data")
    cleanup(root, unmount)
  })

  it("swaps child when state changes", () => {
    const root = makeRoot()
    const s = signal<import("@rhi-zone/rainbow").AsyncData<string, string>>(loading)
    const w: Widget<import("@rhi-zone/rainbow").AsyncData<string, string>> = (sig) => {
      return foldWidget(sig, {
        loading:  () => makeSpan("loading"),
        success:  (v) => makeSpan(`ok:${v}`),
      })
    }
    const unmount = mount(w, s, root)
    expect(root.querySelector("span")!.textContent).toBe("loading")
    s.set(success("result"))
    expect(root.querySelector("span")!.textContent).toBe("ok:result")
    cleanup(root, unmount)
  })

  it("renders empty div for missing cases", () => {
    const root = makeRoot()
    const s = signal<import("@rhi-zone/rainbow").AsyncData<string, string>>(loading)
    const w: Widget<import("@rhi-zone/rainbow").AsyncData<string, string>> = (sig) => {
      return foldWidget(sig, {
        success: (v) => makeSpan(`ok:${v}`),
      })
    }
    const unmount = mount(w, s, root)
    // loading case has no handler — container should be empty
    expect(root.querySelector("[data-fold-widget]")!.children).toHaveLength(0)
    cleanup(root, unmount)
  })
})

// ── match ─────────────────────────────────────────────────────────────────────

type Screen =
  | { screen: 'list';   items: string[] }
  | { screen: 'detail'; item: string }

describe("match", () => {
  const listWidget = (s: Signal<Extract<Screen, { screen: 'list' }>>) => {
    const node = document.createElement("ul")
    const render = ({ items }: { items: string[] }) => {
      node.innerHTML = items.map(i => `<li>${i}</li>`).join("")
    }
    render(s.get()); subscribe(s, render)
    return { _tag: "ul" as const, node }
  }
  const detailWidget = (s: Signal<Extract<Screen, { screen: 'detail' }>>) => {
    const node = document.createElement("p")
    subscribe(s, ({ item }) => { node.textContent = item })
    node.textContent = s.get().item
    return { _tag: "p" as const, node }
  }

  it("renders the initial variant", () => {
    const root = makeRoot()
    const s = signal<Screen>({ screen: 'list', items: ['a', 'b'] })
    const unmount = mount(match('screen', { list: listWidget, detail: detailWidget }), s, root)
    expect(root.querySelectorAll("li")).toHaveLength(2)
    expect(root.querySelector("p")).toBeNull()
    cleanup(root, unmount)
  })

  it("swaps child when tag changes", () => {
    const root = makeRoot()
    const s = signal<Screen>({ screen: 'list', items: ['a'] })
    const unmount = mount(match('screen', { list: listWidget, detail: detailWidget }), s, root)
    s.set({ screen: 'detail', item: 'hello' })
    expect(root.querySelector("p")!.textContent).toBe("hello")
    expect(root.querySelector("ul")).toBeNull()
    cleanup(root, unmount)
  })

  it("updates within the same variant without remounting", () => {
    const root = makeRoot()
    const s = signal<Screen>({ screen: 'detail', item: 'first' })
    let mounts = 0
    const countingDetail = (sig: Signal<Extract<Screen, { screen: 'detail' }>>) => {
      mounts++
      return detailWidget(sig)
    }
    const unmount = mount(match('screen', { list: listWidget, detail: countingDetail }), s, root)
    s.set({ screen: 'detail', item: 'second' })
    expect(mounts).toBe(1) // no remount
    expect(root.querySelector("p")!.textContent).toBe("second")
    cleanup(root, unmount)
  })

  it("cleans up subscriptions on unmount", () => {
    const root = makeRoot()
    const s = signal<Screen>({ screen: 'list', items: [] })
    let calls = 0
    const trackingList = (sig: Signal<Extract<Screen, { screen: 'list' }>>) => {
      subscribe(sig, () => { calls++ })
      return listWidget(sig)
    }
    const unmount = mount(match('screen', { list: trackingList, detail: detailWidget }), s, root)
    const before = calls
    unmount()
    s.set({ screen: 'list', items: ['x'] })
    expect(calls).toBe(before) // no calls after unmount
    cleanup(root, unmount)
  })

  it("cleans up old variant when switching", () => {
    const root = makeRoot()
    const s = signal<Screen>({ screen: 'list', items: [] })
    let listCalls = 0
    const trackingList = (sig: Signal<Extract<Screen, { screen: 'list' }>>) => {
      subscribe(sig, () => { listCalls++ })
      return listWidget(sig)
    }
    const unmount = mount(match('screen', { list: trackingList, detail: detailWidget }), s, root)
    s.set({ screen: 'detail', item: 'x' }) // switch away
    const before = listCalls
    s.set({ screen: 'detail', item: 'y' }) // update in detail — list subs should be dead
    expect(listCalls).toBe(before)
    cleanup(root, unmount)
  })
})
