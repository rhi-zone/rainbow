# Rainbow Router

Rainbow Router is a trie-based SPA router for TypeScript. It treats the URL as reactive state — `router.current` is a `ReadonlySignal<MatchedRoute | null>` that updates synchronously on every navigation, and everything downstream derives from it.

There is no file-system convention, no codegen, and no compiler plugin. Routes are plain TypeScript objects.

## Philosophy

The URL is state. Navigation is mutation. The router is a lens from `window.location.pathname` to your application's active view.

Rather than hiding this behind abstractions, rainbow-router makes it explicit:

- `createRouter` initialises a signal wired to `window.location`.
- `navigate` and `replace` update the signal (and push/replace history entries).
- `current` is a derived signal you subscribe to like any other reactive value.

## Route tree syntax

A route tree is a plain object. Keys are path segments; the `''` (empty string) key is the handler at that exact depth.

```ts
import type { RouteTree } from '@rhi-zone/rainbow-router'

const routes: RouteTree = {
  // Handler for "/"
  '': { component: HomePage },

  about: { component: AboutPage },

  admin: {
    '': { component: AdminLayout },
    users: { component: UsersPage },
    settings: { component: SettingsPage },
  },

  posts: {
    _id: {
      '': { component: PostPage },
    },
  },
}
```

### Static vs dynamic segments

- A plain string key (`about`, `admin`) is a **static** segment — it must match exactly.
- A key starting with `_` (`_id`, `_slug`) is a **dynamic** segment — it captures whatever is in that position.
- Static keys take priority over dynamic keys at the same depth.

### Layout layers

The `''` key at an intermediate node (not the final segment) becomes a **layout** — collected into `MatchedRoute.layouts` in outermost-to-innermost order. This lets you wrap nested routes in shared chrome without duplicating config.

```ts
const routes: RouteTree = {
  app: {
    '': { component: AppShell },  // layout for all /app/* routes
    dashboard: { component: DashboardPage },
    profile: { component: ProfilePage },
  },
}
```

## ParamParser adapters

A `ParamParser<T>` is a plain function: `(raw: string) => T | null`. Return `null` to reject the segment (results in a 404).

```ts
const positiveInt: ParamParser<number> = (raw) => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

const routes: RouteTree = {
  posts: {
    _id: {
      '': {
        component: PostPage,
        params: { id: positiveInt },
      },
    },
  },
}
```

### Standard Schema adapter

If you are using a validation library that implements the [Standard Schema](https://standardschema.dev/) spec (Zod, Valibot, ArkType, etc.), adapt it with `fromSchema`:

```ts
import { fromSchema } from '@rhi-zone/rainbow-router/adapters/standard-schema'
import * as v from 'valibot'

const UuidSchema = v.pipe(v.string(), v.uuid())

const routes: RouteTree = {
  users: {
    _id: {
      '': {
        component: UserPage,
        params: { id: fromSchema(UuidSchema) },
      },
    },
  },
}
```

> **Note:** Async schemas are not supported at the routing boundary. `fromSchema` returns `null` (no match) if `validate` returns a `Promise`.

## createRouter

```ts
import { createRouter } from '@rhi-zone/rainbow-router'

const router = createRouter(routes, { scroll: scrollRestore })
```

The returned `Router` object:

| Property / Method | Type | Description |
|---|---|---|
| `current` | `ReadonlySignal<MatchedRoute | null>` | The currently matched route, or `null` if unmatched. |
| `loaderState` | `ReadonlySignal<AsyncData<unknown>>` | The loader's async state for the active route. |
| `navigate(path)` | `void` | Push a new history entry and navigate. |
| `replace(path)` | `void` | Replace the current history entry and navigate. |
| `back()` | `void` | Equivalent to `history.back()`. |
| `forward()` | `void` | Equivalent to `history.forward()`. |
| `destroy()` | `void` | Remove listeners and abort in-flight loaders. Call when unmounting. |

### Subscribing to route changes

```ts
router.current.subscribe((route) => {
  if (route === null) {
    renderNotFound()
    return
  }
  render(route.leaf.component, { params: route.params })
})
```

### defaults entry point

The `defaults` entry point pre-wires `scrollRestore` so you do not have to pass it manually:

```ts
import { createRouter } from '@rhi-zone/rainbow-router/defaults'

const router = createRouter(routes)  // scrollRestore is the default
```

## Scroll handlers

Scroll behavior is controlled by a `ScrollHandler` — a function that receives a `ScrollNav` and decides what to do. Pass it as `options.scroll` to `createRouter`.

Four built-in handlers are exported from `@rhi-zone/rainbow-router/scroll`:

| Export | Behavior |
|---|---|
| `scrollRestore` | Save scroll position on push/replace; restore it on pop. Default in `defaults`. |
| `scrollTop` | Scroll to the top of the page on every navigation. |
| `scrollNone` | No-op — do not scroll at all. |
| `scrollToHash` | Scroll to the element with `id` matching the URL hash. |

```ts
import { scrollTop } from '@rhi-zone/rainbow-router/scroll'

const router = createRouter(routes, { scroll: scrollTop })
```

You can write a custom handler:

```ts
import type { ScrollHandler } from '@rhi-zone/rainbow-router'

const myScroll: ScrollHandler = (nav) => {
  if (nav.type === 'pop') {
    // restore position from your own storage
  } else if (nav.hash) {
    document.getElementById(nav.hash)?.scrollIntoView({ behavior: 'smooth' })
  } else {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
}
```

## Mountable subtrees

`defineMountable` lets you define a reusable subtree whose routes are type-aware of a required param context. The type parameter declares which params are guaranteed to exist for all routes in that subtree.

```ts
import { defineMountable } from '@rhi-zone/rainbow-router'

const orgMountable = defineMountable<{ orgId: string }>()

const orgRoutes = orgMountable({
  '': { component: OrgDashboard },
  members: { component: OrgMembersPage },
  settings: { component: OrgSettingsPage },
})

const routes: RouteTree = {
  orgs: {
    _orgId: orgRoutes,
  },
}
```

`defineMountable` is a no-op at runtime — it only applies a TypeScript type brand so that code within the subtree can safely access the declared params.

## Loader model

Each `RouteConfig` accepts an optional `loader` function. The router automatically manages the `loaderState` signal:

1. On navigation to a route with a loader, `loaderState` is set to `loading`.
2. If the user navigates away before the loader resolves, the `AbortSignal` is aborted and the result is discarded.
3. On successful resolution, `loaderState` becomes `success(value)`.
4. On rejection, `loaderState` becomes `failure(error)`.
5. On navigation to a route without a loader, `loaderState` resets to `notAsked`.

```ts
const routes: RouteTree = {
  posts: {
    _id: {
      '': {
        component: PostPage,
        loader: async ({ params, signal }) => {
          const res = await fetch(`/api/posts/${params.id}`, { signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        },
      },
    },
  },
}

const router = createRouter(routes)

router.loaderState.subscribe((state) => {
  switch (state.status) {
    case 'loading':  showSpinner(); break
    case 'success':  renderPost(state.value); break
    case 'failure':  renderError(state.error); break
    case 'notAsked': break
  }
})
```

The `AsyncData` type is exported from `@rhi-zone/rainbow`. See the [core API reference](/api/) for its constructors and combinators (`map`, `chain`, `fold`, `getOrElse`).
