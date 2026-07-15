/**
 * Combinator tests.
 *
 * Uses happy-dom (via vitest) for a lightweight DOM environment.
 */

import { describe, it, expect, vi } from "vitest"
import { signal } from "@rhi-zone/rainbow"
import type { Signal } from "@rhi-zone/rainbow"
import { mount, withScope, subscribe } from "./widget.js"
import type { Widget } from "./widget.js"
import type { AnyEl, FlowContent } from "./html.js"
import {
  query,
  mutation,
  mutationBanner,
  table,
  tabs,
  panel,
} from "./combinators.js"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRoot(): HTMLDivElement {
  const root = document.createElement("div")
  document.body.appendChild(root)
  return root
}

/** Flush microtasks (promise callbacks). */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

// ── query ────────────────────────────────────────────────────────────────────

describe("query", () => {
  it("calls fetcher immediately and starts in loading state", async () => {
    const fetcher = vi.fn(() => Promise.resolve(42))
    const [result, dispose] = withScope(() => query(fetcher))

    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.state.get().status).toBe("loading")

    await flush()
    const s = result.state.get()
    expect(s.status).toBe("success")
    if (s.status === "success") expect(s.value).toBe(42)

    dispose()
  })

  it("transitions to failure on rejected promise", async () => {
    const err = new Error("boom")
    const [result, dispose] = withScope(() => query(() => Promise.reject(err)))

    await flush()
    const s = result.state.get()
    expect(s.status).toBe("failure")
    if (s.status === "failure") expect(s.error).toBe(err)

    dispose()
  })

  it("refetch resets to loading and re-calls fetcher", async () => {
    let n = 0
    const fetcher = vi.fn(() => Promise.resolve(++n))
    const [result, dispose] = withScope(() => query(fetcher))

    await flush()
    expect(result.state.get().status).toBe("success")

    result.refetch()
    expect(result.state.get().status).toBe("loading")
    expect(fetcher).toHaveBeenCalledTimes(2)

    await flush()
    const s = result.state.get()
    expect(s.status).toBe("success")
    if (s.status === "success") expect(s.value).toBe(2)

    dispose()
  })

  it("aborts in-flight request on dispose", async () => {
    // A fetcher that never resolves
    const fetcher = vi.fn(() => new Promise<number>(() => {}))
    const [result, dispose] = withScope(() => query(fetcher))

    expect(result.state.get().status).toBe("loading")
    dispose()
    // After dispose, even if the promise were to resolve, the state stays loading
    // (abort flag prevents set)
  })

  it("select returns fallback while loading, then derived value on success", async () => {
    const fetcher = vi.fn(() => Promise.resolve({ items: [1, 2, 3] }))
    const [result, dispose] = withScope(() => query(fetcher))

    const count = result.select((v) => v.items.length, -1)
    expect(count.get()).toBe(-1)

    await flush()
    expect(count.get()).toBe(3)

    dispose()
  })

  it("select returns fallback on failure", async () => {
    const [result, dispose] = withScope(() =>
      query(() => Promise.reject(new Error("boom"))),
    )

    const value = result.select((v: { x: number }) => v.x, 0)
    await flush()
    expect(value.get()).toBe(0)

    dispose()
  })
})

// ── mutation ─────────────────────────────────────────────────────────────────

