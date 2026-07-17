# rainbow/router — Design Doc

## Philosophy

URL is state. Routing is a lens over that state. Navigation is an effect.

No codegen. No build plugins. No opinions about file structure. TypeScript
inference from the route tree structure, not string patterns.

---

## Prior art — Lua trie router

```lua
mod.router = function(routes)
  return function(req, res, sock)
    local route = routes
    local end_ = 0
    repeat
      local start, end__, part = req.path:find("/([^/]*)", end_ + 1)
      local new_route = route[part] or route[1]  -- [1] = dynamic slot
      if not new_route then return end
      route = new_route
      if type(route) == "function" then
        route(req, res, sock); return
      end
    until end__ == #req.path
    if type(route[""]) == "function" then route[""](req, res, sock) end
  end
end
```

Key ideas to carry forward:
- Route tree is **nested data**, not a flat list of path strings
- Traversal is segment-by-segment — no regex, no backtracking
- `[1]` / dynamic slot = wildcard, captured positionally
- `""` key = handler at this exact depth

---

## TanStack Router teardown

### Keep

| Feature | Why | Our version |
|---|---|---|
| Type-safe route definitions | Prevents broken navs at compile time | Param types inferred by traversing the route tree object |
| Nested / layout routes | Essential for any multi-page app | Outlet as a signal-driven slot |
| Async loaders | Data should load before render | Async function on route node, result is `AsyncData<T>` signal |
| Param validation | Corrupt params should 404, not crash | `ParamParser` adapter on route node — fails match, not use-site |
| Error + pending states | Non-negotiable UX | `AsyncData<T>` = `Loading \| Failure \| Success<T>` |
| Active link state | `aria-current` etc | `computed(() => isPrefixMatch(location, href))` |
| Search params as state | Filters, pagination live in URL | Lens: `Signal<URLSearchParams>` → typed `Signal<T>` |

### Drop

| Feature | Why |
|---|---|
| File-based routing + Vite plugin | Codegen complexity for zero runtime benefit |
| Built-in SWR cache | Composable via rainbow signals, not baked in |
| `loaderDeps` tracking | Loaders read signals — reactivity handles re-runs naturally |
| Custom search param serialization | JSON at the boundary is enough |
| Route masking | Modal state belongs in app state, not the router |
| SSR | SPA. Not our problem. |
| Prefetching | Add later if needed |

---

## Param parsing — adapter model

The router's only internal contract for a param:

```ts
type ParamParser<T> = (raw: string) => T | null  // null = no match → 404
```

Adapters bridge from external interfaces to this contract. The router core has
zero validation dependencies.

```ts
// rainbow-router/adapters/standard-schema.ts
// only dep: @standard-schema/spec (types only, no runtime)
import type { StandardSchemaV1 } from '@standard-schema/spec';

export const fromSchema = <T>(schema: StandardSchemaV1<string, T>): ParamParser<T> =>
  (raw) => {
    const result = schema['~standard'].validate(raw);
    if ('issues' in result) return null;
    return result.value;
  };
```

Plain functions work without any adapter:

```ts
_page: { params: { page: (s) => parseInt(s, 10) || null } }
```

This means `params` in a route node is `Record<string, ParamParser<unknown>>`.
The adapter you import determines your validation library. Someone could write
a Zod adapter, an ArkType adapter, a regex adapter — the router doesn't care.

Same principle applies to search params: `searchParam(key, parser)` where
`parser` is a `ParamParser<T>`.

---

## Route tree

Dynamic segments use `_name` keys — `_` prefix signals "capture this segment
as param named `name`". TypeScript traverses the object keys to accumulate
params, no string parsing required.

```ts
import { fromSchema } from 'rainbow-router/adapters/standard-schema';

const routes = {
  '':       Home,
  admin: {
    '':       AdminShell,
    students: {
      '':     { component: StudentList,   loader: loadStudents },
      _id: {
        params: { id: fromSchema(v.pipe(v.string(), v.uuid())) },
        '':   { component: StudentDetail, loader: loadStudent },
        lessons: LessonList,
      }
    }
  },
  portal: {
    '':       PortalShell,
    lessons:  { component: LessonList, loader: loadLessons },
  }
}
```

