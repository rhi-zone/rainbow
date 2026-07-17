# Rainbow

[![npm version](https://img.shields.io/npm/v/@rhi-zone/rainbow.svg)](https://www.npmjs.com/package/@rhi-zone/rainbow)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Optics-based reactivity for the web.

Part of the [rhi ecosystem](https://rhi.zone).

## Motivation

Most UI state management frameworks give you primitives but no algebra. Derived state requires explicit synchronization; relationships between state are imperative rather than structural. Rainbow takes a different approach: optics are first-class composable values, and the reactivity system is grounded in laws you can reason about.

The design is grounded in [Unicorn](https://github.com/art-w/unicorn), an OCaml UI library that proves the same model with 7 combinators. Rainbow is that insight in TypeScript, with signals as the execution layer.

## Quick example

```ts
import { signal, field, computed, stateful, fst, snd } from '@rhi-zone/rainbow'

type Todo = { id: number; text: string; done: boolean }
type State = { todos: Todo[]; draft: string }

const state = signal<State>({ todos: [], draft: '' })
const todos = state.focus(field('todos'))
const draft = state.focus(field('draft'))

const activeCount = computed(
  () => todos.get().filter(t => !t.done).length,
  [todos],
)
```

## Packages

| Package | Description | npm |
| --- | --- | --- |
| [`@rhi-zone/rainbow`](./packages/core) | Signals, lenses, prisms, traversals, computed, cond, product — the core primitives | [![npm](https://img.shields.io/npm/v/@rhi-zone/rainbow.svg)](https://www.npmjs.com/package/@rhi-zone/rainbow) |
| [`@rhi-zone/rainbow-router`](./packages/router) | Trie-based SPA router, signal-native | [![npm](https://img.shields.io/npm/v/@rhi-zone/rainbow-router.svg)](https://www.npmjs.com/package/@rhi-zone/rainbow-router) |
| [`@rhi-zone/rainbow-ui`](./packages/ui) | Type-safe DOM factories and algebraic widget combinators | [![npm](https://img.shields.io/npm/v/@rhi-zone/rainbow-ui.svg)](https://www.npmjs.com/package/@rhi-zone/rainbow-ui) |
| [`@rhi-zone/rainbow-url`](./packages/url) | Reactive URL combinators, two-way Signal sync with location | [![npm](https://img.shields.io/npm/v/@rhi-zone/rainbow-url.svg)](https://www.npmjs.com/package/@rhi-zone/rainbow-url) |

## Examples

- [`examples/todomvc`](./examples/todomvc) — TodoMVC with Vue, using rainbow signals for state
- [`examples/contacts`](./examples/contacts) — Contact manager using rainbow + rainbow-ui
- [`examples/async-gallery`](./examples/async-gallery) — Async image gallery using rainbow + rainbow-ui

## Development

```bash
nix develop          # Enter dev shell
bun install          # Install dependencies
bun run typecheck    # Type check
bun run test         # Run tests
bun run build        # Build library
cd docs && bun dev   # Local docs
```

## Contributing

Fork the repo, create a branch, and open a pull request. Commit messages follow [conventional commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `refactor`, `docs`, `chore`, `test`).

## License

MIT