describe("mutation", () => {
  it("submit calls execute and tracks busy state", async () => {
    const execute = vi.fn((n: number) => Promise.resolve(n * 2))
    const { state, submit } = mutation(execute)

    expect(state.get().busy).toBe(false)
    const p = submit(5)
    expect(state.get().busy).toBe(true)

    const result = await p
    expect(result).toBe(10)
    expect(state.get().busy).toBe(false)
    expect(state.get().error).toBeUndefined()
  })

  it("captures error on rejection", async () => {
    const err = new Error("fail")
    const { state, submit } = mutation(() => Promise.reject(err))

    await expect(submit(0)).rejects.toThrow("fail")
    expect(state.get().busy).toBe(false)
    expect(state.get().error).toBe(err)
  })

  it("wraps non-Error thrown values", async () => {
    const { state, submit } = mutation(() => Promise.reject("string-err"))

    await expect(submit(0)).rejects.toBe("string-err")
    expect(state.get().error).toBeInstanceOf(Error)
    expect(state.get().error!.message).toBe("string-err")
  })

  it("calls onSuccess callback after successful mutation", async () => {
    const onSuccess = vi.fn()
    const { submit } = mutation((n: number) => Promise.resolve(n), { onSuccess })

    await submit(7)
    expect(onSuccess).toHaveBeenCalledWith(7)
  })

  it("reset clears error state", async () => {
    const { state, submit, reset } = mutation(() => Promise.reject(new Error("x")))

    await expect(submit(0)).rejects.toThrow()
    expect(state.get().error).toBeDefined()

    reset()
    expect(state.get().error).toBeUndefined()
    expect(state.get().busy).toBe(false)
  })
})

// ── mutationBanner ───────────────────────────────────────────────────────────

describe("mutationBanner", () => {
  it("starts hidden when there is no error", () => {
    const root = makeRoot()
    const m = mutation(() => Promise.resolve(1))

    const [, dispose] = withScope(() => {
      root.appendChild(mutationBanner(m).node)
    })

    const banner = root.querySelector('[role="alert"]') as HTMLElement
    expect(banner).toBeTruthy()
    expect(banner.style.display).toBe("none")

    dispose()
    root.remove()
  })

  it("shows the error message reactively when the mutation fails", async () => {
    const root = makeRoot()
    const err = new Error("save failed")
    const m = mutation(() => Promise.reject(err))

    const [, dispose] = withScope(() => {
      root.appendChild(mutationBanner(m).node)
    })

    const banner = root.querySelector('[role="alert"]') as HTMLElement
    await expect(m.submit(undefined)).rejects.toThrow()

    expect(banner.style.display).toBe("")
    expect(banner.textContent).toBe("save failed")

    m.reset()
    expect(banner.style.display).toBe("none")

    dispose()
    root.remove()
  })
})

// ── table ────────────────────────────────────────────────────────────────────

