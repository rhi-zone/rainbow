/**
 * @rhi-zone/rainbow-ui/reactive-html
 *
 * Reactive HTML element factories — the same element tags as `h.*` in
 * widget.ts, but attribute values may be a thunk `() => T` instead of a
 * plain value. A thunk is auto-tracked (via `computed()`): reading a
 * signal's `.get()` inside it registers a dependency, and the attribute is
 * re-applied whenever that signal changes.
 *
 *   import { r } from '@rhi-zone/rainbow-ui/reactive-html'
 *   r.div({ class: () => isActive.get() ? "active" : "" }, "hello")
 *
 * Static attribute values (not functions) are set once at construction —
 * no signal, no subscription. The `typeof v === "function"` check happens
 * once per attribute at construction time; the update path per reactive
 * attribute is a flat `apply(v)` closure with no further branching.
 *
 * Children follow the same `RChild<T>` contract as `h.*`: a string (fresh
 * text node per instance) or a widget receiving the same outer signal `T`.
 * Reactive attributes are independent of `T` — a thunk may read any
 * signal(s) in scope, not just the widget's own.
 *
 * Coverage: `r` mirrors every element factory exported by `html.ts` — see
 * the completeness test in `reactive-html.test.ts`, which fails the build
 * if `html.ts` grows an element factory that `r` doesn't have.
 */

import { type Signal, computed } from "@rhi-zone/rainbow"
import {
  text, textNode,
  type AnyEl, type El, type GlobalAttrs,
  type AAttrs, type ButtonAttrs, type FormAttrs, type ImgAttrs, type InputAttrs,
  type LabelAttrs, type LinkAttrs, type MetaAttrs, type OptionAttrs, type ScriptAttrs,
  type SelectAttrs, type TextareaAttrs, type VideoAttrs, type AudioAttrs, type SourceAttrs,
  type ThAttrs, type TdAttrs, type OlAttrs, type SvgAttrs, type IframeAttrs,
  type CircleAttrs, type EllipseAttrs, type RectAttrs, type LineAttrs, type PolylineAttrs,
  type PolygonAttrs, type PathAttrs, type TextAttrs, type TspanAttrs, type GAttrs,
  type DefsAttrs, type SymbolAttrs, type UseAttrs, type ClipPathAttrs, type MaskAttrs,
  type LinearGradientAttrs, type RadialGradientAttrs, type StopAttrs, type PatternAttrs,
  type SvgImageAttrs, type ForeignObjectAttrs,
} from "./html.js"
import { subscribe, type RChild, type Widget } from "./widget.js"

// ── Reactive attribute types ──────────────────────────────────────────────────

/** A value that is either static or a zero-arg auto-tracked thunk. */
export type Reactive<T> = T | (() => T)

/** Maps every attribute of `A` to accept a static value or a thunk. */
export type ReactiveAttrs<A> = { [K in keyof A]?: Reactive<A[K]> }

// ── Internal helpers ──────────────────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg"

function applyReactiveAttrs(node: Element, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue

    if (typeof v === "function") {
      const thunk = v as () => unknown
      const apply = (val: unknown): void => {
        if (val === undefined || val === null || val === false) node.removeAttribute(k)
        else node.setAttribute(k, val === true ? "" : String(val))
      }
      const c = computed(thunk)
      apply(c.get())
      subscribe(c, apply)
    } else {
      if (v === null || v === false) continue
      node.setAttribute(k, v === true ? "" : String(v))
    }
  }
}

/** Applies a reactive (or static) string as `textContent`. No-op when `content` is undefined. */
function applyReactiveContent(node: Element, content: Reactive<string> | undefined): void {
  if (content === undefined) return
  if (typeof content === "function") {
    const c = computed(content as () => string)
    node.textContent = c.get()
    subscribe(c, (v) => { node.textContent = v })
  } else {
    node.textContent = content
  }
}

/**
 * Build a reactive element factory for `tag`. Returns a function that
 * accepts `ReactiveAttrs<A>` (defaulting to `GlobalAttrs` when the tag has
 * no specialized attrs type in `html.ts`) and spread `RChild<T>` children,
 * and produces a `Widget<T, El<tag, N>>` — same call shape as `h.*`.
 */
function _reactiveEl<Tag extends keyof HTMLElementTagNameMap, A = GlobalAttrs>(tag: Tag) {
  type N = HTMLElementTagNameMap[Tag]
  type E = El<Tag & string, N>
  // Written as an expanded function type, mirroring `_reactive` in widget.ts,
  // to avoid the `E extends AnyEl` constraint on the Widget<T, E> alias.
  return <T>(attrs: ReactiveAttrs<A>, ...children: RChild<T>[]): ((s: Signal<T>) => E) => {
    return (s: Signal<T>): E => {
      const node = document.createElement(tag) as HTMLElement
      applyReactiveAttrs(node, attrs as Record<string, unknown>)
      for (const child of children) {
        if (typeof child === "function") {
          node.appendChild((child as Widget<T, AnyEl>)(s).node)
        } else {
          node.appendChild(document.createTextNode(child))
        }
      }
      return { _tag: tag, node: node as unknown as N } as unknown as E
    }
  }
}

