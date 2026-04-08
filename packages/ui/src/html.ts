/**
 * @busiless/ui/html
 *
 * Type-safe DOM element factories. Each factory returns a distinct nominal
 * type so TypeScript can enforce HTML content model constraints: passing a
 * TdEl where FlowContent is expected is a type error.
 *
 * Straight port of rhi-zone/crescent lib/html/init.lua, adapted for DOM
 * construction rather than server-side string rendering.
 *
 * Usage:
 *   import * as h from '@busiless/ui/html'
 *   const card = h.div({ class: 'card' }, h.p({}, 'hello'), h.a({ href: '/about' }, 'About'))
 */

// ── Nominal element wrapper ───────────────────────────────────────────────────

/** Nominal wrapper pairing a tag literal type with the underlying DOM node. */
export type El<Tag extends string, N extends HTMLElement | SVGSVGElement = HTMLElement> = {
  readonly _tag: Tag
  readonly node: N
}

// ── Individual element types ──────────────────────────────────────────────────

// Document structure
export type HtmlEl       = El<"html",       HTMLHtmlElement>
export type HeadEl       = El<"head",       HTMLHeadElement>
export type BodyEl       = El<"body",       HTMLBodyElement>

// Sectioning / flow
export type DivEl        = El<"div",        HTMLDivElement>
export type SectionEl    = El<"section",    HTMLElement>
export type ArticleEl    = El<"article",    HTMLElement>
export type AsideEl      = El<"aside",      HTMLElement>
export type HeaderEl     = El<"header",     HTMLElement>
export type FooterEl     = El<"footer",     HTMLElement>
export type MainEl       = El<"main",       HTMLElement>
export type NavEl        = El<"nav",        HTMLElement>

// Headings
export type H1El         = El<"h1",         HTMLHeadingElement>
export type H2El         = El<"h2",         HTMLHeadingElement>
export type H3El         = El<"h3",         HTMLHeadingElement>
export type H4El         = El<"h4",         HTMLHeadingElement>
export type H5El         = El<"h5",         HTMLHeadingElement>
export type H6El         = El<"h6",         HTMLHeadingElement>

// Phrasing
export type PEl          = El<"p",          HTMLParagraphElement>
export type SpanEl       = El<"span",       HTMLSpanElement>
export type AEl          = El<"a",          HTMLAnchorElement>
export type EmEl         = El<"em",         HTMLElement>
export type StrongEl     = El<"strong",     HTMLElement>
export type CodeEl       = El<"code",       HTMLElement>
export type PreEl        = El<"pre",        HTMLPreElement>
export type BlockquoteEl = El<"blockquote", HTMLElement>
export type IEl          = El<"i",          HTMLElement>
export type BEl          = El<"b",          HTMLElement>
export type SmallEl      = El<"small",      HTMLElement>
export type AbbrEl       = El<"abbr",       HTMLElement>

// Void phrasing
export type BrEl         = El<"br",         HTMLBRElement>
export type HrEl         = El<"hr",         HTMLHRElement>
export type ImgEl        = El<"img",        HTMLImageElement>

// Lists
export type UlEl         = El<"ul",         HTMLUListElement>
export type OlEl         = El<"ol",         HTMLOListElement>
export type LiEl         = El<"li",         HTMLLIElement>
export type DlEl         = El<"dl",         HTMLDListElement>
export type DtEl         = El<"dt",         HTMLElement>
export type DdEl         = El<"dd",         HTMLElement>

// Tables
export type TableEl      = El<"table",      HTMLTableElement>
export type TheadEl      = El<"thead",      HTMLTableSectionElement>
export type TbodyEl      = El<"tbody",      HTMLTableSectionElement>
export type TfootEl      = El<"tfoot",      HTMLTableSectionElement>
export type TrEl         = El<"tr",         HTMLTableRowElement>
export type ThEl         = El<"th",         HTMLTableCellElement>
export type TdEl         = El<"td",         HTMLTableCellElement>

// Forms
export type FormEl       = El<"form",       HTMLFormElement>
export type InputEl      = El<"input",      HTMLInputElement>
export type LabelEl      = El<"label",      HTMLLabelElement>
export type FieldsetEl   = El<"fieldset",   HTMLFieldSetElement>
export type SelectEl     = El<"select",     HTMLSelectElement>
export type OptionEl     = El<"option",     HTMLOptionElement>
export type TextareaEl   = El<"textarea",   HTMLTextAreaElement>
export type ButtonEl     = El<"button",     HTMLButtonElement>

