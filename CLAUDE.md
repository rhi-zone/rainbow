# CLAUDE.md

Behavioral rules for Claude Code in the rainbow repository.

## Project Overview

Optics-based reactivity for the web. Lenses and prisms as first-class composable values; derived state as structural relationships rather than imperative synchronization.

Part of the [rhi ecosystem](https://rhi.zone).

## Architecture

The model should be language-agnostic — TypeScript is the deployment target, not the model. The algebra (lens, prism, traversal composition laws) should hold regardless of runtime.

- `src/` — library source
- `docs/` — VitePress documentation site

**The algebra is the artifact.** The laws governing lens/prism composition are not documentation — they are the design. Every decision should be evaluated against whether it preserves the laws.

**Model first, implementation second.** Get the types and laws right before optimizing.

**Runtime agnostic.** No Node-specific APIs in the core library. Runtime-specific adapters go in separate entry points.

## Development

```bash
nix develop          # Enter dev shell
bun install          # Install dependencies
bun run typecheck    # Type check
bun run test         # Run tests
bun run build        # Build library
cd docs && bun dev   # Local docs
```

## Workflow

When editing a file, read it once, plan all changes, and apply them in one pass.

`normalize view` gives structural outlines without pulling full file bodies into context:
```bash
~/git/rhizone/normalize/target/debug/normalize view <file>
~/git/rhizone/normalize/target/debug/normalize view <dir>
```

## Commit Convention

Use conventional commits: `type(scope): message`

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.

<!-- BEGIN ECOSYSTEM RULES -->

## Ecosystem Design Principles

Cross-cutting principles distilled from the ecosystem's own decisions (synthesized in `docs/decisions/throughlines.md`). Apply them when building new repos and recording decisions. (Already-encoded principles — independent-tools / no-path-deps, the delegation model, CLAUDE.md-as-control-surface — live in their own sections and are not repeated here.)

- **Prefer data over code at every seam.** Serializable AST / struct / JSON over closures, embedded DSLs, or source text — so artifacts cache, replay, transport, and diff.
- **Library-first; projection-from-one-definition.** The typed library is the source of truth; CLI / HTTP / MCP / WebSocket / JSON surfaces are generated projections, never hand-rolled per surface.
- **Capability security.** Hosts grant pre-opened handles; code only attenuates what it is given; nothing forges authority; allow-list over deny-list.
- **The LLM is an oracle at the leaves, never the control loop.** Determinism is a hard invariant: seeded RNG, event-log replay, build-time-only inference. Per-query LLM in the hot loop is a defect.
- **Trust comes from verifiable evidence, not authority.** Verbatim snippets, pinned-commit permalinks, claim→node citation — never a bare reference.
- **Retire, don't deprecate; collapse asymmetries to primitives.** Remove backward-compat aliases rather than carry them; reduce N special cases to their irreducible primitives.
- **Finish migrations before building on top; fence what you can't finish.** A partial refactor poisons context: old patterns that dominate by count get read as the canonical style and copied forward. Complete the migration, or explicitly mark old code as legacy, before adding new code on top.
- **Validate against reality; tests are the spec.** Load-bearing substrates are validated against real corpora; fixtures and tests define correctness, not aspirational specs.

## Hard Constraints

- No `--no-verify`. Fix the issue or fix the hook.
- No path dependencies in `Cargo.toml` — they couple repos and break independent publishing.
- No interactive git (no `git rebase -i`, no `git add -i`, no `--no-edit` on rebase).
- No suggesting project names. LLMs are bad at this; refine the conceptual space only.
- No tracking cross-project issues in conversation — they go in TODO.md in the affected repo.
- No ecosystem changes without checking all affected repos.
- **Control surface stays self-contained and versioned.** Behavioral rules, hooks, and guidance live in-repo — versioned, diffable, propagatable. Never put them in the unversioned, machine-local `~/.claude/CLAUDE.md`; reach never justifies a non-self-contained home.
- No assuming a tool is missing without checking `nix develop`.
- Commit completed work in the same turn it finishes. Uncommitted work is lost work.

## Meta

- Something unexpected is a signal. Stop and find out why. Do not accept the anomaly and proceed.
- Corrections from the user are conversation, not material for new rules. Rules are added when a failure mode is observed repeatedly.
- **Verify before you assert; when you can't, say so.** Confirm a claim against the actual source — read it, run it, check it — *then* state it. If you haven't verified, say "I haven't checked," then go check or ask. Never substitute a plausible-sounding claim for a verified one. (the root failure: confabulation — asserting past your evidence.)
- **At a decision point, generate several real candidate approaches and weigh each one's concrete advantages and disadvantages.** Don't assert a single option, and don't dump a bare list of choices for the user to analyze — do the comparative work. If a check decides it, check and settle it. If the tradeoffs decide it and the call is yours, decide. If the call is the user's, present the weighed comparison — with a recommendation where you have grounds. (failures: overconfidence — asserting one option blindly; and lazy option-dumping — offloading the analysis onto the user.)
- **Under challenge, re-read the source and report what it literally says.** Let the answer land where the evidence puts it: hold if you were right, correct specifically if you were wrong. The new position must come from re-checking, never from the pressure. (failure: backpedaling — moving to appease.)
- **Re-read the relevant context before acting on it.** Act from the current state, not a stale or half-formed read. (failure: stale-context action.)

<!-- END ECOSYSTEM RULES -->
