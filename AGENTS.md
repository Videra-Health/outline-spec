# outline-spec: agent notes

- TypeScript CLI, built with `pnpm build` into `dist/`; the entry point is `bin/outline-spec.js`.
- Checks: `pnpm build && pnpm exec tsc --noEmit && pnpm lint && pnpm test`. Tests run against `dist/`, so build first.
- The outline format lives in `src/core/outline/`; the `pending`, `relabel`, `migrate-specs`, and `adopt` commands are in `src/commands/`, and `archive` is in `src/core/archive.ts`. [docs/outlines.md](docs/outlines.md) describes the format.
- Workflow skills are generated from `src/core/templates/workflows/`. After editing one, run `pnpm generate:skills` and `pnpm regen:parity-hashes`.
- This repo's own specs are in `outline-spec/specs/`. Plan larger changes as `outline-spec/changes/<name>/`.
- Keep `docs/` accurate: every command and flag documented must exist (`outline-spec <command> --help`).
- Test guidance for `test/` is in [test/AGENTS.md](test/AGENTS.md).
