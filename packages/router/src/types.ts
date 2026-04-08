import type { AsyncData } from '@rhi-zone/rainbow'

// ---------------------------------------------------------------------------
// Param parsing
// ---------------------------------------------------------------------------

/**
 * The router's only contract for param validation.
 * Receive the raw URL segment string; return the parsed value or `null` to signal no match (→ 404).
 */
export type ParamParser<T> = (raw: string) => T | null

// ---------------------------------------------------------------------------
// Scroll
// ---------------------------------------------------------------------------

/** Navigation metadata passed to a `ScrollHandler`. */
export type ScrollNav = {
  /** Whether this navigation was a history push, pop (back/forward), or replace. */
  readonly type: 'push' | 'pop' | 'replace'
  /** The hash fragment of the destination URL without the `#`, or `null` if absent. */
  readonly hash: string | null
  /** The pathname navigated from. */
  readonly from: string
  /** The pathname navigated to. */
  readonly to:   string
}

/**
 * A function called after every navigation to control scroll behavior.
 * @see scrollTop, scrollNone, scrollToHash, scrollRestore
 */
export type ScrollHandler = (nav: ScrollNav) => void

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/** Context passed to a route loader function. */
export type LoaderCtx<P extends Record<string, unknown> = Record<string, string>> = {
  /** Validated and parsed route params for this route. */
  readonly params: P
  /** AbortSignal that is aborted if the user navigates away before the loader resolves. */
  readonly signal: AbortSignal
}

/**
 * An async function that fetches data for a route.
 * Receives params and an AbortSignal; resolves to the loaded data.
 */
export type LoaderFn<P extends Record<string, unknown> = Record<string, string>, T = unknown> =
  (ctx: LoaderCtx<P>) => Promise<T>

// ---------------------------------------------------------------------------
// Route node
// ---------------------------------------------------------------------------

/**
 * Metadata attached to a route at a given path depth.
 * Component type is `unknown` to stay framework-agnostic;
 * framework adapters provide typed wrappers.
 */
export type RouteConfig = {
  /** The component or view to render at this route. */
  readonly component?: unknown
  /** Optional data loader; called when the route is matched. */
  readonly loader?:    LoaderFn
  /** ParamParser map for dynamic segments at this node. */
  readonly params?:    Record<string, ParamParser<unknown>>
  /** Scroll behavior override for this route. */
  readonly scroll?:    ScrollHandler
}

/**
 * A trie node in the route tree.
 *
 * - String keys are static path segments (e.g. `admin`, `settings`).
 * - Keys starting with `_` are dynamic segments (e.g. `_id`, `_slug`).
 * - The `''` key is the handler at the exact depth of that node.
 *
 * @example
 * ```ts
 * const routes: RouteTree = {
 *   '': { component: HomePage },
 *   admin: {
 *     '': { component: AdminLayout },
 *     users: { component: UsersPage },
 *   },
 *   posts: {
 *     _id: {
 *       '': { component: PostPage, params: { id: Number } },
 *     },
 *   },
 * }
 * ```
 */
export type RouteTree = {
  readonly [segment: string]: RouteTree | RouteConfig | unknown
}

// ---------------------------------------------------------------------------
// Match result
// ---------------------------------------------------------------------------

/** The result of a successful route match. */
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

/** The reactive state of the active route's loader. */
export type LoaderState<T = unknown> = AsyncData<T, unknown>
