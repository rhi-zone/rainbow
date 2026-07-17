# @rhi-zone/rainbow-router

A trie-based SPA router for TypeScript. Signal-native, no codegen, no file-system conventions.

## What it is

rainbow-router treats the URL as state and routing as a lens. There is no magic file discovery, no compiler plugin, no generated types. You define a plain route tree object, hand it to `createRouter`, and get back a `Router` with a `current` signal that updates on every navigation.

Key properties:

- **Trie matching** — `O(depth)` per navigation, exact segments take priority over dynamic ones.
- **Dynamic segments** — keys starting with `_` (e.g. `_id`) capture URL segments; validated by `ParamParser` functions.
- **Loaders** — async data fetching per route, with automatic `AbortSignal` cancellation on navigation.
- **Scroll handlers** — composable, swappable: `scrollRestore`, `scrollTop`, `scrollNone`, `scrollToHash`.
- **Mountable subtrees** — type-branded subtrees for composable sub-routers.
- **No framework dependency** — works with any UI library or vanilla JS.

## Install

```sh
npm install @rhi-zone/rainbow-router
```

## Quick example

```ts
import { createRouter } from '@rhi-zone/rainbow-router'
import { scrollRestore } from '@rhi-zone/rainbow-router/scroll'

const router = createRouter(
  {
    '': { component: HomePage },
    about: { component: AboutPage },
    posts: {
      '': { component: PostListPage },
      _id: {
        '': {
          component: PostPage,
          loader: async ({ params, signal }) => {
            const res = await fetch(`/api/posts/${params.id}`, { signal })
            return res.json()
          },
        },
      },
    },
  },
  { scroll: scrollRestore },
)

// Navigate programmatically
router.navigate('/posts/42')

// Subscribe to route changes
router.current.subscribe((route) => {
  if (route) console.log('matched', route.leaf.component, route.params)
})

// Clean up
router.destroy()
```

## Entry points

| Import | Contents |
|---|---|
| `@rhi-zone/rainbow-router` | `createRouter`, types, `match`, `defineMountable` |
| `@rhi-zone/rainbow-router/scroll` | `scrollRestore`, `scrollTop`, `scrollNone`, `scrollToHash` |
| `@rhi-zone/rainbow-router/defaults` | `createRouter` pre-wired with `scrollRestore` |
| `@rhi-zone/rainbow-router/adapters/standard-schema` | `fromSchema` — adapt Standard Schema validators to `ParamParser` |

## Docs

Full guide and API reference are at the [Rainbow VitePress site](https://rhi.zone/rainbow/).

## License

MIT
