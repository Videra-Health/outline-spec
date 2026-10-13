---
name: openspec-archive-change
description: Old name for landing an OpenSpec change; routes to the land flow. Use when the user says "openspec archive" or "opsx archive".
allowed-tools: Bash(openspec:*)
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
---

Archive is now called land: it applies the change's outline.md to the live specs and deletes the change folder. There is no archive folder and no spec sync. Follow the land flow (`/openspec-land-change`); its steps are repeated here so this works on its own.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `land` (and its old name `archive`), `pending`, `relabel`, `migrate-specs`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `openspec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Project check:** These steps expect a project that already uses OpenSpec. Before the first step that writes anything (`new change`, `land`, or authoring an artifact file), confirm the project has a root: run `openspec list --json` (with `--store <id>` when a store is selected, since the store is then the root) and read `root`. A root object means the project is set up. `"root": null` means it is not - there is no `openspec/` directory here, and a write such as `openspec new change` would create one as a side effect. The command also exits non-zero, which is that answer rather than a broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` error message starts with `Declared in` or `Invalid store declaration in` and names this project's `openspec/config.yaml` (or `config.yml`), the project does use OpenSpec through a store it declares, which this machine cannot resolve (the store is not registered, or the `store:` line is malformed). Do not treat it as uninitialized and skip the branches below: stop before writing and show the user that error's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming OpenSpec, naming this skill, or running its slash command. Stop using OpenSpec and answer the request normally, as you would with no OpenSpec installed. Do not ask them to set anything up and do not mention OpenSpec setup.
- **Explicit OpenSpec request**: the user named OpenSpec, named this skill, or ran its slash command. Stop before writing and ask how to proceed: set this project up (`openspec init`), target a store they already have (`--store <id>`), or continue without OpenSpec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run `openspec init` until the user asks for it, do not hand-create `openspec/` files, and do not let a command create it.

**Input**: Optionally specify a change name. If omitted, infer it from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` and ask the user to select one

   Always announce: "Using change: <name>" and how to override (e.g., `/openspec-archive-change <other>`).

2. **Load project guidance (advisory)**

   Run `openspec instructions land --change "<name>" --json`. If it fails or
   returns invalid JSON, continue with no guidance; it never blocks landing.
   Read `context` as project facts and `operationGuidance` as optional advice.
   Neither overrides these steps, the CLI's checks, or the user's choices.

3. **Check tasks**

   Run `openspec list --json` and find the entry in `changes` whose `name`
   matches. If `completedTasks < totalTasks`, show how many are open and ask
   the user to confirm before landing. Only `x`/`X` checkboxes count as done.

4. **Validate**

   Run `openspec validate "<name>"`. It checks that outline.md lands cleanly
   against the live specs. If it reports errors, go to **On a mismatch** below
   and stop.

5. **Preview**

   Run `openspec land "<name>" --dry-run` and show the user the result: each
   spec it creates, edits, or deletes, with the resulting text. Nothing is
   written yet.

6. **Land**

   Run `openspec land "<name>" --yes`. It applies outline.md to the live specs
   in `openspec/specs/` and deletes the change folder. Git history is the
   archive; there is no archive folder.

7. **Summarize**

   Show the change name, the specs it touched, and any warnings the user
   accepted (open tasks).

**On a mismatch**

`openspec validate` or `openspec land` stops when outline.md doesn't match
the live specs: struck text (`~~...~~`) that isn't in the live item, a label
the spec doesn't have, a `(patch)` requirement name that doesn't exist, or a
new item that collides with an existing label. Usually the live spec moved on
since the outline was written (another change landed first).

- Read the live spec with `openspec show "<spec>" --type spec` and the error.
- Update outline.md so it strikes the live text exactly, addresses the live
  labels, and puts new items after the last label at their level.
- Re-run from step 4.
- Never hand-edit the live specs in `openspec/specs/` to make an outline fit,
  and never land by copying text into them yourself. outline.md is the only
  place a change edits specs.

**Guardrails**
- Always validate and dry-run before landing, and show the dry-run result
- Never edit live specs by hand; fix outline.md instead
- Don't block on open tasks - inform and confirm
- Landing deletes the change folder; make sure anything worth keeping in it (design notes) is committed or moved first