describe("table", () => {
  type Row = { id: string; name: string; score: number }

  it("renders correct table structure with thead and tbody", () => {
    const root = makeRoot()
    const data = signal<Row[]>([
      { id: "1", name: "Alice", score: 90 },
      { id: "2", name: "Bob", score: 85 },
    ])

    const w = table<Row>({
      columns: [
        { header: "Name", cell: (r: Row) => r.name },
        { header: "Score", cell: (r: Row) => r.score },
      ],
      key: (r) => r.id,
    })
    const unmount = mount(w, data, root)

    const tableEl = root.querySelector("table")!
    expect(tableEl).toBeTruthy()

    // Headers
    const ths = tableEl.querySelectorAll("thead th")
    expect(ths.length).toBe(2)
    expect(ths[0]!.textContent).toBe("Name")
    expect(ths[1]!.textContent).toBe("Score")

    // Data rows (inside tbody created by eachKeyed)
    const tds = tableEl.querySelectorAll("tbody td")
    expect(tds.length).toBe(4)
    expect(tds[0]!.textContent).toBe("Alice")
    expect(tds[1]!.textContent).toBe("90")
    expect(tds[2]!.textContent).toBe("Bob")
    expect(tds[3]!.textContent).toBe("85")

    unmount()
    root.remove()
  })

  it("updates rows when signal changes via eachKeyed", () => {
    const root = makeRoot()
    const data = signal<Row[]>([{ id: "1", name: "Alice", score: 100 }])

    const w = table<Row>({
      columns: [{ header: "Name", cell: (r: Row) => r.name }],
      key: (r) => r.id,
    })
    const unmount = mount(w, data, root)

    expect(root.querySelectorAll("tbody tr").length).toBe(1)

    data.set([
      { id: "1", name: "Alice", score: 100 },
      { id: "2", name: "Bob", score: 95 },
    ])

    expect(root.querySelectorAll("tbody tr").length).toBe(2)

    unmount()
    root.remove()
  })

  it("reactively updates cell content when row signal changes", () => {
    const root = makeRoot()
    const data = signal<Row[]>([{ id: "1", name: "Alice", score: 90 }])

    const w = table<Row>({
      columns: [{ header: "Name", cell: (r: Row) => r.name }],
      key: (r) => r.id,
    })
    const unmount = mount(w, data, root)

    const td = root.querySelector("tbody td")!
    expect(td.textContent).toBe("Alice")

    // Update the existing row (same key, different value)
    data.set([{ id: "1", name: "Alicia", score: 91 }])
    expect(td.textContent).toBe("Alicia")

    unmount()
    root.remove()
  })

  it("supports Widget cells when widget flag is set", () => {
    const root = makeRoot()
    type Item = { id: string; value: string }
    const data = signal<Item[]>([{ id: "1", value: "hello" }])

    const boldWidget: Widget<Item> = (s) => {
      const node = document.createElement("b")
      node.textContent = s.get().value
      subscribe(s, (v) => { node.textContent = v.value })
      return { _tag: "b", node } as unknown as FlowContent
    }

    const w = table<Item>({
      columns: [{ header: "Val", cell: boldWidget, widget: true }],
      key: (r) => r.id,
    })
    const unmount = mount(w, data, root)

    const b = root.querySelector("td b")
    expect(b).toBeTruthy()
    expect(b!.textContent).toBe("hello")

    unmount()
    root.remove()
  })

  it("fires onRowClick with the row signal", () => {
    const root = makeRoot()
    const data = signal<Row[]>([{ id: "1", name: "Alice", score: 90 }])
    const clicked: string[] = []

    const w = table<Row>({
      columns: [{ header: "Name", cell: (r: Row) => r.name }],
      key: (r) => r.id,
      onRowClick: (s) => clicked.push(s.get().name),
    })
    const unmount = mount(w, data, root)

    const tr = root.querySelector("tbody tr") as HTMLElement
    tr.click()
    expect(clicked).toEqual(["Alice"])

    unmount()
    root.remove()
  })

  it("applies reactive attrs to the table element", () => {
    const root = makeRoot()
    const cls = signal("plain")
    const data = signal<Row[]>([])

    const w = table<Row>({
      columns: [{ header: "X", cell: () => "" }],
      key: (r) => r.id,
      attrs: { class: () => cls.get() },
    })
    const unmount = mount(w, data, root)

    const tableEl = root.querySelector("table")!
    expect(tableEl.getAttribute("class")).toBe("plain")

    cls.set("fancy")
    expect(tableEl.getAttribute("class")).toBe("fancy")

    unmount()
    root.remove()
  })

  it("supports reactive header functions", () => {
    const root = makeRoot()
    const lang = signal("en")
    const data = signal<Row[]>([])

    const w = table<Row>({
      columns: [{
        header: () => lang.get() === "en" ? "Name" : "Nombre",
        cell: (r: Row) => r.name,
      }],
      key: (r) => r.id,
    })
    const unmount = mount(w, data, root)

    const th = root.querySelector("th")!
    expect(th.textContent).toBe("Name")

    lang.set("es")
    expect(th.textContent).toBe("Nombre")

    unmount()
    root.remove()
  })

  it("shows string empty state when data is empty, hides table", () => {
    const root = makeRoot()
    const data = signal<Row[]>([])

    const w = table<Row>({
      columns: [{ header: "Name", cell: (r: Row) => r.name }],
      key: (r) => r.id,
      empty: "No rows yet",
    })
    const unmount = mount(w, data, root)

    const tableEl = root.querySelector("table") as HTMLElement
    const emptyEl = root.querySelector("p") as HTMLElement
    expect(emptyEl.textContent).toBe("No rows yet")
    expect(emptyEl.style.display).toBe("")
    expect(tableEl.style.display).toBe("none")

    unmount()
    root.remove()
  })

  it("toggles between table and empty state reactively (no rebuild)", () => {
    const root = makeRoot()
    const data = signal<Row[]>([])

    const w = table<Row>({
      columns: [{ header: "Name", cell: (r: Row) => r.name }],
      key: (r) => r.id,
      empty: "No rows yet",
    })
    const unmount = mount(w, data, root)

    const tableEl = root.querySelector("table") as HTMLElement
    const emptyElBefore = root.querySelector("p") as HTMLElement
    expect(tableEl.style.display).toBe("none")
    expect(emptyElBefore.style.display).toBe("")

    data.set([{ id: "1", name: "Alice", score: 90 }])

    expect(tableEl.style.display).toBe("")
    expect(emptyElBefore.style.display).toBe("none")
    // Same node instance — no teardown/rebuild
    expect(root.querySelector("p")).toBe(emptyElBefore)

    unmount()
    root.remove()
  })

  it("supports a function empty state", () => {
    const root = makeRoot()
    const data = signal<Row[]>([])

    const w = table<Row>({
      columns: [{ header: "Name", cell: (r: Row) => r.name }],
      key: (r) => r.id,
      empty: (): AnyEl => {
        const div = document.createElement("div")
        div.dataset["customEmpty"] = ""
        div.textContent = "Nothing here"
        return { _tag: "div", node: div } as unknown as AnyEl
      },
    })
    const unmount = mount(w, data, root)

    const emptyEl = root.querySelector("[data-custom-empty]") as HTMLElement
    expect(emptyEl.textContent).toBe("Nothing here")
    expect(emptyEl.style.display).toBe("")

    unmount()
    root.remove()
  })
})

