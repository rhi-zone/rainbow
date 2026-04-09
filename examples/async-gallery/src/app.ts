/**
 * Async image gallery — rainbow-ui demo.
 *
 * Demonstrates: fromAsync, fold, template, stateful, show, eachKeyed, on.
 */

import {
  signal,
  stateful,
  fromAsync,
  fold,
  index,
  field,
  tagged,
  type Signal,
  type ReadonlySignal,
  type AsyncData,
} from "@rhi-zone/rainbow"
import {
  mount,
  on,
  subscribe,
  register,
  stack,
  show,
  narrow,
  eachKeyed,
  template,
  inputWidget,
  type Widget,
} from "@rhi-zone/rainbow-ui/widget"

// ── Domain types ──────────────────────────────────────────────────────────────

export interface GalleryImage {
  id: string
  url: string
  thumbUrl: string
  title: string
  author: string
  width: number
  height: number
}

interface GalleryPage {
  images: GalleryImage[]
  total: number
  page: number
  pageSize: number
}

// ── Pagination state ──────────────────────────────────────────────────────────

interface PaginationState {
  page: number
  pageSize: number
  search: string
}

const paginationState = signal<PaginationState>({ page: 1, pageSize: 12, search: "" })
const currentPage     = paginationState.focus(field("page"))
const currentSearch   = paginationState.focus(field("search"))

// FRICTION: stateful() is for attaching local UI state to an external signal.
// For pagination, the "local" state IS the meaningful state, and the fetched
// data IS the derived value. The natural model is paginationState → fetchedData,
// not the other way around. Using stateful() would mean nesting pagination state
// inside the async data signal, which inverts the dependency direction. There is
// no first-class "query → AsyncData" combinator that fits this pattern cleanly.

// ── Selected image ────────────────────────────────────────────────────────────

type SelectedState =
  | { mode: "none" }
  | { mode: "selected"; image: GalleryImage }

const selectedState = signal<SelectedState>({ mode: "none" })
const selectedPrism = tagged<SelectedState>("mode", "selected")

// ── Fake fetch ────────────────────────────────────────────────────────────────

async function fakeFetchImages(params: PaginationState, abort: AbortSignal): Promise<GalleryPage> {
  await new Promise((res, rej) => {
    const id = setTimeout(res, 500)
    abort.addEventListener("abort", () => { clearTimeout(id); rej(new DOMException("Aborted", "AbortError")) })
  })
  if (abort.aborted) throw new DOMException("Aborted", "AbortError")

  const allImages: GalleryImage[] = Array.from({ length: 48 }, (_, i) => ({
    id: String(i + 1),
    url:      `https://picsum.photos/seed/${i}/800/600`,
    thumbUrl: `https://picsum.photos/seed/${i}/300/200`,
    title:    `Photo ${i + 1}`,
    author:   ["Alice", "Bob", "Carol", "Dave"][i % 4]!,
    width: 800, height: 600,
  }))

  const filtered = params.search
    ? allImages.filter((img) => img.title.toLowerCase().includes(params.search.toLowerCase()) || img.author.toLowerCase().includes(params.search.toLowerCase()))
    : allImages

  const start = (params.page - 1) * params.pageSize
  return {
    images: filtered.slice(start, start + params.pageSize),
    total: filtered.length,
    page: params.page,
    pageSize: params.pageSize,
  }
}

// ── fromAsync wiring ──────────────────────────────────────────────────────────

const [galleryData, disposeGallery] = fromAsync(paginationState, fakeFetchImages)

// ── Image card widget (template combinator) ───────────────────────────────────

// FRICTION: template() requires you to set initial DOM values AND subscribe —
// there is no "run the bind fn immediately with the current value" shorthand.
// Every template bind fn starts with the same pattern:
//   syncFn(s.get())   // initial
//   subscribe(s, syncFn)  // reactive updates
// This double-call is boilerplate that every template usage repeats.
const imageCardWidget: Widget<GalleryImage> = template(
  `<figure class="image-card">
    <img data-ref="img" loading="lazy" alt="">
    <figcaption>
      <span class="img-title" data-ref="title"></span>
      <span class="img-author" data-ref="author"></span>
    </figcaption>
    <button class="btn-enlarge" data-ref="enlargeBtn" aria-label="View full size">⛶</button>
  </figure>`,
  { img: "img", title: "span", author: "span", enlargeBtn: "button" } as const,
  (s, { img, title, author, enlargeBtn }) => {
    const sync = (image: GalleryImage) => {
      img.node.src        = image.thumbUrl
      img.node.alt        = image.title
      title.node.textContent  = image.title
      author.node.textContent = `by ${image.author}`
    }
    sync(s.get())
    subscribe(s, sync)

    on(img.node, "click", () => selectedState.set({ mode: "selected", image: s.get() }))
    on(enlargeBtn.node, "click", () => selectedState.set({ mode: "selected", image: s.get() }))
  },
)

