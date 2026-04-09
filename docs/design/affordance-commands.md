# Affordance & Commands Design

Design notes from session April 2026. Captures ideas for `@rhi-zone/rainbow-commands` and the keybinds library integration.

---

## Core insight: affordances are not commands

The word "affordance" is often conflated with "command" (labeled, executable, keyboard-shortcuttable). But affordances span a wider spectrum:

- **Commands** — labeled, executable, palette-searchable
- **Gestural** — drag handles, resize edges, reorder handles
- **Ambient** — hover tooltips, status indicators, focus rings
- **Navigational** — tabs, breadcrumbs, back buttons, focus regions
- **Directional** — swipe, scroll, pan (continuous, not discrete)
- **Data-entry** — inputs, sliders, pickers (two-way bindings)

A command palette is one rendering of one slice of the interaction graph — the commands subset. The full affordance graph is richer.

**Open question**: does `@rhi-zone/rainbow-commands` model the full spectrum from day one, or start with commands as the tractable subset? Starting with commands is simpler; the type system can be extended later if affordance type is a discriminated field.

---

## `@rhi-zone/rainbow-commands` — proposed design

### Command type

```ts
type Command<S> = {
  id: string
  label: string
  shortcut?: string
  icon?: string
  available: (s: S) => boolean   // is this command available in state S?
  execute: (s: S) => S | Promise<S>  // transition
}
```

`execute` returns `S | Promise<S>`. Async transitions set `AsyncData` loading state externally — the Command type stays pure. `fromAsyncImperative` bridges this to loading UI.

### AffordanceScope / context stack

Commands register at a scope. Active scopes form a stack; entering a modal pushes a new scope, dismissing pops it. The active command set is:

```ts
stack.flatMap(scope => scope.commands).filter(c => c.available(state))
```

Priority/shadowing follows stack order — modal commands take precedence over page commands with the same `id`.

```ts
type AffordanceScope<S> = {
  commands: Command<S>[]
  push: (commands: Command<S>[]) => () => void  // returns pop
}

function createCommandScope<S>(state: Signal<S>): AffordanceScope<S>
```

**Open question**: how does the context stack compose across page/component/modal boundaries? Options:
- React-style context (passed via widget tree)
- Global singleton per app (simpler, less flexible)
- Explicit scope nesting via `push`/`pop` (current leaning)

### Scoring — always an adapter

The scorer is injectable, never baked in. Commands are sorted by score; ties preserve declaration order.

```ts
type Scorer<S> = (command: Command<S>, state: S) => number
```

**Default scorer** (specificity + frecency):
- Base score: 1 for all available commands
- Specificity bonus: +1 if `available` condition is narrow (heuristic: commands that are rarely available score higher when they ARE available). Difficult to measure automatically — may require explicit `priority?: number` field as a simpler proxy.
- Frecency: +3 if executed in last 60s, +2 in last 5min, +1 in last 30min

**Context specificity scoring** (best idea from session): a command whose `available` predicate returns true only in narrow circumstances is more relevant RIGHT NOW than one that's always available. If we track how often `available` returns true over time, rarer commands score higher. This is elegant but requires runtime observation — may be too complex for v1.

Simpler v1: explicit `priority?: number` field on Command, default 0. Frecency is layered on top.

---

## Keybinds library integration with rainbow

The `keybinds` library (separate repo, `Documents/GitHub/keybinds`) solves the keyboard/mouse binding layer. It has:
- `Command` type with `when: (ctx) => boolean`
- `filterByMenu`, `searchCommands`, `groupByCategory`
- Web components: `CommandPalette`, `ContextMenu`, `KeybindCheatsheet`, `ContextMenu`, `KeybindSettings`
- `BindingsStore` (EventTarget, localStorage-persisted overrides)

**Integration path**: wrap `getContext()` in a derived signal so command availability is reactive:

```ts
// Current keybinds pattern:
keybinds(commands, () => getContext())

// Rainbow-integrated:
const context = state.map(s => buildContext(s))
keybinds(commands, () => context.get())
// When state changes → context changes → re-evaluate available commands
```

The `BindingsStore` change events can drive signal updates, making user-customized bindings reactive too.

---

## Keybinds library — planned improvements

Work tracked separately but noting here for context:

### Done (agent running April 2026)
- `BasicContextMenu` / `ContextMenu` split
- Scoring adapter system + `defaultScorer` (specificity + frecency)
- `ContextMenu`: 7-item default with embedded search (shifts which 7 are visible, never grows list), hover-reveal "N more" at bottom

### Remaining
- `RadialMenu` component with **bilateral text layout**:
  ```
       AAAA    BBBB
    CCCC          DDDD
    EEEE          FFFF
       GGGG    HHHH
  ```
  Labels readable, 8 segments, direction becomes muscle memory for repeated use. Opt-in — not a default. Best for spatial/gestural affordances where direction carries meaning (canvas tools, game radials).

- Rainbow integration: reactive `getContext()` wrapper (see above)

### Philosophy: sneaky Miller's Law enforcement
The ContextMenu component enforces 7-item default not as a hard limit but as the *out-of-the-box experience*. Consumers who don't think about it get Miller's Law compliance for free. Opting out (raising `maxVisible`) requires a deliberate decision. Bad UX requires conscious effort; good UX is the default.

---

## Miller's Law — key constraint

Humans hold 7±2 items in working memory simultaneously (Miller's Law). This is a hard cognitive limit, not a design guideline. Any affordance surface showing >7 items becomes a *searching* surface, not a *scanning* surface.

**The gain from context-aware affordance filtering is removal, not prioritization.** Demoting irrelevant commands doesn't help — they still occupy working memory slots. Absence is the only solution.

The ribbon (MS Office) violated this: ~40-50 commands per tab, all visible simultaneously. 5-6× over the limit. The search box ("Tell me what you want to do", added 2016) is the admission that the ribbon failed.

Context menus are vertical ribbons. Same failure mode, same fix: genuine contextual filtering to ~7.

---

## Rhi-zone docs status

Written and pushed (April 2026):
- `docs/affordance-types.md` — full affordance taxonomy
- `docs/affordance-surfaces.md` — ribbon analysis, Miller's Law, filtering vs removal, spatial semantics
- `docs/interaction-graph.md` — added: affordances-are-not-commands, Miller's Law as hard constraint

Still to write:
- `affordance-surfaces.md` — add Fitts's Law + radial menus section
- Design page for rainbow-commands once the package has a concrete design
- `interaction-graph.md` — "what does the user most likely want to do next" deserves its own developed section