// Media / embedded
export type IframeEl     = El<"iframe",     HTMLIFrameElement>
export type VideoEl      = El<"video",      HTMLVideoElement>
export type AudioEl      = El<"audio",      HTMLAudioElement>
export type SourceEl     = El<"source",     HTMLSourceElement>
export type CanvasEl     = El<"canvas",     HTMLCanvasElement>
export type SvgEl        = El<"svg",        SVGSVGElement>

// Metadata
export type StyleEl      = El<"style",      HTMLStyleElement>
export type ScriptEl     = El<"script",     HTMLScriptElement>
export type MetaEl       = El<"meta",       HTMLMetaElement>
export type LinkEl       = El<"link",       HTMLLinkElement>
export type TitleEl      = El<"title",      HTMLTitleElement>

// ── Content categories ────────────────────────────────────────────────────────

export type HeadContent = MetaEl | LinkEl | ScriptEl | StyleEl | TitleEl

export type PhrasingContent =
  | SpanEl | AEl | EmEl | StrongEl | CodeEl
  | IEl | BEl | SmallEl | AbbrEl
  | ImgEl | BrEl | InputEl | ButtonEl | LabelEl
  | SelectEl | TextareaEl

export type HeadingContent = H1El | H2El | H3El | H4El | H5El | H6El

export type SectioningContent = SectionEl | ArticleEl | AsideEl | NavEl

export type EmbeddedContent = ImgEl | VideoEl | AudioEl | IframeEl | CanvasEl | SvgEl

export type FlowContent =
  | DivEl | PEl | PreEl | BlockquoteEl
  | UlEl | OlEl | DlEl
  | TableEl | FormEl | FieldsetEl
  | HeaderEl | FooterEl | MainEl
  | HrEl | HeadingContent | SectioningContent
  | PhrasingContent | EmbeddedContent

export type TableSectionContent = TheadEl | TbodyEl | TfootEl
export type RowContent          = TrEl
export type CellContent         = TdEl | ThEl
export type ListItemContent     = LiEl
export type SelectContent       = OptionEl

export type DefinitionListContent = DtEl | DdEl

export type AnyEl =
  | FlowContent | HeadContent | RowContent | CellContent
  | ListItemContent | SelectContent | SourceEl
  | TableSectionContent | DefinitionListContent
  | HtmlEl | HeadEl | BodyEl

// ── Attribute types ───────────────────────────────────────────────────────────

export type GlobalAttrs = {
  id?: string
  class?: string
  style?: string
  title?: string
  hidden?: boolean
  tabindex?: number
  [key: `data-${string}`]: string | undefined
}

export type AAttrs        = GlobalAttrs & { href?: string; target?: string; rel?: string; download?: string }
export type ButtonAttrs   = GlobalAttrs & { type?: string; name?: string; value?: string; disabled?: boolean; form?: string }
export type FormAttrs     = GlobalAttrs & { action?: string; method?: string; enctype?: string }
export type ImgAttrs      = GlobalAttrs & { src: string; alt: string; width?: string; height?: string; loading?: string }
export type InputAttrs    = GlobalAttrs & { type?: string; name?: string; value?: string; placeholder?: string; required?: boolean; disabled?: boolean; checked?: boolean; readonly?: boolean }
export type LabelAttrs    = GlobalAttrs & { for?: string }
export type LinkAttrs     = { rel: string; href?: string; type?: string; media?: string; id?: string; class?: string }
export type MetaAttrs     = { name?: string; content?: string; charset?: string; "http-equiv"?: string }
export type OptionAttrs   = GlobalAttrs & { value?: string; selected?: boolean; disabled?: boolean }
export type ScriptAttrs   = { src?: string; type?: string; async?: boolean; defer?: boolean; id?: string }
export type SelectAttrs   = GlobalAttrs & { name?: string; multiple?: boolean; required?: boolean; disabled?: boolean }
export type TextareaAttrs = GlobalAttrs & { name?: string; rows?: number; cols?: number; placeholder?: string; required?: boolean; disabled?: boolean; readonly?: boolean }
export type VideoAttrs    = GlobalAttrs & { src?: string; controls?: boolean; autoplay?: boolean; loop?: boolean; muted?: boolean; width?: string; height?: string }
export type AudioAttrs    = GlobalAttrs & { src?: string; controls?: boolean; autoplay?: boolean; loop?: boolean; muted?: boolean }
export type SourceAttrs   = { src?: string; type?: string; srcset?: string; media?: string }
export type ThAttrs       = GlobalAttrs & { colspan?: number; rowspan?: number; scope?: string }
export type TdAttrs       = GlobalAttrs & { colspan?: number; rowspan?: number }
export type OlAttrs       = GlobalAttrs & { start?: number }
export type SvgAttrs      = { id?: string; class?: string; style?: string; width?: string; height?: string; viewBox?: string; xmlns?: string }
export type IframeAttrs   = GlobalAttrs & { src?: string; width?: string; height?: string; name?: string }