Matching algorithm (mirrors the Lua):
1. Split pathname into segments
2. Walk the tree segment by segment
3. At each node: try exact key first, then `_*` key (dynamic slot)
4. Run `ParamParser` for the captured segment — `null` = no match → 404
5. At final segment: look up `""` key for the handler
6. Parent nodes with `""` handlers wrap children as layouts

---

## Type inference

Params accumulate as the type system traverses the tree:

```ts
type Params<T> =
  T extends string ? Record<never, never>
  : { [K in keyof T & string]:
      K extends `_${infer Name}`
        ? Record<Name, string> & Params<T[K]>
        : Params<T[K]>
    }[keyof T & string]

// Params<typeof routes> at path admin/students/_id =>
// { id: string }
```

`navigate()` and loaders receive correctly typed params with no generation step.

---

## Core model

```
Signal<URL>                           — source of truth, updated on popstate + navigate()
  └─ computed matchedRoute            — Signal<MatchedRoute | null>
       └─ computed params             — Signal<Record<string, string>> (validated)
       └─ computed loaderState        — Signal<AsyncData<T>>
  └─ computed searchParams            — Signal<URLSearchParams>
       └─ searchParam(key, parser)    — Signal<T>, bidirectional, ParamParser on read+write
```

---

## Search params

Parser lives on the definition, not scattered at use-sites:

```ts
const page   = searchParam('page',   (s) => parseInt(s ?? '1', 10));
const filter = searchParam('filter', (s) => s ?? null);
// Signal<number>, Signal<string | null>
// setting the signal writes back to the URL
```

With Standard Schema adapter:

```ts
const page = searchParam('page', fromSchema(v.pipe(v.string(), v.transform(Number))));
```

---

## Loader model

```ts
_id: {
  params: { id: fromSchema(v.pipe(v.string(), v.uuid())) },
  loader: async ({ params, signal }) => {
    // params.id is string, already uuid-validated
    const res = await fetch(`/api/students/${params.id}`, { signal });
    return res.json() as Student;
  },
  component: StudentDetail,
}
```

`signal` = `AbortSignal`, cancelled on navigation away.
Result exposed as `Signal<AsyncData<Student>>`.

No built-in caching. SWR is composable on top with a time-based invalidation
signal — the router doesn't own that concern.

---

## Lit integration

`ReactiveController` bridges rainbow signals to Lit's update cycle:

```ts
class RouteController<T> implements ReactiveController {
  params!: Record<string, string>;
  data!:   AsyncData<T>;

  constructor(host: ReactiveControllerHost, router: Router<T>) {
    host.addController(this);
    router.params.subscribe(v    => { this.params = v; host.requestUpdate(); });
    router.loaderState.subscribe(v => { this.data = v; host.requestUpdate(); });
  }
}
```

Link directive intercepts clicks and calls `navigate()`, sets `aria-current`:

```ts
html`<a href="/admin/students" ${link(router)}>Students</a>`
```

---

## What this forces rainbow to have

- `Signal<T>` — `get`, `set`, `subscribe`
- `computed(fn)` — derived signals
- **`AsyncData<T>`** — `Loading | Failure | Success<T>`, first-class type
- Lens / bidirectional signal (search params write back to URL)
- Effect primitive (navigate has side effects beyond state mutation)

`AsyncData<T>` is the most interesting forcing function. It's not
router-specific — any async operation in the app wants this type. The router
is just the first consumer.

---

## Open questions

- `navigate()`: standalone function or signal write? (lean: function — too many
  side effects for a pure signal write)
- Parent loader + child loader: do they race or does parent block child render?
  (lean: race, child shows its own loading state)
- Scroll restoration: configurable, sensible defaults (see below)
- `<base href>` / sub-path deploys: defer until needed

---

## Scroll restoration

Router sets `history.scrollRestoration = 'manual'` and owns the behaviour.

No magic strings. Scroll handlers are named exported functions — importable,
composable, tree-shakeable. A custom function is the same type, no special
casing in router internals.

```ts
// rainbow-router/scroll.ts — each export is independently tree-shakeable
export const scrollRestore: ScrollHandler = ({ type, hash }) => { … }
export const scrollTop:     ScrollHandler = () => window.scrollTo(0, 0);
export const scrollNone:    ScrollHandler = () => {};
export const scrollToHash:  ScrollHandler = ({ hash }) =>
  hash ? document.getElementById(hash)?.scrollIntoView() : undefined;
```

