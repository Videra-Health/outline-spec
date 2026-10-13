---
name: openspec-verify-change
description: Verify implementation matches OpenSpec change artifacts. Use when the user wants to validate that implementation is complete, correct, and coherent before landing. Also use when the user says "openspec verify" or "opsx verify".
allowed-tools: Bash(openspec:*)
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
---

Verify that an implementation matches the change artifacts (outline.md, tasks, design) and the live specs.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `land` (and its old name `archive`), `pending`, `relabel`, `migrate-specs`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `openspec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Project check:** These steps expect a project that already uses OpenSpec. Before the first step that writes anything (`new change`, `land`, or authoring an artifact file), confirm the project has a root: run `openspec list --json` (with `--store <id>` when a store is selected, since the store is then the root) and read `root`. A root object means the project is set up. `"root": null` means it is not - there is no `openspec/` directory here, and a write such as `openspec new change` would create one as a side effect. The command also exits non-zero, which is that answer rather than a broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` error message starts with `Declared in` or `Invalid store declaration in` and names this project's `openspec/config.yaml` (or `config.yml`), the project does use OpenSpec through a store it declares, which this machine cannot resolve (the store is not registered, or the `store:` line is malformed). Do not treat it as uninitialized and skip the branches below: stop before writing and show the user that error's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming OpenSpec, naming this skill, or running its slash command. Stop using OpenSpec and answer the request normally, as you would with no OpenSpec installed. Do not ask them to set anything up and do not mention OpenSpec setup.
- **Explicit OpenSpec request**: the user named OpenSpec, named this skill, or ran its slash command. Stop before writing and ask how to proceed: set this project up (`openspec init`), target a store they already have (`--store <id>`), or continue without OpenSpec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run `openspec init` until the user asks for it, do not hand-create `openspec/` files, and do not let a command create it.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and ask the user to select one

   When prompting, show all active changes returned by the list, including changes with `status: "no-tasks"`.
   Include the schema used for each change if available.
   Mark changes with incomplete tasks as "(In Progress)".

   Always announce: "Using change: <name>" and how to override (e.g., `/openspec-verify-change <other>`).

2. **Check status to understand the schema**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "outline")
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context
   - Which artifacts exist for this change

3. **Get planning context and load artifacts**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   This returns the change directory, `contextFiles` (artifact ID -> array of concrete file paths), `taskTrackingConfigured`, and top-level `tasks` and `progress` aggregated from every concrete file matched by the schema's `apply.tracks` configuration that could be read. Read all available artifacts from `contextFiles`.

   Treat apply `state` and `instruction` as context, not a verification verdict. Do not implement tasks or land the change during verification.

4. **Load the spec edits and the live specs**

   `contextFiles` is keyed by artifact id, and artifact ids come from the active schema, so do not assume an id such as `outline`. The outline artifact is the one whose `artifactPaths.<id>.outputPath` is or ends in `outline.md`; read it from `contextFiles.<id>`.

   outline.md lists, under `## Requirements`, only what the change adds, edits, or removes. Each top-level item names a spec; each second-level item is a requirement by name; deeper items are details by their live labels. Read it as:
   - **New**: unmarked text on a requirement without `(patch)`, or on a label the live spec doesn't have
   - **Edited**: `~~old~~ **new**` marks inside an existing item; the `**new**` words are the behavior to check
   - **Removed**: an item wholly in `~~ ~~`; that behavior should be gone
   - **Renamed**: `~~Old~~ **New** (patch):`; the name changes, the behavior stays

   For each spec the outline touches, read the live spec with `openspec show "<spec>" --type spec` for the unchanged surrounding requirements. Run `openspec validate "<name>"` to confirm the outline still lands cleanly, and `openspec land "<name>" --dry-run` to see the resulting spec text — that landed text is what the code must satisfy. Never edit live specs; a mismatch is fixed in outline.md.

