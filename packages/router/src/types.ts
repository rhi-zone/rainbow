import type { AsyncData } from '@rhi-zone/rainbow'

// ---------------------------------------------------------------------------
// Param parsing
// ---------------------------------------------------------------------------

/** The router's only contract for param validation. null = no match → 404. */
export type ParamParser<T> = (raw: string) => T | null

// ---------------------------------------------------------------------------
// Scroll
// ---------------------------------------------------------------------------

export type ScrollNav = {
  readonly type: 'push' | 'pop' | 'replace'
  readonly hash: string | null
  readonly from: string
  readonly to:   string
}

export type ScrollHandler = (nav: ScrollNav) => void

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type LoaderCtx<P extends Record<string, unknown> = Record<string, string>> = {
  readonly params: P
  readonly signal: AbortSignal
}

export type LoaderFn<P extends Record<string, unknown> = Record<string, string>, T = unknown> =
  (ctx: LoaderCtx<P>) => Promise<T>

// ---------------------------------------------------------------------------
// Route node
// ---------------------------------------------------------------------------

/**
 * A route node config — metadata attached to a path depth.
 * Component type is `unknown` to stay framework-agnostic;
 * the Lit/React/etc. adapters provide typed wrappers.
 */
export type RouteConfig = {
  readonly component?: unknown
  readonly loader?:    LoaderFn
  readonly params?:    Record<string, ParamParser<unknown>>
  readonly scroll?:    ScrollHandler
}

/**
 * A route tree node — either a shorthand component, a config, or a subtree.
 * The `''` key at any subtree node is the handler at that exact depth.
 */
export type RouteTree = {
  readonly [segment: string]: RouteTree | RouteConfig | unknown
}

// ---------------------------------------------------------------------------
// Match result
// ---------------------------------------------------------------------------

export type MatchedRoute = {
  /** Layout stack from outermost to innermost, excluding leaf. */
  readonly layouts: RouteConfig[]
  /** The innermost matched config. */
  readonly leaf:    RouteConfig
  /** Validated and parsed params accumulated from all dynamic segments. */
  readonly params:  Record<string, unknown>
  /** The full matched pathname. */
  readonly pathname: string
}

export type LoaderState<T = unknown> = AsyncData<T, unknown>
