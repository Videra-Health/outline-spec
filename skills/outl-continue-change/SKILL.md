---
name: outl-continue-change
description: Continue working on an outline-spec change by creating the next artifact. Use when the user wants to progress their change, create the next artifact, or continue their workflow. Also use when the user says "outline-spec continue".
allowed-tools: Bash(outline-spec:*)
license: MIT
compatibility: Requires outline-spec CLI.
metadata:
  author: outline-spec
  version: "1.0"
---

Continue working on a change by creating the next artifact.

**Store selection:** If the user names a store (a store is a standalone outline-spec repo registered on this machine) or the work lives in one, run `outline-spec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `sync`, `archive`, `pending`, `relabel`, `migrate-specs`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `outline-spec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `outline-spec/` root.

**Project check:** These steps expect a project that already uses outline-spec. Before the first step that writes anything (`new change`, `archive`, or authoring an artifact file), confirm the project has a root: run `outline-spec list --json` (with `--store <id>` when a store is selected, since the store is then the root) and read `root`. A root object means the project is set up. `"root": null` means it is not - there is no `outline-spec/` directory here, and a write such as `outline-spec new change` would create one as a side effect. The command also exits non-zero, which is that answer rather than a broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` error message starts with `Declared in` or `Invalid store declaration in` and names this project's `outline-spec/config.yaml` (or `config.yml`), the project does use outline-spec through a store it declares, which this machine cannot resolve (the store is not registered, or the `store:` line is malformed). Do not treat it as uninitialized and skip the branches below: stop before writing and show the user that error's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming outline-spec, naming this skill, or running its slash command. Stop using outline-spec and answer the request normally, as you would with no outline-spec installed. Do not ask them to set anything up and do not mention outline-spec setup.
- **Explicit outline-spec request**: the user named outline-spec, named this skill, or ran its slash command. Stop before writing and ask how to proceed: set this project up (`outline-spec init`), target a store they already have (`--store <id>`), or continue without outline-spec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run `outline-spec init` until the user asks for it, do not hand-create `outline-spec/` files, and do not let a command create it.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `outline-spec list --json` to get available changes sorted by most recently modified, and ask the user to select one

   When prompting, present the top 3-4 most recently modified changes as options, showing:
   - Change name
   - Status (e.g., "0/5 tasks", "complete", "no tasks")
   - How recently it was modified (from `lastModified` field)

   Mark the most recently modified change as "(Recommended)" since it's likely what the user wants to continue.

   Always announce: "Using change: <name>" and how to override (e.g., `/outl-continue-change <other>`).

2. **Check current status**
   ```bash
   outline-spec status --change "<name>" --json
   ```
   Parse the JSON to understand current state. The response includes:
   - `schemaName`: The workflow schema being used (e.g., "outline")
   - `artifacts`: Array of artifacts with their status ("done", "ready", "blocked")
   - `isPlanningComplete`: Boolean indicating if all planning artifacts are complete. Older CLI versions expose the same value as `isComplete`.
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context. Use these instead of assuming repo-local paths.

3. **Act based on status**:

   ---

   **Before anything else, finish a partly written artifact**:
   - An artifact whose output is a glob pattern (e.g. `notes/**/*.md` in a custom schema) reads `done` as soon as one matching file exists, so a run interrupted while writing its files leaves it `done` with some still missing
   - For each such `done` artifact, first get its instructions and read any completed dependencies needed to determine the expected files. Then compare those files with `artifactPaths.<id>.existingOutputPaths`. Resolve each expected path against `changeRoot` before comparing path identity
   - If any are missing, write only the missing files, and STOP - that counts as this invocation's ONE artifact. If you cannot tell whether a file was left out on purpose, ask the user

   ---

   **If all planning artifacts are complete (`isPlanningComplete: true`, or legacy `isComplete: true`)**:
   - Congratulate the user
   - Show final status including the schema used
   - Suggest: "Planning is complete! You can now implement this change. Once implementation and any tracked work are complete, archive it."
   - STOP

   ---

   **If artifacts are ready to create** (status shows artifacts with `status: "ready"`):
   - Pick the FIRST artifact with `status: "ready"` from the status output. If its instruction says to create it only when conditions apply and they don't (the outline schema's `design.md`), tell the user and pick the next ready one
   - Get its instructions:
     ```bash
     outline-spec instructions <artifact-id> --change "<name>" --json
     ```
   - Parse the JSON. The key fields are:
     - `context`: Project background (constraints for you - do NOT include in output)
     - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
     - `template`: The structure to use for your output file
     - `instruction`: Schema-specific guidance
     - `resolvedOutputPath`: Resolved path or pattern to write the artifact
     - `dependencies`: Completed artifacts to read for context
   - **Create the artifact file**:
     - Read any completed dependency files for context - always re-read them from disk, even if you saw them earlier in the conversation (the user may have edited them)
     - If the `instruction` field delegates creation to a specific skill or command, invoke it to produce the artifact instead of writing the file yourself, then verify the artifact file exists at `resolvedOutputPath`
     - Otherwise use `template` as the structure - fill in its sections
     - Apply `context` and `rules` as constraints when writing - but do NOT copy them into the file
     - Write to the `resolvedOutputPath` specified in instructions. If it is a glob pattern, choose the concrete file path using the schema instruction and the change's context
     - After writing outline.md, run `outline-spec validate "<name>"` and fix the outline until it archives cleanly against the live specs
   - Show what was created and what's now unlocked
   - STOP after creating ONE artifact

   ---

   **If no artifacts are ready (all blocked)**:
   - This shouldn't happen with a valid schema
   - Show status and suggest checking for issues

4. **After creating an artifact, show progress**
   ```bash
   outline-spec status --change "<name>"
   ```

**Output**

After each invocation, show:
- Which artifact was created
- Schema workflow being used
- Current progress (N/M complete)
- What artifacts are now unlocked
- Prompt: "Want to continue? Just ask me to continue or tell me what to do next."

**Artifact Creation Guidelines**

The artifact types and their purpose depend on the schema. The `instruction` field from the instructions output is the authoritative guidance for each artifact - follow it even when the artifact has a familiar name (outline.md, tasks.md, etc.), since custom schemas may define different content or a different process for the same file names.

If the `instruction` field directs you to use a specific skill or command to create the artifact, invoke it instead of writing the artifact directly.

**Guardrails**
- Create ONE artifact per invocation
- Always read dependency artifacts before creating a new one - re-read from disk, not from conversation memory (files may have changed since you last saw them)
- Never create artifacts out of order; skip one only when its instruction marks it optional
- Never edit the live specs in `outline-spec/specs/`; spec changes go in outline.md
- If context is unclear, ask the user before creating
- Verify the artifact file exists after writing before marking progress
- Use the schema's artifact sequence, don't assume specific artifact names
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output