/** Factory for reactive void elements — no children, e.g. `<img>`, `<input>`. */
function _reactiveVoid<Tag extends keyof HTMLElementTagNameMap, A = GlobalAttrs>(tag: Tag) {
  type N = HTMLElementTagNameMap[Tag]
  type E = El<Tag & string, N>
  return <T>(attrs: ReactiveAttrs<A>): ((s: Signal<T>) => E) => {
    return (_s: Signal<T>): E => {
      const node = document.createElement(tag) as HTMLElement
      applyReactiveAttrs(node, attrs as Record<string, unknown>)
      return { _tag: tag, node: node as unknown as N } as unknown as E
    }
  }
}

/**
 * Factory for reactive elements whose content is a text string rather than
 * child elements (`<script>`, `<style>`, `<title>`, `<option>`, `<textarea>`).
 * `content` accepts a thunk, same as attributes.
 */
function _reactiveContent<Tag extends keyof HTMLElementTagNameMap, A = GlobalAttrs>(tag: Tag) {
  type N = HTMLElementTagNameMap[Tag]
  type E = El<Tag & string, N>
  return <T>(attrs: ReactiveAttrs<A>, content?: Reactive<string>): ((s: Signal<T>) => E) => {
    return (_s: Signal<T>): E => {
      const node = document.createElement(tag) as HTMLElement
      applyReactiveAttrs(node, attrs as Record<string, unknown>)
      applyReactiveContent(node, content)
      return { _tag: tag, node: node as unknown as N } as unknown as E
    }
  }
}

/** Factory for reactive SVG child elements (with children), e.g. `<g>`, `<defs>`. */
function _reactiveSvgEl<Tag extends string, N extends SVGElement, A = GlobalAttrs>(tag: Tag) {
  type E = El<Tag, N>
  return <T>(attrs: ReactiveAttrs<A>, ...children: RChild<T>[]): ((s: Signal<T>) => E) => {
    return (s: Signal<T>): E => {
      const node = document.createElementNS(SVG_NS, tag) as unknown as N
      applyReactiveAttrs(node as unknown as Element, attrs as Record<string, unknown>)
      for (const child of children) {
        if (typeof child === "function") {
          ;(node as unknown as Element).appendChild((child as Widget<T, AnyEl>)(s).node)
        } else {
          ;(node as unknown as Element).appendChild(document.createTextNode(child))
        }
      }
      return { _tag: tag, node }
    }
  }
}

/** Factory for reactive void SVG child elements (no children), e.g. `<circle>`, `<use>`. */
function _reactiveSvgVoid<Tag extends string, N extends SVGElement, A = GlobalAttrs>(tag: Tag) {
  type E = El<Tag, N>
  return <T>(attrs: ReactiveAttrs<A>): ((s: Signal<T>) => E) => {
    return (_s: Signal<T>): E => {
      const node = document.createElementNS(SVG_NS, tag) as unknown as N
      applyReactiveAttrs(node as unknown as Element, attrs as Record<string, unknown>)
      return { _tag: tag, node }
    }
  }
}

// ── Reactive hyperscript factories ────────────────────────────────────────────

/**
 * Reactive hyperscript factories with thunk-valued attributes. Same element
 * tags as `h.*` (widget.ts) — and full parity with every element factory in
 * `html.ts` (enforced by the completeness test in `reactive-html.test.ts`).
 * Import as:
 *
 *   import { r } from '@rhi-zone/rainbow-ui/reactive-html'
 */