5. **Initialize verification report structure**

   Create a report structure with three dimensions:
   - **Completeness**: Track tasks and spec coverage
   - **Correctness**: Track requirement and detail implementation
   - **Coherence**: Track design adherence and pattern consistency

   Each dimension can have CRITICAL, WARNING, or SUGGESTION issues.

   Verification is advisory. Respect intentional omissions such as an outline with no spec edits, optional design documents, and schemas without task tracking. Do not require or invent optional or intentionally omitted artifacts to obtain a clean report. `Not verified` describes a limit of this report, not a new land prerequisite. Land retains its own checks and user-confirmation behavior.

   Mark checks the schema does not define, or artifacts the status reports as intentionally skipped, as **Not applicable**. The correctness checks of a change whose outline only removes or renames items are also **Not applicable** (see step 7). Exclude them from skipped-check counts and the land-readiness assessment. Reserve **Not verified** for applicable checks whose evidence is missing or unusable.

   If only task evidence is available for applicable checks, verify task completion only and mark the remaining applicable checks, including **Code Pattern Consistency**, as not verified with the reason "Only task evidence available".

   If artifacts cannot be read or contain no usable requirements, details, or design decisions, mark the affected checks as not verified with the specific reason. Continue checks supported by the remaining evidence, but a partially checked input set is not a fully verified check. Missing requirements affect Spec Coverage and Requirement Implementation Mapping; missing details affect Detail Coverage; missing design decisions affect Design Adherence.

6. **Verify Completeness**

   **Task Completion**:
   - If `taskTrackingConfigured` is false, report **Task Completion** as not applicable. Do not treat empty `tasks` as missing evidence.
   - Otherwise, use the top-level `tasks` and `progress` fields. They already aggregate every readable concrete file matched by `apply.tracks`, regardless of the tracked artifact's ID; do not infer tracking from a `contextFiles` key.
   - If `unavailableTrackingFiles` is nonempty, mark **Task Completion** as not verified and include every unavailable path and reason. Continue using any readable task evidence, but do not infer completion from the partial `tasks` and `progress` fields.
   - If `taskTrackingConfigured` is true and `tasks` is empty, mark **Task Completion** as not verified and record the reason from apply `state` and `instruction`. Nonzero totals alone do not establish evaluable task descriptions.
   - Report complete vs total tasks from `progress`.
   - If `progress.remaining` is greater than 0:
     - Add CRITICAL issue for each listed incomplete task. If the remaining count exceeds the listed incomplete tasks, also report the incomplete checkboxes without descriptions and recommend adding descriptions and completing them. Do not infer completion from the listed tasks alone.
     - Recommendation: "Complete task: <description>" or "Mark as done if already implemented"
     - Ignore the final landing task (`openspec land`); it runs after verification.

   **Spec Coverage**:
   - If the schema defines no outline artifact, report the spec-dependent checks as not applicable. If outline.md exists but its `## Requirements` is empty, report them as not applicable (the change edits no specs).
   - If outline.md is absent or unreadable, or `openspec validate` reports it no longer lands, mark **Spec Coverage**, **Requirement Implementation Mapping**, and **Detail Coverage** as not verified; do not treat any of them as clean. Recommend fixing outline.md against the live spec.
   - For each new or edited requirement and detail:
     - Search codebase for keywords related to it
     - Assess if implementation likely exists
     - If it appears unimplemented:
       - Add CRITICAL issue: "Requirement not found: <spec>: <requirement name>"
       - Recommendation: "Implement <requirement>: <description>"
   - For each removed item, invert the check:
     - Search codebase for the removed behavior. Matches in `openspec/` artifacts or docs are not evidence by themselves.
     - Finding no implementation is the expected result. Never report a removed item as "Requirement not found" or recommend implementing it.
     - If the behavior is still present:
       - Add CRITICAL issue: "Removed requirement still implemented: <name>"
       - Recommendation: "Remove the remaining implementation at <file>:<lines>"
   - For each renamed requirement, check that the live behavior is still implemented under the new name. Do not require code symbols or file names to be renamed. If it appears unimplemented, add CRITICAL issue: "Renamed requirement not found: <New>".

7. **Verify Correctness**

   If the outline only removes or renames items, report **Requirement Implementation Mapping** and **Detail Coverage** as **Not applicable**; the checks under Spec Coverage are the evidence.

   **Requirement Implementation Mapping**:
   - For each new or edited requirement (check the landed text, not the struck words):
     - Search codebase for implementation evidence
     - If found, note file paths and line ranges
     - Assess if implementation matches requirement intent
     - If divergence detected:
       - Add WARNING: "Implementation may diverge from spec: <details>"
       - Recommendation: "Review <file>:<lines> against <requirement>"

   **Detail Coverage**:
   - For each new or edited detail (`a.` / `i.` / `1.` items) under those requirements:
     - Check if the behavior is handled in code
     - Check if tests exist covering it
     - If it appears uncovered:
       - Add WARNING: "Detail not covered: <requirement> <label>"
       - Recommendation: "Add test or implementation for: <detail>"
   - Skip struck details; that behavior is meant to be gone.

