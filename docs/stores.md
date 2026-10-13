# Stores

A store is a standalone repo whose only job is planning: an `outline-spec/` folder with `specs/` and `changes/`, plus an identity file, `.outline-spec-store/store.yaml`. You register it on each machine by name, and any command that reads or writes specs and changes can act on it with `--store <id>`. Use one when planning spans several code repos, or should live outside the code.

A store is an ordinary git repo. outline-spec never clones, pulls, or pushes it; you commit and share it yourself. Stores are a beta feature and may still change shape.

## Set one up

```bash
outline-spec store setup team-plans --path ~/outline-spec/team-plans \
  --remote git@github.com:acme/team-plans.git
```

This creates the folder, writes the identity file, registers the store, and makes an initial commit (`--no-init-git` skips git). `--remote` records the clone URL so error messages can print a complete fix for teammates.

On every other machine, clone it and register it:

```bash
git clone git@github.com:acme/team-plans.git ~/outline-spec/team-plans
outline-spec store register ~/outline-spec/team-plans
```

`outline-spec store list` shows registered stores, `store doctor` checks them, `store unregister <id>` forgets one, and `store remove <id>` forgets it and deletes the folder.

## Where commands act

Commands pick a root in this order, and the first that applies wins:

1. `--store <id>` on the command.
2. The nearest local `outline-spec/` folder that has `specs/` or `changes/`.
3. A `store:` line in the local `outline-spec/config.yaml`.
4. `defaultStore` in global settings (`outline-spec config set defaultStore team-plans`).

When a store is chosen, commands print `Using outline-spec root: <id> (<path>)` first, and printed hints carry the `--store` flag. `init`, `update`, `templates`, `schemas`, and the `schema` subcommands always act on the current directory.

## A code repo that plans in a store

To keep a repo's planning in a store, give the repo an `outline-spec/config.yaml` with only a `store:` line and no `specs/` or `changes/`:

```yaml
store: team-plans
```

Every command run inside the repo then acts on the store with no flag. Commit the line; teammates still need the store registered. If the repo also has `specs/` or `changes/`, those win and the line is ignored with a warning.

To install skills and commands in such a repo, run `outline-spec init --tools <ids>` from the repository root. `config.yaml` is preserved byte-for-byte, and `outline-spec/specs/` and `outline-spec/changes/` are not created. Init refuses from a subdirectory, and refuses `--language` because the language belongs in the external store's config.

The workflows are the same in a store: propose, apply, and land write to the store's folders. Commit and push the store to share a change.

## References

A repo with its own `outline-spec/` can let its agent read another store's specs:

```yaml
references:
  - team-plans
  - { id: design-system, remote: "git@github.com:acme/design-system.git" }
```

Artifact instructions then include an index of each referenced store's specs, with a one-line summary and the command to fetch each one. References are read-only and never change where commands act. With a `remote`, `outline-spec doctor` prints a clone-and-register fix when the store is missing on this machine.

## Context, doctor, and worksets

- `outline-spec doctor` checks the current root and its stores without changing anything, and prints a fix for each finding.
- `outline-spec context` prints the root and stores the current directory works with. `--code-workspace <path>` also writes a VS Code workspace file for them.
- `outline-spec workset create` saves a named set of folders (for example a code repo and its store) that `workset open` opens together in your editor or agent.