// ── Internal helpers ──────────────────────────────────────────────────────────

type RawAttrs = Record<string, unknown>
type Child = AnyEl | string

function applyAttrs(node: HTMLElement | SVGSVGElement, attrs: RawAttrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    node.setAttribute(k, v === true ? "" : String(v))
  }
}

function appendChildren(node: HTMLElement | SVGSVGElement, children: Child[]): void {
  for (const child of children) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child.node)
  }
}

/** Factory for normal elements. */
function _el<Tag extends string, N extends HTMLElement>(tag: Tag) {
  return (attrs: RawAttrs, ...children: Child[]): El<Tag, N> => {
    const node = document.createElement(tag) as unknown as N
    applyAttrs(node, attrs)
    appendChildren(node, children)
    return { _tag: tag, node }
  }
}

/** Factory for void elements (no children). */
function _void<Tag extends string, N extends HTMLElement>(tag: Tag) {
  return (attrs: RawAttrs): El<Tag, N> => {
    const node = document.createElement(tag) as unknown as N
    applyAttrs(node, attrs)
    return { _tag: tag, node }
  }
}

// ── Document structure ────────────────────────────────────────────────────────

export const htmlEl = (attrs: GlobalAttrs & { lang?: string }, ...children: (HeadEl | BodyEl)[]): HtmlEl =>
  _el<"html", HTMLHtmlElement>("html")(attrs as RawAttrs, ...children)

export const head = (attrs: GlobalAttrs, ...children: HeadContent[]): HeadEl =>
  _el<"head", HTMLHeadElement>("head")(attrs as RawAttrs, ...children)

export const body = (attrs: GlobalAttrs, ...children: FlowContent[]): BodyEl =>
  _el<"body", HTMLBodyElement>("body")(attrs as RawAttrs, ...children)

// ── Metadata ──────────────────────────────────────────────────────────────────

export const meta    = (attrs: MetaAttrs): MetaEl =>
  _void<"meta", HTMLMetaElement>("meta")(attrs as RawAttrs)

export const link    = (attrs: LinkAttrs): LinkEl =>
  _void<"link", HTMLLinkElement>("link")(attrs as RawAttrs)

export const script  = (attrs: ScriptAttrs, content?: string): ScriptEl => {
  const node = document.createElement("script")
  applyAttrs(node, attrs as RawAttrs)
  if (content !== undefined) node.textContent = content
  return { _tag: "script", node }
}

export const style   = (attrs: GlobalAttrs, content: string): StyleEl => {
  const node = document.createElement("style")
  applyAttrs(node, attrs as RawAttrs)
  node.textContent = content
  return { _tag: "style", node }
}

export const title_  = (attrs: GlobalAttrs, content: string): TitleEl => {
  const node = document.createElement("title")
  applyAttrs(node, attrs as RawAttrs)
  node.textContent = content
  return { _tag: "title", node }
}

// ── Flow content ──────────────────────────────────────────────────────────────

export const div        = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): DivEl =>
  _el<"div", HTMLDivElement>("div")(attrs as RawAttrs, ...children)

export const section    = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): SectionEl =>
  _el<"section", HTMLElement>("section")(attrs as RawAttrs, ...children)

export const article    = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): ArticleEl =>
  _el<"article", HTMLElement>("article")(attrs as RawAttrs, ...children)

export const aside      = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): AsideEl =>
  _el<"aside", HTMLElement>("aside")(attrs as RawAttrs, ...children)

export const header     = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): HeaderEl =>
  _el<"header", HTMLElement>("header")(attrs as RawAttrs, ...children)

export const footer     = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): FooterEl =>
  _el<"footer", HTMLElement>("footer")(attrs as RawAttrs, ...children)

export const main       = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): MainEl =>
  _el<"main", HTMLElement>("main")(attrs as RawAttrs, ...children)

export const nav        = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): NavEl =>
  _el<"nav", HTMLElement>("nav")(attrs as RawAttrs, ...children)

// ── Headings ──────────────────────────────────────────────────────────────────

