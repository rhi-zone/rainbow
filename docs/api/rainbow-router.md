# API Reference: @rhi-zone/rainbow-router

## Main entry point

Import from `@rhi-zone/rainbow-router`.

### Types

#### `ParamParser<T>`

The router's only contract for param validation.

Signature: `(raw: string) => T | null`

Return `null` to signal no match (results in a 404).

#### `ScrollNav`

Navigation metadata passed to a `ScrollHandler`.

| Field | Type | Description |
|---|---|---|
| `type` | `'push' | 'pop' | 'replace'` | The History API operation. |
| `hash` | `string | null` | URL fragment without `#`, or `null` if absent. |
| `from` | `string` | The pathname navigated from. |
| `to` | `string` | The pathname navigated to. |

#### `ScrollHandler`

Signature: `(nav: ScrollNav) => void`

A function called after every navigation to control scroll behavior. See built-in handlers in `@rhi-zone/rainbow-router/scroll`.

#### `LoaderCtx<P>`

Context passed to a route loader function.

| Field | Type | Description |
|---|---|---|
| `params` | `P` | Validated and parsed route params. |
| `signal` | `AbortSignal` | Aborted if the user navigates away before the loader resolves. |

#### `LoaderFn<P, T>`

Signature: `(ctx: LoaderCtx<P>) => Promise<T>`

An async data loader for a route.

#### `RouteConfig`

Metadata attached to a route at a given path depth.

| Field | Type | Description |
|---|---|---|
| `component` | `unknown` | The component or view to render (framework-agnostic). |
| `loader` | `LoaderFn | undefined` | Optional async data loader. |
| `params` | `Record<string, ParamParser<unknown>> | undefined` | Param parsers for dynamic segments. |
| `scroll` | `ScrollHandler | undefined` | Per-route scroll behavior override. |

#### `RouteTree`

A trie node in the route tree.

- Plain string keys are **static** path segments.
- Keys starting with `_` are **dynamic** segments (e.g. `_id`).
- The `''` key (empty string) is the handler at the exact depth of that node.

#### `MatchedRoute`

The result of a successful route match.

| Field | Type | Description |
|---|---|---|
| `layouts` | `RouteConfig[]` | Intermediate layout configs from outermost to innermost. |
| `leaf` | `RouteConfig` | The innermost matched config. |
| `params` | `Record<string, unknown>` | Validated and parsed params from all dynamic segments. |
| `pathname` | `string` | The full matched pathname. |

#### `LoaderState<T>`

Type alias: `AsyncData<T, unknown>` (from `@rhi-zone/rainbow`).
Represents the active loader's async state.

#### `RouterOptions`

| Field | Type | Description |
|---|---|---|
| `scroll` | `ScrollHandler | undefined` | Global scroll behavior handler. Defaults to `scrollRestore` when using the `defaults` entry point. |

#### `Router`

A running router instance returned by `createRouter`.

| Member | Type | Description |
|---|---|---|
| `current` | `ReadonlySignal<MatchedRoute | null>` | The currently matched route, or `null` if unmatched. |
| `loaderState` | `ReadonlySignal<AsyncData<unknown>>` | The loader's async state for the active route. |
| `navigate(path)` | `void` | Push a new history entry and navigate. |
| `replace(path)` | `void` | Replace the current history entry and navigate. |
| `back()` | `void` | Equivalent to `history.back()`. |
| `forward()` | `void` | Equivalent to `history.forward()`. |
| `destroy()` | `void` | Remove event listeners and abort in-flight loaders. |

### Functions

#### `createRouter(tree, options?)`

Create a router bound to `window.location` and the History API.

| Parameter | Type | Description |
|---|---|---|
| `tree` | `RouteTree` | The route tree to match against. |
| `options` | `RouterOptions | undefined` | Optional scroll handler and settings. |

Returns a `Router` instance.

#### `match(tree, pathname)`

Match a pathname against a route tree directly, without creating a full router instance.

| Parameter | Type | Description |
|---|---|---|
| `tree` | `RouteTree` | The route tree. |
| `pathname` | `string` | The URL pathname to match (e.g. `/posts/42`). |

Returns `MatchedRoute | null`.

#### `defineMountable<Context>()`

Create a factory function that brands a `RouteTree` with a `Context` type.

The type parameter `Context` declares which params are guaranteed to exist in all routes within the subtree. The factory is a no-op at runtime.

Returns a `MountableFactory<Context>`.

### Types: `Mountable` and `MountableFactory`

| Type | Description |
|---|---|
| `Mountable<Context>` | A `RouteTree` branded with a phantom `Context` type. Never has runtime impact. |
| `MountableFactory<Context>` | A function `<Tree extends RouteTree>(tree: Tree) => Tree & Mountable<Context>`. |

## Scroll entry point

Import from `@rhi-zone/rainbow-router/scroll`.

| Export | Type | Description |
|---|---|---|
| `scrollRestore` | `ScrollHandler` | Save/restore scroll position. Saves coordinates to `history.state` on push/replace; restores on pop. |
| `scrollTop` | `ScrollHandler` | Scroll to top of page on every navigation. |
| `scrollNone` | `ScrollHandler` | No-op. Do not scroll at all. |
| `scrollToHash` | `ScrollHandler` | Scroll to the element matching the URL hash, if present. |

## defaults entry point

Import from `@rhi-zone/rainbow-router/defaults`.

Re-exports `createRouter` pre-wired with `scrollRestore` as the default scroll handler. Accepts the same `RouterOptions` as the main `createRouter`, with `scroll` defaulting to `scrollRestore` if omitted.

#### `createRouter(tree, options?)` (defaults)

Identical signature to the main `createRouter`, but `options.scroll` defaults to `scrollRestore` instead of `undefined`.

## Standard Schema adapter

Import from `@rhi-zone/rainbow-router/adapters/standard-schema`.

#### `fromSchema<T>(schema)`

Adapt a Standard Schema `v1` validator to a `ParamParser<T>`.

| Parameter | Type | Description |
|---|---|---|
| `schema` | `StandardSchemaV1<string, T>` | A Standard Schema validator. |

Returns `ParamParser<T>`.

> **Note:** Async schemas are not supported. If the schema's `validate` returns a `Promise`, `fromSchema` returns `null` (no match).
