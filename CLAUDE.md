# CLAUDE.md

Behavioral rules for Claude Code in the rainbow repository.

## Project Overview

Optics-based reactivity for the web. Lenses and prisms as first-class composable values; derived state as structural relationships rather than imperative synchronization.

Part of the [rhi ecosystem](https://rhi.zone).

## Architecture

The model should be language-agnostic — TypeScript is the deployment target, not the model. The algebra (lens, prism, traversal composition laws) should hold regardless of runtime.

- `src/` — library source
- `docs/` — VitePress documentation site

## Development

```bash
nix develop          # Enter dev shell
bun install          # Install dependencies
bun run typecheck    # Type check
bun run test         # Run tests
bun run build        # Build library
cd docs && bun dev   # Local docs
```

## Core Rules

- **Note things down immediately:** problems, tech debt, or issues spotted MUST be added to TODO.md backlog
- **Do the work properly.** Don't leave workarounds or hacks undocumented.

## Design Principles

**The algebra is the artifact.** The laws governing lens/prism composition are not documentation — they are the design. Every decision should be evaluated against whether it preserves the laws.

**Model first, implementation second.** Get the types and laws right before optimizing.

**Runtime agnostic.** No Node-specific APIs in the core library. Runtime-specific adapters go in separate entry points.

## Session Handoff

Use plan mode as a handoff mechanism when:
- A task is fully complete (committed, pushed, docs updated)
- The session has drifted from its original purpose
- Context has accumulated enough that a fresh start would help

Before entering plan mode:
- Update TODO.md with any remaining work
- Update memory files with anything worth preserving across sessions

Then enter plan mode and write a plan file that either:
- Proposes the next task if it's clear: "next up: X — see TODO.md"
- Flags that direction is needed: "task complete / session drifted — see TODO.md"

ExitPlanMode hands control back to the user to approve, redirect, or stop.

## Commit Convention

Use conventional commits: `type(scope): message`

Types:
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `docs` - Documentation only
- `chore` - Maintenance (deps, CI, etc.)
- `test` - Adding or updating tests

## Negative Constraints

Do not:
- Announce actions ("I will now...") - just do them
- Leave work uncommitted
- Use `--no-verify` - fix the issue or fix the hook
- Assume tools are missing - check if `nix develop` is available
- Couple the core algebra to any specific runtime or framework