// ── Lightbox widget (narrow + tagged) ─────────────────────────────────────────

const lightboxWidget: Widget<SelectedState> = (s) => {
  const overlay = document.createElement("div")
  overlay.className = "lightbox-overlay"
  overlay.style.display = "none"

  const img   = document.createElement("img")
  const title = document.createElement("p")
  const close = document.createElement("button")
  close.className   = "lightbox-close"
  close.textContent = "✕"
  close.setAttribute("aria-label", "Close")

  overlay.append(img, title, close)

  // FRICTION: narrow() is a Widget combinator — it returns Widget<A, DivEl>.
  // Inside a manual widget function, to conditionally show content, you must
  // fall back to a subscribe + style.display toggle, because you cannot easily
  // use narrow() inside an existing widget function body without creating a
  // child mount context. This pushes all conditional rendering back to the
  // subscribe + show/hide pattern even when narrow() + tagged() would be
  // semantically cleaner.
  subscribe(s, (state) => {
    if (state.mode === "selected") {
      img.src           = state.image.url
      img.alt           = state.image.title
      title.textContent = `${state.image.title} — by ${state.image.author} (${state.image.width}×${state.image.height})`
      overlay.style.display = ""
    } else {
      overlay.style.display = "none"
    }
  })

  on(close, "click", () => selectedState.set({ mode: "none" }))
  on(overlay, "keydown", (e) => { if (e.key === "Escape") selectedState.set({ mode: "none" }) })
  on(overlay, "click", (e) => { if (e.target === overlay) selectedState.set({ mode: "none" }) })

  return { _tag: "div", node: overlay }
}

// ── Pagination controls ───────────────────────────────────────────────────────

function renderPagination(container: HTMLElement, data: ReadonlySignal<AsyncData<GalleryPage, unknown>>): void {
  const prevBtn  = document.createElement("button")
  const nextBtn  = document.createElement("button")
  const pageInfo = document.createElement("span")
  prevBtn.textContent = "← Prev"
  nextBtn.textContent = "Next →"
  prevBtn.className = "btn-prev"
  nextBtn.className = "btn-next"

  // FRICTION: Rendering pagination controls requires subscribing to both
  // galleryData (for total count) AND paginationState (for current page).
  // With two independent signals there is no elegant way to combine them
  // without either product() (adds structural overhead) or computed() (returns
  // a ReadonlySignal that then needs another subscribe for the DOM side-effect).
  // We end up with two separate subscribe callbacks that each update the same elements.
  const updatePagination = () => {
    const result = data.get()
    const { page, pageSize } = paginationState.get()
    if (result.status === "success") {
      const total     = result.value.total
      const totalPages = Math.ceil(total / pageSize)
      pageInfo.textContent = `Page ${page} of ${totalPages} (${total} images)`
      prevBtn.disabled = page <= 1
      nextBtn.disabled = page >= totalPages
    } else {
      pageInfo.textContent = result.status === "loading" ? "Loading…" : "Error"
      prevBtn.disabled = true
      nextBtn.disabled = true
    }
  }

  subscribe(data, updatePagination)
  subscribe(paginationState, updatePagination)
  updatePagination()

  prevBtn.addEventListener("click", () => {
    const { page } = paginationState.get()
    if (page > 1) paginationState.set({ ...paginationState.get(), page: page - 1 })
  })
  nextBtn.addEventListener("click", () => {
    const result = galleryData.get()
    if (result.status !== "success") return
    const { page, pageSize } = paginationState.get()
    const totalPages = Math.ceil(result.value.total / pageSize)
    if (page < totalPages) paginationState.set({ ...paginationState.get(), page: page + 1 })
  })

  container.append(prevBtn, pageInfo, nextBtn)
}

// ── Gallery grid ──────────────────────────────────────────────────────────────

