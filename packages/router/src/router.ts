import {
  signal,
  notAsked, loading, failure, success,
} from '@rhi-zone/rainbow'
import type {
  Signal, ReadonlySignal,
  AsyncData,
} from '@rhi-zone/rainbow'
import { match } from './matcher.ts'
import type { RouteTree, MatchedRoute, ScrollHandler } from './types.ts'

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

/** Options passed to `createRouter`. */
export type RouterOptions = {
  /** Scroll behavior handler; defaults to `scrollRestore` when using the `defaults` entry point. */
  scroll?: ScrollHandler
}

/** A running router instance. */
export type Router = {
  /** Read-only signal of the currently matched route, or `null` if no route matched. */
  readonly current:     ReadonlySignal<MatchedRoute | null>
  /** Read-only signal of the active loader's `AsyncData` state. */
  readonly loaderState: ReadonlySignal<AsyncData<unknown>>
  /** Push a new history entry and navigate to `pathname`. */
  navigate(pathname: string): void
  /** Replace the current history entry and navigate to `pathname`. */
  replace(pathname: string):  void
  /** Go back one entry in the browser history. */
  back():    void
  /** Go forward one entry in the browser history. */
  forward(): void
  /** Remove event listeners and abort any in-flight loader. Call when unmounting. */
  destroy(): void
}

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

/**
 * Create a router that binds to the browser's `window.location` and History API.
 *
 * The `current` signal updates synchronously on every navigation. If the matched
 * route has a `loader`, the router automatically manages the `loaderState` signal
 * through `notAsked → loading → success | failure`, aborting in-flight requests on
 * subsequent navigations.
 *
 * @param tree - The route tree to match against.
 * @param options - Optional scroll handler and other settings.
 * @returns A `Router` instance.
 *
 * @example
 * ```ts
 * const router = createRouter({
 *   '': { component: HomePage },
 *   about: { component: AboutPage },
 *   posts: {
 *     _id: { '': { component: PostPage } },
 *   },
 * })
 *
 * router.navigate('/posts/42')
 * router.current.get() // { leaf: { component: PostPage }, params: { id: '42' }, ... }
 * ```
 */
export function createRouter(tree: RouteTree, options?: RouterOptions): Router {
  // Source of truth — the current window pathname.
  const pathnameSignal: Signal<string> = signal(window.location.pathname)

  // Derived matched route.
  const current: ReadonlySignal<MatchedRoute | null> =
    pathnameSignal.map(p => match(tree, p))

  // Loader state
  const loaderStateSignal: Signal<AsyncData<unknown>> = signal<AsyncData<unknown>>(notAsked)

  // Track in-flight loader so we can abort on navigation.
  let abortController: AbortController | null = null

  // Track previous pathname for scroll `from`.
  let prev: string = window.location.pathname

  // Subscribe to route changes — run loader lifecycle.
  const unsubscribeCurrent = current.subscribe((route) => {
    // Abort any previous in-flight loader.
    abortController?.abort()
    abortController = null

    if (route === null || route.leaf.loader === undefined) {
      loaderStateSignal.set(notAsked)
      return
    }

    const ac = new AbortController()
    abortController = ac
    loaderStateSignal.set(loading)

    // RouteConfig.loader is typed as LoaderFn<Record<string,string>> but params
    // may contain non-string values from ParamParser. The cast is safe here
    // because any param values that aren't strings were parsed by the user's
    // own ParamParser and their loader already knows the real types.
    route.leaf.loader({ params: route.params as Record<string, string>, signal: ac.signal }).then(
      (value) => {
        if (!ac.signal.aborted) {
          loaderStateSignal.set(success(value))
        }
      },
      (err: unknown) => {
        if (!ac.signal.aborted) {
          loaderStateSignal.set(failure(err))
        }
      },
    )
  })

  // Popstate handler — browser back/forward.
  const onPopState = (_event: PopStateEvent): void => {
    const from = prev
    const to   = window.location.pathname
    prev = to

    pathnameSignal.set(to)

    options?.scroll?.({
      type: 'pop',
      hash: window.location.hash.slice(1) || null,
      from,
      to,
    })
  }

  window.addEventListener('popstate', onPopState)

  // ---------------------------------------------------------------------------
  // navigate — push a new history entry
  // ---------------------------------------------------------------------------

  const navigate = (path: string): void => {
    const url  = new URL(path, location.href)
    const to   = url.pathname
    const hash = url.hash.slice(1) || null
    const from = prev
    prev = to

    history.pushState({ _type: 'push' }, '', path)

    options?.scroll?.({ type: 'push', hash, from, to })

    pathnameSignal.set(to)
  }

  // ---------------------------------------------------------------------------
  // replace — replace the current history entry
  // ---------------------------------------------------------------------------

  const replace = (path: string): void => {
    const url  = new URL(path, location.href)
    const to   = url.pathname
    const hash = url.hash.slice(1) || null
    const from = prev
    prev = to

    history.replaceState({ _type: 'replace' }, '', path)

    options?.scroll?.({ type: 'replace', hash, from, to })

    pathnameSignal.set(to)
  }

  // ---------------------------------------------------------------------------
  // destroy — clean up listeners and in-flight loaders
  // ---------------------------------------------------------------------------

  const destroy = (): void => {
    unsubscribeCurrent()
    window.removeEventListener('popstate', onPopState)
    abortController?.abort()
    abortController = null
  }

  return {
    current,
    loaderState: loaderStateSignal,
    navigate,
    replace,
    back:    () => history.back(),
    forward: () => history.forward(),
    destroy,
  }
}
