# Contributing

Open an issue first for anything beyond a small fix, so we can agree on the approach before you build it.

## Setup

You need Node 20.19+ and pnpm.

```bash
pnpm install
pnpm build              # tests run against the build output
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

CI runs the same four checks.

## Changing behavior

This repo plans its own changes with outline-spec: specs live in `outline-spec/specs/`, and a larger change starts as `outline-spec/changes/<name>/` ([Workflows](docs/workflows.md)). Update `docs/` in the same change when behavior a user can see changes.

After editing a workflow template in `src/core/templates/`, run `pnpm build && pnpm generate:skills && pnpm regen:parity-hashes` and commit the regenerated `skills/` and hashes.

## Keep the CLI's startup fast

Each command loads only its definition and its own code:

- Definitions (name, options, help) go in `src/cli/index.ts` or `src/cli/commands/<name>.ts`, with no heavy imports.
- The implementation goes in `src/commands/<name>.ts` or `src/core/`, loaded inside the action with `await import()`.

`test/cli-e2e/startup-modules.test.ts` checks which modules each command loads. Add new commands to its list.

## Pull requests

Branch off `main`, link the issue, and say how you verified the change. If a coding agent wrote it, name the agent and model and confirm you tested the result.