8. **Verify Coherence**

   **Design Adherence**:
   - If the schema defines no design artifact (no artifact with id `design`, and none whose `artifactPaths.<id>.outputPath` is or ends in `design.md`), report **Design Adherence** as not applicable.
   - If the design artifact's `contextFiles.<id>` file exists:
     - Extract key decisions (look for sections like "Decision:", "Approach:", "Architecture:")
     - Verify implementation follows those decisions
     - If contradiction detected:
       - Add WARNING: "Design decision not followed: <decision>"
       - Recommendation: "Update implementation or revise design.md to match reality"
   - Otherwise, design.md is optional in the outline schema: if it is absent, report **Design Adherence** as not applicable. If it exists but is empty or unreadable, mark **Design Adherence** as not verified. With other supporting artifacts, **Code Pattern Consistency** still runs; the task-only case remains limited to task completion.

   **Code Pattern Consistency**:
   - If implementation changes cannot be identified, mark **Code Pattern Consistency** as not verified and explain the missing evidence.
   - Otherwise, review new code for consistency with project patterns
   - Check file naming, directory structure, coding style
   - If significant deviations found:
     - Add SUGGESTION: "Code pattern deviation: <details>"
     - Recommendation: "Consider following project pattern: <example>"

9. **Generate Verification Report**

   **Summary Scorecard**:
   ```markdown
   ## Verification Report: <change-name>

   ### Summary
   | Dimension    | Status           |
   |--------------|------------------|
   | Completeness | X/Y tasks, N reqs|
   | Correctness  | M/N reqs covered |
   | Coherence    | Followed/Issues  |
   ```

   In each Status cell, report the results of checks that ran and `Not verified (<reason>)` for every skipped check. If all checks in a dimension were skipped, start the cell with `Not verified`. Never score a skipped check as passing. Treat every not verified or partially verified check as skipped in the final assessment. Count only new and edited requirements in N, and report removals and renames separately (for example, "1 removal confirmed, 1 rename verified").

   **Issues by Priority**:

   1. **CRITICAL** (Must fix before landing):
      - Incomplete tasks
      - Missing requirement implementations
      - Removed requirements still implemented
      - An outline that no longer lands against the live specs
      - Each with specific, actionable recommendation

   2. **WARNING** (Should fix):
      - Spec/design divergences
      - Uncovered details
      - Each with specific recommendation

   3. **SUGGESTION** (Nice to fix):
      - Pattern inconsistencies
      - Minor improvements
      - Each with specific recommendation

   **Final Assessment**:
   - If CRITICAL issues: "X critical issue(s) found. Fix before landing." If any check was skipped, also name every skipped check and its reason.
   - If no CRITICAL issues, one or more warnings, and no checks were skipped: "No critical issues. Y warning(s) to consider. Ready to land (with noted improvements)."
   - If only suggestions and no checks were skipped: "No critical issues or warnings. Z suggestion(s) to consider. Ready to land (with noted improvements)."
   - If no issues and no checks were skipped: "All checks passed. Ready to land with `/openspec-land-change`."
   - If any check was skipped and there are no CRITICAL issues: do not claim readiness. Say "No critical issues found in the checks that ran. <check(s)> not verified: <reason>." Include the warning count when nonzero.
   - Include the suggestion count when nonzero in every final assessment.

**Verification Heuristics**

- **Completeness**: Focus on objective checklist items (checkboxes, outline items)
- **Correctness**: Use keyword search, file path analysis, reasonable inference - don't require perfect certainty
- **Coherence**: Look for glaring inconsistencies, don't nitpick style
- **False Positives**: When uncertain, prefer SUGGESTION over WARNING, WARNING over CRITICAL
- **Actionability**: Every issue must have a specific recommendation with file/line references where applicable

**Output Format**

Use clear markdown with:
- Table for summary scorecard
- Grouped lists for issues (CRITICAL/WARNING/SUGGESTION)
- Code references in format: `file.ts:123`
- Specific, actionable recommendations
- No vague suggestions like "consider reviewing"
