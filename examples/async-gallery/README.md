# Async Gallery

Async image gallery built with rainbow and rainbow-ui.

## What it demonstrates

Async data loading patterns with rainbow signals and rainbow-ui widgets —
`fromAsync`, `fold`, `template`, `stateful`, `show`, `eachKeyed`, and `on`,
combined into a paginated, searchable, keyed image grid with a lightbox.

## Dependencies

- `@rhi-zone/rainbow` (workspace)
- `@rhi-zone/rainbow-ui` (workspace)

## Run it

From the repo root:

```sh
bun install
```

There is no dedicated dev-server config for this example yet; see the source
file below to run or adapt it.

## Source

- `src/app.ts` — pagination state, fake fetch layer, image card/lightbox
  widgets, and bootstrap