function renderGallery(container: HTMLElement): void {
  register(disposeGallery)

  // Search bar
  const searchBar = document.createElement("div")
  searchBar.className = "search-bar"

  const searchInput = document.createElement("input")
  searchInput.type = "search"
  searchInput.placeholder = "Search photos or authors…"
  // FRICTION: bindInput(searchInput, currentSearch) would be the natural call,
  // but bindInput() is only available inside a widget call context (it calls
  // _register internally via on() and subscribe()). Outside of mount(), you
  // must wire the events manually.
  searchInput.addEventListener("input", () => {
    paginationState.set({ ...paginationState.get(), search: searchInput.value, page: 1 })
  })
  subscribe(currentSearch, (q) => { if (searchInput.value !== q) searchInput.value = q })

  searchBar.appendChild(searchInput)
  container.appendChild(searchBar)

  // Page size selector
  const pageSizeSelect = document.createElement("select")
  for (const size of [12, 24, 48]) {
    const opt = document.createElement("option")
    opt.value = String(size)
    opt.textContent = `${size} per page`
    pageSizeSelect.appendChild(opt)
  }
  pageSizeSelect.value = String(paginationState.get().pageSize)
  pageSizeSelect.addEventListener("change", () => {
    paginationState.set({ ...paginationState.get(), pageSize: Number(pageSizeSelect.value), page: 1 })
  })
  container.appendChild(pageSizeSelect)

  // Loading / error / empty states
  const loadingEl = document.createElement("div")
  loadingEl.className = "gallery-loading"
  loadingEl.textContent = "Loading images…"
  loadingEl.style.display = "none"

  const errorEl = document.createElement("div")
  errorEl.className = "gallery-error"
  errorEl.style.display = "none"

  const emptyEl = document.createElement("div")
  emptyEl.className = "gallery-empty"
  emptyEl.textContent = "No images found."
  emptyEl.style.display = "none"

  // Gallery grid (keyed list)
  const gridSignal = signal<GalleryImage[]>([])
  const grid = document.createElement("div")
  grid.className = "gallery-grid"

  // FRICTION: fold() operates on a plain AsyncData value, not a signal.
  // To use fold() reactively you must call subscribe(galleryData, result => fold(result, {...})).
  // Every component that renders async state has this exact shell:
  //   subscribe(asyncSignal, (result) => fold(result, { notAsked, loading, failure, success }))
  // This is the most frequently repeated pattern in the entire codebase.
  // An asyncWidget(loadingWidget, errorWidget, successWidget) or foldWidget
  // combinator would eliminate it in every single async-data use case.
  subscribe(galleryData, (result) => {
    fold(result, {
      notAsked: () => {
        loadingEl.style.display = "none"
        errorEl.style.display   = "none"
        emptyEl.style.display   = "none"
        grid.style.display      = "none"
      },
      loading: () => {
        loadingEl.style.display = ""
        errorEl.style.display   = "none"
        emptyEl.style.display   = "none"
        grid.style.display      = "none"
      },
      failure: (err) => {
        loadingEl.style.display = "none"
        errorEl.style.display   = ""
        emptyEl.style.display   = "none"
        grid.style.display      = "none"
        errorEl.textContent     = `Failed to load: ${err instanceof Error ? err.message : String(err)}`
        // FRICTION: There is also no retry helper. To let the user retry, you
        // must create another trigger signal and a new fromAsync, or call the
        // existing trigger signal with the same value (which is a no-op if the
        // reference is equal). The user has to manually increment a "retry
        // counter" signal just to re-trigger a fetch. A .retry() method on the
        // async result or a refetch() callback from fromAsync would be ergonomic.
      },
      success: ({ images }) => {
        loadingEl.style.display = "none"
        errorEl.style.display   = "none"
        grid.style.display      = images.length > 0 ? "" : "none"
        emptyEl.style.display   = images.length === 0 ? "" : "none"
        gridSignal.set(images)
      },
    })
  })

  // Keyed list of image cards
  // FRICTION: eachKeyed() is a Widget<A[], DivEl>, which means it creates its
  // own wrapper <div data-eachKeyed>. For a CSS grid layout, you want the
  // children to be direct children of the grid container, not wrapped. You
  // cannot avoid this extra div without forking eachKeyed or using a different
  // container element (which eachKeyed doesn't support). This extra wrapper
  // breaks grid layouts unless you write `display: contents` workarounds.
  const galWidget = eachKeyed(imageCardWidget, (img) => img.id)
  const galEl = galWidget(gridSignal)
  grid.appendChild(galEl.node)

  container.append(loadingEl, errorEl, emptyEl, grid)

  // Pagination
  const paginationEl = document.createElement("div")
  paginationEl.className = "pagination"
  renderPagination(paginationEl, galleryData)
  container.appendChild(paginationEl)

  // Lightbox (rendered outside the gallery, at document level for z-index)
  const lightboxEl = lightboxWidget(selectedState)
  document.body.appendChild(lightboxEl.node)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const root = document.getElementById("app")
if (!root) throw new Error("No #app element")
renderGallery(root)
