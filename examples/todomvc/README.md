# TodoMVC

Classic TodoMVC built with rainbow signals and Vue.

## What it demonstrates

rainbow's core state management — signals, lenses, and computed values —
integrated with Vue via the Vue adapter. All app state lives in plain rainbow
signals (`todos`, `filter`, derived `filteredTodos`/`activeCount`/`allDone`
via `computed`); Vue components consume that state through `signalToRef`
rather than owning their own reactive state.

## Dependencies

- `@rhi-zone/rainbow` (workspace)
- Vue

## Run it

From the repo root:

```sh
bun install
cd examples/todomvc && bunx vite
```

## Source

- `src/state.ts` — state, derived values, and actions (signals + lenses, no
  framework)
- `src/state.test.ts` — tests for the state module
- `src/App.vue`, `src/TodoItem.vue`, `src/main.ts` — Vue integration