// ── tabs ─────────────────────────────────────────────────────────────────────

describe("tabs", () => {
  type Item = { id: string; kind: "a" | "b"; label: string }

  const contentWidget: Widget<Item[]> = (s) => {
    const node = document.createElement("ul")
    node.textContent = String(s.get().length)
    subscribe(s, (v) => { node.textContent = String(v.length) })
    return { _tag: "ul", node } as unknown as FlowContent
  }

  it("classifies items and shows correct counts in tab buttons", () => {
    const root = makeRoot()
    const data = signal<Item[]>([
      { id: "1", kind: "a", label: "A1" },
      { id: "2", kind: "a", label: "A2" },
      { id: "3", kind: "b", label: "B1" },
    ])

    const w = tabs<Item, "a" | "b">({
      classify: (i) => i.kind,
      order: ["a", "b"],
      labels: { a: "Alpha", b: "Beta" },
      content: { a: contentWidget, b: contentWidget },
    })
    const unmount = mount(w, data, root)

    const buttons = root.querySelectorAll("nav button")
    expect(buttons.length).toBe(2)
    expect(buttons[0]!.textContent).toBe("Alpha (2)")
    expect(buttons[1]!.textContent).toBe("Beta (1)")

    unmount()
    root.remove()
  })

  it("first tab is active by default", () => {
    const root = makeRoot()
    const data = signal<Item[]>([])

    const w = tabs<Item, "a" | "b">({
      classify: (i) => i.kind,
      order: ["a", "b"],
      labels: { a: "Alpha", b: "Beta" },
      content: { a: contentWidget, b: contentWidget },
    })
    const unmount = mount(w, data, root)

    const buttons = root.querySelectorAll("nav button")
    expect(buttons[0]!.getAttribute("aria-selected")).toBe("true")
    expect(buttons[1]!.getAttribute("aria-selected")).toBe("false")

    unmount()
    root.remove()
  })

  it("switching tabs toggles content visibility", () => {
    const root = makeRoot()
    const data = signal<Item[]>([
      { id: "1", kind: "a", label: "A1" },
      { id: "2", kind: "b", label: "B1" },
    ])

    const w = tabs<Item, "a" | "b">({
      classify: (i) => i.kind,
      order: ["a", "b"],
      labels: { a: "Alpha", b: "Beta" },
      content: { a: contentWidget, b: contentWidget },
    })
    const unmount = mount(w, data, root)

    // Content wrappers are direct child divs of the container
    const container = root.querySelector("[data-tabs]")!
    const wrappers = Array.from(container.children).filter(
      (el) => el.tagName === "DIV",
    ) as HTMLElement[]

    expect(wrappers[0]!.style.display).toBe("")
    expect(wrappers[1]!.style.display).toBe("none")

    // Click second tab
    const buttons = root.querySelectorAll("nav button")
    ;(buttons[1] as HTMLElement).click()

    expect(buttons[0]!.getAttribute("aria-selected")).toBe("false")
    expect(buttons[1]!.getAttribute("aria-selected")).toBe("true")
    expect(wrappers[0]!.style.display).toBe("none")
    expect(wrappers[1]!.style.display).toBe("")

    unmount()
    root.remove()
  })

  it("counts update when items change", () => {
    const root = makeRoot()
    const data = signal<Item[]>([{ id: "1", kind: "a", label: "A1" }])

    const w = tabs<Item, "a" | "b">({
      classify: (i) => i.kind,
      order: ["a", "b"],
      labels: { a: "Alpha", b: "Beta" },
      content: { a: contentWidget, b: contentWidget },
    })
    const unmount = mount(w, data, root)

    const buttons = root.querySelectorAll("nav button")
    expect(buttons[0]!.textContent).toBe("Alpha (1)")
    expect(buttons[1]!.textContent).toBe("Beta (0)")

    data.set([
      { id: "1", kind: "a", label: "A1" },
      { id: "2", kind: "b", label: "B1" },
      { id: "3", kind: "b", label: "B2" },
    ])

    expect(buttons[0]!.textContent).toBe("Alpha (1)")
    expect(buttons[1]!.textContent).toBe("Beta (2)")

    unmount()
    root.remove()
  })

  it("content widgets receive filtered arrays", () => {
    const root = makeRoot()
    const data = signal<Item[]>([
      { id: "1", kind: "a", label: "A1" },
      { id: "2", kind: "b", label: "B1" },
    ])

    const w = tabs<Item, "a" | "b">({
      classify: (i) => i.kind,
      order: ["a", "b"],
      labels: { a: "Alpha", b: "Beta" },
      content: { a: contentWidget, b: contentWidget },
    })
    const unmount = mount(w, data, root)

    // Both content ULs show the count for their respective tab
    const uls = root.querySelectorAll("ul")
    expect(uls[0]!.textContent).toBe("1") // tab "a" has 1 item
    expect(uls[1]!.textContent).toBe("1") // tab "b" has 1 item

    unmount()
    root.remove()
  })
})