export const h1 = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): H1El =>
  _el<"h1", HTMLHeadingElement>("h1")(attrs as RawAttrs, ...children)

export const h2 = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): H2El =>
  _el<"h2", HTMLHeadingElement>("h2")(attrs as RawAttrs, ...children)

export const h3 = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): H3El =>
  _el<"h3", HTMLHeadingElement>("h3")(attrs as RawAttrs, ...children)

export const h4 = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): H4El =>
  _el<"h4", HTMLHeadingElement>("h4")(attrs as RawAttrs, ...children)

export const h5 = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): H5El =>
  _el<"h5", HTMLHeadingElement>("h5")(attrs as RawAttrs, ...children)

export const h6 = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): H6El =>
  _el<"h6", HTMLHeadingElement>("h6")(attrs as RawAttrs, ...children)

// ── Phrasing content ──────────────────────────────────────────────────────────

export const p          = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): PEl =>
  _el<"p", HTMLParagraphElement>("p")(attrs as RawAttrs, ...children)

export const a          = (attrs: AAttrs, ...children: (PhrasingContent | string)[]): AEl =>
  _el<"a", HTMLAnchorElement>("a")(attrs as RawAttrs, ...children)

export const span       = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): SpanEl =>
  _el<"span", HTMLSpanElement>("span")(attrs as RawAttrs, ...children)

export const em         = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): EmEl =>
  _el<"em", HTMLElement>("em")(attrs as RawAttrs, ...children)

export const strong     = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): StrongEl =>
  _el<"strong", HTMLElement>("strong")(attrs as RawAttrs, ...children)

export const code       = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): CodeEl =>
  _el<"code", HTMLElement>("code")(attrs as RawAttrs, ...children)

export const pre        = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): PreEl =>
  _el<"pre", HTMLPreElement>("pre")(attrs as RawAttrs, ...children)

export const blockquote = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): BlockquoteEl =>
  _el<"blockquote", HTMLElement>("blockquote")(attrs as RawAttrs, ...children)

export const i          = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): IEl =>
  _el<"i", HTMLElement>("i")(attrs as RawAttrs, ...children)

export const b          = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): BEl =>
  _el<"b", HTMLElement>("b")(attrs as RawAttrs, ...children)

export const small      = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): SmallEl =>
  _el<"small", HTMLElement>("small")(attrs as RawAttrs, ...children)

export const abbr       = (attrs: GlobalAttrs & { title?: string }, ...children: (PhrasingContent | string)[]): AbbrEl =>
  _el<"abbr", HTMLElement>("abbr")(attrs as RawAttrs, ...children)

// ── Void phrasing content ─────────────────────────────────────────────────────

/** Pre-instantiated <br>. Creates a new DOM node each call to avoid insertion-move semantics. */
export const br  = (): BrEl  => ({ _tag: "br",  node: document.createElement("br")  })
export const hr  = (attrs: GlobalAttrs = {}): HrEl  => _void<"hr",  HTMLHRElement >("hr" )(attrs as RawAttrs)
export const img = (attrs: ImgAttrs): ImgEl => _void<"img", HTMLImageElement>("img")(attrs as RawAttrs)

// ── Lists ─────────────────────────────────────────────────────────────────────

export const ul = (attrs: GlobalAttrs, ...children: ListItemContent[]): UlEl =>
  _el<"ul", HTMLUListElement>("ul")(attrs as RawAttrs, ...children)

export const ol = (attrs: OlAttrs, ...children: ListItemContent[]): OlEl =>
  _el<"ol", HTMLOListElement>("ol")(attrs as RawAttrs, ...children)

export const li = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): LiEl =>
  _el<"li", HTMLLIElement>("li")(attrs as RawAttrs, ...children)

export const dl = (attrs: GlobalAttrs, ...children: (DtEl | DdEl)[]): DlEl =>
  _el<"dl", HTMLDListElement>("dl")(attrs as RawAttrs, ...children)

export const dt = (attrs: GlobalAttrs, ...children: (PhrasingContent | string)[]): DtEl =>
  _el<"dt", HTMLElement>("dt")(attrs as RawAttrs, ...children)

export const dd = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): DdEl =>
  _el<"dd", HTMLElement>("dd")(attrs as RawAttrs, ...children)

// ── Tables ────────────────────────────────────────────────────────────────────

export const table = (attrs: GlobalAttrs, ...children: TableSectionContent[]): TableEl =>
  _el<"table", HTMLTableElement>("table")(attrs as RawAttrs, ...children)