export const r = {
  // Document structure
  htmlEl:   _reactiveEl<"html", GlobalAttrs & { lang?: string }>("html"),
  head:     _reactiveEl("head"),
  body:     _reactiveEl("body"),
  // Metadata
  meta:     _reactiveVoid<"meta", MetaAttrs>("meta"),
  link:     _reactiveVoid<"link", LinkAttrs>("link"),
  script:   _reactiveContent<"script", ScriptAttrs>("script"),
  style:    _reactiveContent("style"),
  title_:   _reactiveContent("title"),
  // Sectioning / flow
  div:      _reactiveEl("div"),
  section:  _reactiveEl("section"),
  article:  _reactiveEl("article"),
  aside:    _reactiveEl("aside"),
  header:   _reactiveEl("header"),
  footer:   _reactiveEl("footer"),
  main:     _reactiveEl("main"),
  nav:      _reactiveEl("nav"),
  // Headings
  h1:       _reactiveEl("h1"),
  h2:       _reactiveEl("h2"),
  h3:       _reactiveEl("h3"),
  h4:       _reactiveEl("h4"),
  h5:       _reactiveEl("h5"),
  h6:       _reactiveEl("h6"),
  // Phrasing
  p:        _reactiveEl("p"),
  span:     _reactiveEl("span"),
  a:        _reactiveEl<"a", AAttrs>("a"),
  em:       _reactiveEl("em"),
  strong:   _reactiveEl("strong"),
  code:     _reactiveEl("code"),
  pre:      _reactiveEl("pre"),
  blockquote: _reactiveEl("blockquote"),
  i:        _reactiveEl("i"),
  b:        _reactiveEl("b"),
  small:    _reactiveEl("small"),
  abbr:     _reactiveEl("abbr"),
  // Void phrasing
  br: <T>(): ((s: Signal<T>) => El<"br", HTMLBRElement>) =>
    (_s: Signal<T>): El<"br", HTMLBRElement> => ({ _tag: "br", node: document.createElement("br") }),
  hr:       _reactiveVoid("hr"),
  img:      _reactiveVoid<"img", ImgAttrs>("img"),
  // Lists
  ul:       _reactiveEl("ul"),
  ol:       _reactiveEl<"ol", OlAttrs>("ol"),
  li:       _reactiveEl("li"),
  dl:       _reactiveEl("dl"),
  dt:       _reactiveEl("dt"),
  dd:       _reactiveEl("dd"),
  // Tables
  table:    _reactiveEl("table"),
  thead:    _reactiveEl("thead"),
  tbody:    _reactiveEl("tbody"),
  tfoot:    _reactiveEl("tfoot"),
  tr:       _reactiveEl("tr"),
  th:       _reactiveEl<"th", ThAttrs>("th"),
  td:       _reactiveEl<"td", TdAttrs>("td"),
  // Forms
  form:     _reactiveEl<"form", FormAttrs>("form"),
  input:    _reactiveVoid<"input", InputAttrs>("input"),
  label:    _reactiveEl<"label", LabelAttrs>("label"),
  fieldset: _reactiveEl("fieldset"),
  legend:   _reactiveEl("legend"),
  select:   _reactiveEl<"select", SelectAttrs>("select"),
  option:   _reactiveContent<"option", OptionAttrs>("option"),
  textarea: _reactiveContent<"textarea", TextareaAttrs>("textarea"),
  button:   _reactiveEl<"button", ButtonAttrs>("button"),
  // Media / embedded
  iframe:   _reactiveVoid<"iframe", IframeAttrs>("iframe"),
  video:    _reactiveEl<"video", VideoAttrs>("video"),
  audio:    _reactiveEl<"audio", AudioAttrs>("audio"),
  source:   _reactiveVoid<"source", SourceAttrs>("source"),
  canvas:   _reactiveVoid<"canvas", GlobalAttrs & { width?: string; height?: string }>("canvas"),
  svg:      _reactiveSvgEl<"svg", SVGSVGElement, SvgAttrs>("svg"),
  // SVG child elements
  circle:         _reactiveSvgVoid<"circle", SVGCircleElement, CircleAttrs>("circle"),
  ellipse:        _reactiveSvgVoid<"ellipse", SVGEllipseElement, EllipseAttrs>("ellipse"),
  rect:           _reactiveSvgVoid<"rect", SVGRectElement, RectAttrs>("rect"),
  line:           _reactiveSvgVoid<"line", SVGLineElement, LineAttrs>("line"),
  polyline:       _reactiveSvgVoid<"polyline", SVGPolylineElement, PolylineAttrs>("polyline"),
  polygon:        _reactiveSvgVoid<"polygon", SVGPolygonElement, PolygonAttrs>("polygon"),
  path:           _reactiveSvgVoid<"path", SVGPathElement, PathAttrs>("path"),
  svgText:        _reactiveSvgEl<"text", SVGTextElement, TextAttrs>("text"),
  tspan:          _reactiveSvgEl<"tspan", SVGTSpanElement, TspanAttrs>("tspan"),
  g:              _reactiveSvgEl<"g", SVGGElement, GAttrs>("g"),
  defs:           _reactiveSvgEl<"defs", SVGDefsElement, DefsAttrs>("defs"),
  symbol:         _reactiveSvgEl<"symbol", SVGSymbolElement, SymbolAttrs>("symbol"),
  use:            _reactiveSvgVoid<"use", SVGUseElement, UseAttrs>("use"),
  clipPath:       _reactiveSvgEl<"clipPath", SVGClipPathElement, ClipPathAttrs>("clipPath"),
  mask:           _reactiveSvgEl<"mask", SVGMaskElement, MaskAttrs>("mask"),
  linearGradient: _reactiveSvgEl<"linearGradient", SVGLinearGradientElement, LinearGradientAttrs>("linearGradient"),
  radialGradient: _reactiveSvgEl<"radialGradient", SVGRadialGradientElement, RadialGradientAttrs>("radialGradient"),
  stop:           _reactiveSvgVoid<"stop", SVGStopElement, StopAttrs>("stop"),
  pattern:        _reactiveSvgEl<"pattern", SVGPatternElement, PatternAttrs>("pattern"),
  svgImage:       _reactiveSvgVoid<"image", SVGImageElement, SvgImageAttrs>("image"),
  foreignObject:  _reactiveSvgEl<"foreignObject", SVGForeignObjectElement, ForeignObjectAttrs>("foreignObject"),
  // Text utilities — re-exported as-is, not element factories, but kept here
  // so `r` has full key parity with every export of `html.ts`.
  text,
  textNode,
} as const