// ── panel ────────────────────────────────────────────────────────────────────

describe("panel", () => {
  const panelContent: Widget<string> = (s) => {
    const node = document.createElement("p")
    node.textContent = s.get()
    subscribe(s, (v) => { node.textContent = v })
    return { _tag: "p", node } as unknown as FlowContent
  }

  it("starts closed", () => {
    const { handle } = panel({ render: panelContent })
    expect(handle.isOpen.get()).toBe(false)
    expect(handle.data.get()).toBeUndefined()
  })

  it("open sets data and makes panel visible", () => {
    const root = makeRoot()
    const { handle, widget } = panel({ render: panelContent })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    expect(handle.isOpen.get()).toBe(false)
    const overlay = root.querySelector("[data-panel-overlay]") as HTMLElement
    expect(overlay.style.display).toBe("none")

    handle.open("hello")
    expect(handle.isOpen.get()).toBe(true)
    expect(handle.data.get()).toBe("hello")
    expect(overlay.style.display).toBe("")

    // Content should render via narrow(render, some())
    const p = root.querySelector("p")
    expect(p).toBeTruthy()
    expect(p!.textContent).toBe("hello")

    dispose()
    root.remove()
  })

  it("close clears data and hides panel", () => {
    const root = makeRoot()
    const { handle, widget } = panel({ render: panelContent })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("test")
    expect(handle.isOpen.get()).toBe(true)

    handle.close()
    expect(handle.isOpen.get()).toBe(false)
    expect(handle.data.get()).toBeUndefined()

    const overlay = root.querySelector("[data-panel-overlay]") as HTMLElement
    expect(overlay.style.display).toBe("none")

    dispose()
    root.remove()
  })

  it("beforeClose prevents close when returning false", () => {
    let allow = false
    const { handle, widget } = panel({
      render: panelContent,
      beforeClose: () => allow,
    })

    const root = makeRoot()
    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("locked")
    handle.close()
    expect(handle.isOpen.get()).toBe(true) // close prevented

    allow = true
    handle.close()
    expect(handle.isOpen.get()).toBe(false) // close allowed

    dispose()
    root.remove()
  })

  it("click on overlay background closes panel", () => {
    const root = makeRoot()
    const { handle, widget } = panel({ render: panelContent })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("click-test")
    expect(handle.isOpen.get()).toBe(true)

    const overlay = root.querySelector("[data-panel-overlay]") as HTMLElement
    // Dispatch click on the overlay element itself (not a child)
    const event = new Event("click", { bubbles: true })
    Object.defineProperty(event, "target", { value: overlay })
    overlay.dispatchEvent(event)

    expect(handle.isOpen.get()).toBe(false)

    dispose()
    root.remove()
  })

  it("click on panel content does not close", () => {
    const root = makeRoot()
    const { handle, widget } = panel({ render: panelContent })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("content-click")
    expect(handle.isOpen.get()).toBe(true)

    const overlay = root.querySelector("[data-panel-overlay]") as HTMLElement
    const panelEl = root.querySelector("[data-panel]") as HTMLElement
    // Dispatch click with target being the panel container (a child of overlay)
    const event = new Event("click", { bubbles: true })
    Object.defineProperty(event, "target", { value: panelEl })
    overlay.dispatchEvent(event)

    expect(handle.isOpen.get()).toBe(true) // should NOT close

    dispose()
    root.remove()
  })

  it("renders no header when omitted", () => {
    const root = makeRoot()
    const { handle, widget } = panel({ render: panelContent })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("no-header")
    expect(root.querySelector("header")).toBeNull()

    dispose()
    root.remove()
  })

  it("string header renders title and a close button wired to handle.close()", () => {
    const root = makeRoot()
    const { handle, widget } = panel({ render: panelContent, header: "Review Submission" })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("hello")
    const header = root.querySelector("[data-panel] > header") as HTMLElement
    expect(header).toBeTruthy()
    expect(header.textContent).toContain("Review Submission")

    const closeBtn = header.querySelector("button") as HTMLButtonElement
    expect(closeBtn).toBeTruthy()
    closeBtn.click()
    expect(handle.isOpen.get()).toBe(false)

    dispose()
    root.remove()
  })

  it("widget header renders the widget's output inside the header, scoped to panel data", () => {
    const root = makeRoot()
    const headerWidget: Widget<string> = (s) => {
      const node = document.createElement("strong")
      node.textContent = s.get().toUpperCase()
      subscribe(s, (v) => { node.textContent = v.toUpperCase() })
      return { _tag: "strong", node } as unknown as FlowContent
    }
    const { handle, widget } = panel({ render: panelContent, header: headerWidget })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("world")
    const header = root.querySelector("[data-panel] > header") as HTMLElement
    expect(header).toBeTruthy()
    const strong = header.querySelector("strong") as HTMLElement
    expect(strong.textContent).toBe("WORLD")

    dispose()
    root.remove()
  })

  it("header appears before content inside the panel container", () => {
    const root = makeRoot()
    const { handle, widget } = panel({ render: panelContent, header: "Title" })

    const [, dispose] = withScope(() => {
      root.appendChild(widget().node)
    })

    handle.open("body")
    const panelEl = root.querySelector("[data-panel]") as HTMLElement
    const children = Array.from(panelEl.children)
    const headerIdx = children.findIndex((c) => c.tagName === "HEADER")
    const contentIdx = children.findIndex((c) => c.querySelector("p") !== null)
    expect(headerIdx).toBeGreaterThanOrEqual(0)
    expect(contentIdx).toBeGreaterThan(headerIdx)

    dispose()
    root.remove()
  })
})