```ts
// bare — no scroll code bundled unless you import it
import { createRouter } from 'rainbow-router';
createRouter({ routes, scroll: scrollRestore });

// batteries included — scrollRestore wired in, no config needed
import { createRouter } from 'rainbow-router/defaults';
createRouter({ routes });
```

`rainbow-router/defaults` is a thin wrapper:

```ts
import { createRouter as _createRouter } from 'rainbow-router';
import { scrollRestore } from 'rainbow-router/scroll';

export const createRouter = (config) =>
  _createRouter({ scroll: scrollRestore, ...config });
```

Zero scroll code enters the bundle unless you import from `rainbow-router/scroll`
or `rainbow-router/defaults`. The pattern extends — `defaults` can grow to
include whatever the opinionated preset is without bloating the core.

Per-route override:

```ts
students: {
  '': { component: StudentList, loader: loadStudents, scroll: scrollNone },
}
```

Custom handler — same type, compose freely:

```ts
import { scrollToHash, scrollTop } from 'rainbow-router/scroll';

const myScroll: ScrollHandler = (nav) =>
  nav.hash ? scrollToHash(nav) : scrollTop(nav);
```

`ScrollHandler` type:

```ts
type ScrollHandler = (nav: {
  type: 'push' | 'pop' | 'replace';
  hash: string | null;
  from: string;
  to:   string;
}) => void;
```

**Default** is `scrollRestore` — top on push/replace, restore on pop, hash
scrolling handled. Ships with the router, zero config needed.

---

## Mounting

Splice a standalone subtree into the trie at a given node. Runtime is trivial —
params keep accumulating during traversal. The challenge is type safety across
the boundary.

**`defineMountable` + `Mountable<Context>` phantom type:**

```ts
// rainbow-router/index.ts
export type Mountable<Context extends Record<string, string>> =
  RouteTree & { readonly '~context': Context };  // phantom — never exists at runtime

// named alias for the intermediate curried result — needed for JS JSDoc usage
export type MountableFactory<Context extends Record<string, string>> =
  <Tree extends RouteTree>(tree: Tree) => Tree & Mountable<Context>;

// curried: first call fixes Context, second infers Tree
// works around TypeScript's lack of partial generic inference
export const defineMountable =
  <Context extends Record<string, string>>(): MountableFactory<Context> =>
  (tree) => tree as typeof tree & Mountable<Context>;  // identity function
```

| User | Approach |
|---|---|
| TS | `defineMountable<Context>()({...})` — inline, fully inferred |
| JS | `@type {MountableFactory<Context>}` on the intermediate, then call it |
| TS, okay annotating params manually | `{...} satisfies Mountable<Context>` |

TypeScript — inline, params inferred:
```ts
const studentRoutes = defineMountable<{ tenantId: string }>()({
  _id: { loader: ({ params }) => fetchStudent(params.id) }
  //                   params: { tenantId: string, id: string } ✓
});
```

JS — annotate the intermediate curried result, Context flows in:
```js
/** @type {import('rainbow-router').MountableFactory<{ tenantId: string }>} */
const defineStudentRoutes = defineMountable();

const studentRoutes = defineStudentRoutes({
  _id: { loader: ({ params }) => fetchStudent(params.id) }  // params inferred ✓
});
```

TS with `satisfies` — structure checked, params annotated manually:
```ts
const studentRoutes = {
  _id: { loader: ({ params }: { params: { tenantId: string; id: string } }) => … }
} satisfies Mountable<{ tenantId: string }>;
```

`mount()` checks that accumulated params at the call site satisfy the
subtree's `Context` — TypeScript error if mounted somewhere that doesn't
provide the required params:

```ts
const routes = defineRoutes({
  _tenantId: {
    students: mount(studentRoutes),  // ✓ tenantId in scope
  },
  other: {
    students: mount(studentRoutes),  // ✗ TypeScript error: tenantId not provided
  }
});
```

No runtime validation at the mount boundary — the parent trie already
validated `tenantId` at the `_tenantId` node during traversal.
