# @rhi-zone/rainbow-url

Reactive URL combinators for rainbow. The query string as a two-way `Signal` —
no framework, no codegen.

## What it is

A `Signal<Record<string, string | string[]>>` bound to `window.location.search`
(or the query portion of `window.location.hash`). It is the rainbow-idiomatic
counterpart to VueUse's `useUrlSearchParams`, built on the core `Signal`
primitive and the platform `URLSearchParams` / History API — the same idioms as
`@rhi-zone/rainbow-router` (a root `signal()` source of truth, a single bound
`popstate` / `hashchange` listener, `batch()` on URL→signal updates, and a
`destroy()` for cleanup).

Key properties:

- **Two-way** — initialized from the current URL; `.set()` serializes to
  `history.replaceState` (default) or `pushState`; back/forward and external
  navigation flow back into the signal.
- **Array params** — `?k=a&k=b` round-trips as `string[]`.
- **Modes** — `history` (default, `location.search`) or `hash`
  (`location.hash` query, preserving any hash path).
- **Replace by default** — filter churn does not flood the back button; pass
  `{ replace: false }` for push semantics.
- **SSR / no-window safe** — with no `window`, returns an inert signal that
  performs no I/O and registers no listener.
- **Signal-native** — composes with `.map()` / `.focus()` and `useUrlSearchParam`
  for a single focused key.

## Install

```sh
npm install @rhi-zone/rainbow-url
```

## API

```ts
function useUrlSearchParams(options?: {
  mode?: 'history' | 'hash'   // default 'history'
  replace?: boolean           // default true (replaceState)
  window?: Window | null      // default ambient window; null => inert/SSR
}): Signal<Record<string, string | string[]>> & { destroy(): void }

function useUrlSearchParam(
  params: Signal<Record<string, string | string[]>>,
  key: string,
): Signal<string>
```

## Quick example

```ts
import { useUrlSearchParams, useUrlSearchParam } from '@rhi-zone/rainbow-url'

const params = useUrlSearchParams()        // history mode, replaceState
params.get()                               // { q: 'shoes', tag: ['a', 'b'] }
params.set({ q: 'boots' })                 // -> ?q=boots in the address bar

const q = useUrlSearchParam(params, 'q')   // focused Signal<string>
q.set('sandals')                           // writes back through the URL
q.set('')                                  // removes the key

// later, on unmount
params.destroy()
```

## Docs

Full guides, API reference, and design notes are at the [Rainbow VitePress site](https://rhi.zone/rainbow/).

## License

MIT