export const thead = (attrs: GlobalAttrs, ...children: RowContent[]): TheadEl =>
  _el<"thead", HTMLTableSectionElement>("thead")(attrs as RawAttrs, ...children)

export const tbody = (attrs: GlobalAttrs, ...children: RowContent[]): TbodyEl =>
  _el<"tbody", HTMLTableSectionElement>("tbody")(attrs as RawAttrs, ...children)

export const tfoot = (attrs: GlobalAttrs, ...children: RowContent[]): TfootEl =>
  _el<"tfoot", HTMLTableSectionElement>("tfoot")(attrs as RawAttrs, ...children)

export const tr    = (attrs: GlobalAttrs, ...children: CellContent[]): TrEl =>
  _el<"tr", HTMLTableRowElement>("tr")(attrs as RawAttrs, ...children)

export const th    = (attrs: ThAttrs, ...children: (PhrasingContent | string)[]): ThEl =>
  _el<"th", HTMLTableCellElement>("th")(attrs as RawAttrs, ...children)

export const td    = (attrs: TdAttrs, ...children: (FlowContent | string)[]): TdEl =>
  _el<"td", HTMLTableCellElement>("td")(attrs as RawAttrs, ...children)

// ── Forms ─────────────────────────────────────────────────────────────────────

export const form     = (attrs: FormAttrs, ...children: (FlowContent | string)[]): FormEl =>
  _el<"form", HTMLFormElement>("form")(attrs as RawAttrs, ...children)

export const input    = (attrs: InputAttrs): InputEl =>
  _void<"input", HTMLInputElement>("input")(attrs as RawAttrs)

export const label    = (attrs: LabelAttrs, ...children: (PhrasingContent | string)[]): LabelEl =>
  _el<"label", HTMLLabelElement>("label")(attrs as RawAttrs, ...children)

export const fieldset = (attrs: GlobalAttrs, ...children: (FlowContent | string)[]): FieldsetEl =>
  _el<"fieldset", HTMLFieldSetElement>("fieldset")(attrs as RawAttrs, ...children)

export const select   = (attrs: SelectAttrs, ...children: SelectContent[]): SelectEl =>
  _el<"select", HTMLSelectElement>("select")(attrs as RawAttrs, ...children)

export const option   = (attrs: OptionAttrs, content?: string): OptionEl => {
  const node = document.createElement("option")
  applyAttrs(node, attrs as RawAttrs)
  if (content !== undefined) node.textContent = content
  return { _tag: "option", node }
}

export const textarea = (attrs: TextareaAttrs, content?: string): TextareaEl => {
  const node = document.createElement("textarea")
  applyAttrs(node, attrs as RawAttrs)
  if (content !== undefined) node.textContent = content
  return { _tag: "textarea", node }
}

export const button   = (attrs: ButtonAttrs, ...children: (PhrasingContent | string)[]): ButtonEl =>
  _el<"button", HTMLButtonElement>("button")(attrs as RawAttrs, ...children)

// ── Media ─────────────────────────────────────────────────────────────────────

export const iframe = (attrs: IframeAttrs): IframeEl =>
  _void<"iframe", HTMLIFrameElement>("iframe")(attrs as RawAttrs)

export const video  = (attrs: VideoAttrs, ...children: (SourceEl | string)[]): VideoEl =>
  _el<"video", HTMLVideoElement>("video")(attrs as RawAttrs, ...children)

export const audio  = (attrs: AudioAttrs, ...children: (SourceEl | string)[]): AudioEl =>
  _el<"audio", HTMLAudioElement>("audio")(attrs as RawAttrs, ...children)

export const source = (attrs: SourceAttrs): SourceEl =>
  _void<"source", HTMLSourceElement>("source")(attrs as RawAttrs)

// ── Graphics ──────────────────────────────────────────────────────────────────

export const canvas = (attrs: GlobalAttrs & { width?: string; height?: string }): CanvasEl =>
  _void<"canvas", HTMLCanvasElement>("canvas")(attrs as RawAttrs)

export const svg    = (attrs: SvgAttrs, ...children: string[]): SvgEl => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  applyAttrs(node, attrs as RawAttrs)
  for (const child of children) node.innerHTML += child
  return { _tag: "svg", node }
}

// ── Text utility ──────────────────────────────────────────────────────────────

/** Escape HTML special characters. Useful for building safe attribute values. */
export function text(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/** Wrap a string as a DOM text node (for cases where AnyEl is required). */
export function textNode(s: string): Text {
  return document.createTextNode(s)
}
