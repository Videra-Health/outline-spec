---
name: outl-sync-specs
description: Sync an outline-spec change's spec edits to the live specs without archiving it. Applies outline.md's Requirements now, records them in the change's applied/ folder, and keeps the change open. Use when the user wants the specs updated mid-change and to keep working. Also use when the user says "outline-spec sync".
allowed-tools: Bash(outline-spec:*)
license: MIT
compatibility: Requires outline-spec CLI.
metadata:
  author: outline-spec
  version: "1.0"
---

Sync a change's spec edits to the live specs now and keep the change open.

**Store selection:** If the user names a store (a store is a standalone outline-spec repo registered on this machine) or the work lives in one, run `outline-spec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `sync`, `archive`, `pending`, `relabel`, `review`, `migrate-specs`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `outline-spec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `outline-spec/` root.

**Project check:** These steps expect a project that already uses outline-spec. Before the first step that writes anything (`new change`, `archive`, or authoring an artifact file), confirm the project has a root: run `outline-spec list --json` (with `--store <id>` when a store is selected, since the store is then the root) and read `root`. A root object means the project is set up. `"root": null` means it is not - there is no `outline-spec/` directory here, and a write such as `outline-spec new change` would create one as a side effect. The command also exits non-zero, which is that answer rather than a broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` error message starts with `Declared in` or `Invalid store declaration in` and names this project's `outline-spec/config.yaml` (or `config.yml`), the project does use outline-spec through a store it declares, which this machine cannot resolve (the store is not registered, or the `store:` line is malformed). Do not treat it as uninitialized and skip the branches below: stop before writing and show the user that error's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming outline-spec, naming this skill, or running its slash command. Stop using outline-spec and answer the request normally, as you would with no outline-spec installed. Do not ask them to set anything up and do not mention outline-spec setup.
- **Explicit outline-spec request**: the user named outline-spec, named this skill, or ran its slash command. Stop before writing and ask how to proceed: set this project up (`outline-spec init`), target a store they already have (`--store <id>`), or continue without outline-spec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run `outline-spec init` until the user asks for it, do not hand-create `outline-spec/` files, and do not let a command create it.

**Input**: Optionally specify a change name. If omitted, infer it from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `outline-spec list --json` and ask the user to select one

   Always announce: "Using change: <name>" and how to override (e.g., `/outl-sync-specs <other>`).

2. **Validate**

   Run `outline-spec validate "<name>"`. It checks that outline.md applies cleanly
   against the live specs. If it reports errors, go to **On a mismatch** below
   and stop.

3. **Preview**

   Run `outline-spec sync "<name>" --dry-run` and show the user the result: each
   spec it creates, edits, or deletes, with the resulting text, and the
   `applied/` file it would write. Nothing is written yet. If it reports there
   is nothing to sync, say so and stop.

4. **Sync**

   Run `outline-spec sync "<name>" --yes`. It applies outline.md's
   `## Requirements` edits to the live specs in `outline-spec/specs/`, moves
   those edits verbatim into `applied/<date>-<n>.md` in the change folder, and
   leaves `## Requirements` in outline.md empty. Sync doesn't check tasks.

5. **Summarize**

   Show the change name, the specs it touched, and the applied/ file. Explain
   that the change stays open: keep working, add new spec edits to outline.md
   as they come up, and sync again whenever they should reach the live specs.
   The applied/ files are a record only; nothing reads them back.
   When the work is done, `/outl-archive-change` applies whatever outline.md holds by then and deletes the change folder, applied/ included.

**On a mismatch**

`outline-spec validate` or `outline-spec sync` stops and writes nothing when
outline.md doesn't match the live specs: struck text (`~~...~~`) that isn't in
the live item, a label the spec doesn't have, a `(patch)` requirement name that
doesn't exist, or a new item that collides with an existing label. Usually the
live spec moved on since the outline was written.

- Read the live spec with `outline-spec show "<spec>" --type spec` and the error.
- Update outline.md so it strikes the live text exactly, addresses the live
  labels, and puts new items after the last label at their level.
- Re-run from step 2.
- Never hand-edit the live specs in `outline-spec/specs/` to make an outline fit,
  and never copy text into them yourself. outline.md is the only place a change
  edits specs.

**Guardrails**
- Always validate and dry-run before syncing, and show the dry-run result
- Never edit live specs by hand; fix outline.md instead
- Never edit or re-apply files in applied/; they record edits already in the live specs
