# Contacts

Contact manager built with rainbow and rainbow-ui.

## What it demonstrates

rainbow-ui's widget combinators and DOM factories for building a UI without a
framework — `defineElement`, `fromAsync`, `stack` + binding helpers, `on`,
`narrow`/`tagged`, `show`, and `eachKeyed`.

The app also models its navigation state as an explicit state machine
(`src/machine.ts`): `idle`, `editing`, `saving`, `error`, with
`Signal<EditorState>` as the single source of truth and per-state widgets
rendered via `narrow`/`tagged`.

## Dependencies

- `@rhi-zone/rainbow` (workspace)
- `@rhi-zone/rainbow-ui` (workspace)

## Run it

From the repo root:

```sh
bun install
```

There is no dedicated dev-server config for this example yet; see the source
files below to run or adapt it.

## Source

- `src/state.ts` — contact data and derived state
- `src/machine.ts` — editor navigation state machine
- `src/app.ts` — widget rendering and bootstrap
