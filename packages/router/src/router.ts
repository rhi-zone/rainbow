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

export type RouterOptions = {
  scroll?: ScrollHandler
}

export type Router = {
  readonly current:     ReadonlySignal<MatchedRoute | null>
  readonly loaderState: ReadonlySignal<AsyncData<unknown>>
  navigate(pathname: string): void
  replace(pathname: string):  void
  back():    void
  forward(): void
  destroy(): void
}

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

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
