---
name: outl-onboard
description: Guided onboarding for outline-spec - walk through a complete workflow cycle with narration and real codebase work. Also use when the user says "outline-spec onboard".
allowed-tools: Bash(outline-spec:*)
license: MIT
compatibility: Requires outline-spec CLI.
metadata:
  author: outline-spec
  version: "1.0"
---

Guide the user through their first complete outline-spec workflow cycle. This is a teaching experience—you'll do real work in their codebase while explaining each step.

**Store selection:** If the user names a store (a store is a standalone outline-spec repo registered on this machine) or the work lives in one, run `outline-spec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `sync`, `archive`, `pending`, `relabel`, `migrate-specs`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `outline-spec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `outline-spec/` root.

**Project check:** These steps expect a project that already uses outline-spec. Before the first step that writes anything (`new change`, `archive`, or authoring an artifact file), confirm the project has a root: run `outline-spec list --json` (with `--store <id>` when a store is selected, since the store is then the root) and read `root`. A root object means the project is set up. `"root": null` means it is not - there is no `outline-spec/` directory here, and a write such as `outline-spec new change` would create one as a side effect. The command also exits non-zero, which is that answer rather than a broken CLI, so read the JSON instead of retrying or working around it.

One `"root": null` is not about setup: when a `status` error message starts with `Declared in` or `Invalid store declaration in` and names this project's `outline-spec/config.yaml` (or `config.yml`), the project does use outline-spec through a store it declares, which this machine cannot resolve (the store is not registered, or the `store:` line is malformed). Do not treat it as uninitialized and skip the branches below: stop before writing and show the user that error's `message` and `fix`.

Otherwise, with no root, what happens next depends on how this workflow was reached:

- **Auto-selected**: you chose this workflow yourself, without the user naming outline-spec, naming this skill, or running its slash command. Stop using outline-spec and answer the request normally, as you would with no outline-spec installed. Do not ask them to set anything up and do not mention outline-spec setup.
- **Explicit outline-spec request**: the user named outline-spec, named this skill, or ran its slash command. Stop before writing and ask how to proceed: set this project up (`outline-spec init`), target a store they already have (`--store <id>`), or continue without outline-spec for this request. Wait for their answer.

In both branches, never create the root as a side effect: do not run `outline-spec init` until the user asks for it, do not hand-create `outline-spec/` files, and do not let a command create it.

---

## Preflight

Before starting, check if the outline-spec CLI is installed:

```bash
# Unix/macOS
outline-spec --version 2>&1 || echo "CLI_NOT_INSTALLED"
# Windows (PowerShell)
# if (Get-Command outline-spec -ErrorAction SilentlyContinue) { outline-spec --version } else { echo "CLI_NOT_INSTALLED" }
```

**If CLI not installed:**
> outline-spec CLI is not installed. Install it first, then come back to `/outl-onboard`.

Stop here if not installed.

---

## Phase 1: Welcome

Display:

```
## Welcome to outline-spec!

I'll walk you through a complete change cycle—from idea to implementation—using a real task in your codebase. Along the way, you'll learn the workflow by doing it.

**What we'll do:**
1. Pick a small, real task in your codebase
2. Explore the problem briefly
3. Create a change (the container for our work)
4. Build the artifacts: outline → design (if needed) → diagrams → tasks
5. Implement the tasks
6. Archive the change into the specs

**Time:** ~15-20 minutes

Let's start by finding something to work on.
```

---

## Phase 2: Task Selection

### Codebase Analysis

Scan the codebase for small improvement opportunities. Look for:

1. **TODO/FIXME comments** - Search for `TODO`, `FIXME`, `HACK`, `XXX` in code files
2. **Missing error handling** - `catch` blocks that swallow errors, risky operations without try-catch
3. **Functions without tests** - Cross-reference `src/` with test directories
4. **Type issues** - `any` types in TypeScript files (`: any`, `as any`)
5. **Debug artifacts** - `console.log`, `console.debug`, `debugger` statements in non-debug code
6. **Missing validation** - User input handlers without validation

Also check recent git activity:
```bash
# Unix/macOS
git log --oneline -10 2>/dev/null || echo "No git history"
# Windows (PowerShell)
# git log --oneline -10 2>$null; if ($LASTEXITCODE -ne 0) { echo "No git history" }
```

### Present Suggestions

From your analysis, present 3-4 specific suggestions:

```
## Task Suggestions

Based on scanning your codebase, here are some good starter tasks:

**1. [Most promising task]**
   Location: `src/path/to/file.ts:42`
   Scope: ~1-2 files, ~20-30 lines
   Why it's good: [brief reason]

**2. [Second task]**
   Location: `src/another/file.ts`
   Scope: ~1 file, ~15 lines
   Why it's good: [brief reason]

**3. [Third task]**
   Location: [location]
   Scope: [estimate]
   Why it's good: [brief reason]

**4. Something else?**
   Tell me what you'd like to work on.

Which task interests you? (Pick a number or describe your own)
```

**If nothing found:** Fall back to asking what the user wants to build:
> I didn't find obvious quick wins in your codebase. What's something small you've been meaning to add or fix?

### Scope Guardrail

If the user picks or describes something too large (major feature, multi-day work):

```
That's a valuable task, but it's probably larger than ideal for your first outline-spec run-through.

For learning the workflow, smaller is better—it lets you see the full cycle without getting stuck in implementation details.

**Options:**
1. **Slice it smaller** - What's the smallest useful piece of [their task]? Maybe just [specific slice]?
2. **Pick something else** - One of the other suggestions, or a different small task?
3. **Do it anyway** - If you really want to tackle this, we can. Just know it'll take longer.

What would you prefer?
```

Let the user override if they insist—this is a soft guardrail.

---

## Phase 3: Explore Demo

Once a task is selected, briefly demonstrate explore mode:

```
Before we create a change, let me quickly show you **explore mode**—it's how you think through problems before committing to a direction.
```

Spend 1-2 minutes investigating the relevant code:
- Read the file(s) involved
- Draw a quick ASCII diagram if it helps
- Note any considerations

```
## Quick Exploration

[Your brief analysis—what you found, any considerations]

┌─────────────────────────────────────────┐
│   [Optional: ASCII diagram if helpful]  │
└─────────────────────────────────────────┘

Explore mode (`/outl-explore`) is for this kind of thinking—investigating before implementing. You can use it anytime you need to think through a problem.

Now let's create a change to hold our work.
```

**PAUSE** - Wait for user acknowledgment before proceeding.

---

## Phase 4: Create the Change

**EXPLAIN:**
```
## Creating a Change

A "change" in outline-spec is a container for all the thinking and planning around a piece of work. It lives at the `changeRoot` reported by `outline-spec status --change "<name>" --json` and holds your artifacts—outline, design, diagrams, tasks.

Let me create one for our task.
```

**DO:** Create the change with a derived kebab-case name:
```bash
outline-spec new change "<derived-name>"
```

**SHOW:**
```
Created: <changeRoot from status JSON>

The folder structure:
```
<changeRoot>/
├── outline.md     ← What we're doing and the spec edits it makes
├── design.md      ← How we'll build it (only if needed)
├── diagrams.md    ← Views that explain the change
└── tasks.md       ← Implementation checklist
```

Now let's write the first artifact—the outline.
```

---

## Phase 5: Outline

**EXPLAIN:**
```
## The Outline

The project's specs live in `outline-spec/specs/<spec>/spec.md` as labeled outlines: each numbered item is a requirement (a name, a colon, one sentence), with details nested under it as a. / i. / 1.

A change never edits those files directly. Its outline.md states the proposal in a sentence or two, then lists only the spec edits it makes:
- A new requirement or detail is written plainly, labeled after the last one at its level.
- An edit to existing text marks what it drops and adds: ~~old~~ **new**.
- A removed item is wholly struck, with its live text.
- Labels never shift: a removed item leaves a gap.

`outline-spec sync` applies these edits to the live specs early so work can continue; when the work is done, `outline-spec archive` applies what's left and finishes the change.
```

**DO:** Read the specs this task touches (`outline-spec list --specs`, then `outline-spec show "<spec>" --type spec`), and get the artifact instructions:
```bash
outline-spec instructions outline --change "<name>" --json
```

Draft the outline (don't save yet), following the returned `template` and `instruction`:

```
Here's a draft outline:

---

# Outline

## Proposal
[1-2 sentences on what we're changing and why]

## Requirements
1. <spec-name>:
  a. <Existing requirement name> (patch):
    b. <Kept words> ~~<dropped words>~~ **<added words>**
    e. <A new detail, after the last label at its level>
  f. <New requirement name>: <One sentence>
    a. <Detail>

---

Every line here is an edit the change makes to a live spec. Does this capture the intent?
```

**PAUSE** - Wait for user approval/feedback.

After approval, write it to the `resolvedOutputPath` from the instructions JSON, then check it archives cleanly:
```bash
outline-spec validate "<name>"
```

```
Outline saved and validated against the live specs. You can refine it as understanding evolves.

Next up: design, if the change needs one.
```

---

## Phase 6: Design (optional)

**EXPLAIN:**
```
## Design

The design captures **how** we'll build it—technical decisions and tradeoffs. It's optional: only write one when the change needs decisions explained. Small changes usually skip it.
```

**DO:** Decide whether this change needs a design. If it does, draft design.md following `outline-spec instructions design --change "<name>" --json`, show it, and save it to the `resolvedOutputPath`. If not, say so and move on.

---

## Phase 7: Diagrams

**EXPLAIN:**
```
## Diagrams

Diagrams show the change at a glance: a sequence diagram, call tree, state machine, data shape, or table, whichever few make the point.
```

**DO:** Draft diagrams.md following `outline-spec instructions diagrams --change "<name>" --json`, show it, and save it to the `resolvedOutputPath`.

---

## Phase 8: Tasks

**EXPLAIN:**
```
## Tasks

Finally, we break the work into implementation tasks—checkboxes that drive the apply phase.

These should be small, clear, and in logical order. Each group carries the tests and documentation for its own work - the last group is only for integration checks.
```

**DO:** Generate tasks based on the outline (and design, if any):

```
Here are the implementation tasks:

---

# Tasks

## 1. [Category or file]

- [ ] 1.1 [Specific task] — verify: [test, command, observable behavior, or delivered artifact]
- [ ] 1.2 [Specific task] — verify: [test, command, observable behavior, or delivered artifact]

## 2. Integration Verification

- [ ] 2.1 Verify [broader integration or system behavior] with [end-to-end test or observable result]
- [ ] 2.2 Archive the change with `outline-spec archive <name>`

---

Each checkbox becomes a unit of work in the apply phase. Does this task breakdown look right?
```

**PAUSE** - Wait for user approval/feedback.

After approval, save to the `resolvedOutputPath` from `outline-spec instructions tasks --change "<name>" --json`.

Then ask:
> "Tasks are saved. Ready to implement?"

**PAUSE** - Wait for user to confirm before implementation.

---

## Phase 9: Apply (Implementation)

**EXPLAIN:**
```
## Implementation

Now we implement each task, checking them off as we go. I'll announce each one and occasionally note how the outline/design informed the approach.
```

**DO:** For each task:

1. Announce: "Working on task N: [description]"
2. Implement the change in the codebase
3. Reference the outline/design naturally: "The outline says X, so I'm doing Y"
4. Mark complete in tasks.md: `- [ ]` → `- [x]`
5. Brief status: "✓ Task N complete"

Keep narration light—don't over-explain every line of code.

After all tasks:

```
## Implementation Complete

All tasks done:
- [x] Task 1
- [x] Task 2
- [x] ...

The change is implemented! One more step—let's archive it.
```

---

## Phase 10: Archive

**EXPLAIN:**
```
## Archiving

Archiving applies the change's outline.md to the live specs and deletes the change folder; git history keeps the record. (Mid-change, `outline-spec sync` applies the spec edits early and keeps the change open.)
```

**DO:** Validate, preview, then archive (`--yes` answers the confirmation prompt, which you cannot answer from a tool call):
```bash
outline-spec validate "<name>"
outline-spec archive "<name>" --dry-run
outline-spec archive "<name>" --yes
```

Show the dry-run result before archiving. If validate or archive reports a mismatch, fix outline.md so its struck text and labels match the live spec—never hand-edit `outline-spec/specs/`.

**SHOW:**
```
Archived. The specs now describe the new behavior, the change folder is gone, and the code is in your codebase. Commit to keep the record.
```

---

## Phase 11: Recap & Next Steps

```
## Congratulations!

You just completed a full outline-spec cycle:

1. **Explore** - Thought through the problem
2. **New** - Created a change container
3. **Outline** - Captured WHY and the spec edits
4. **Design** - Decided HOW (when needed)
5. **Tasks** - Broke it into steps
6. **Apply** - Implemented the work
7. **Archive** - Applied the outline to the specs

This same rhythm works for any size change—a small fix or a major feature.

---

## Command Reference

**The commands you have installed:**

 | Command          | What it does                               |
 |------------------|--------------------------------------------|
 | `/outl-propose` | Create a change and generate all artifacts |
 | `/outl-explore` | Think through problems before/during work  |
 | `/outl-apply-change`   | Implement tasks from a change              |
 | `/outl-sync-specs`    | Apply spec edits early, keep working       |
 | `/outl-archive-change` | Apply a finished change to the specs       |
 | `/outl-new-change`     | Start a new change, one artifact at a time |
 | `/outl-continue-change` | Continue working on an existing change    |
 | `/outl-ff-change`      | Fast-forward: create all artifacts at once |
 | `/outl-verify-change`  | Verify implementation matches artifacts    |

---

## What's Next?

Try `/outl-propose` on something you actually want to build. You've got the rhythm now!
```

---

## Graceful Exit Handling

### User wants to stop mid-way

If the user says they need to stop, want to pause, or seem disengaged:

```
No problem! Your change is saved at the `changeRoot` reported by `outline-spec status --change "<name>" --json`.

To pick up where we left off later, `outline-spec status --change "<name>" --json` shows exactly where the change stands.
- `/outl-continue-change <name>` - Resume artifact creation
- `/outl-apply-change <name>` - Jump to implementation (if tasks exist)

The work won't be lost. Come back whenever you're ready.
```

Exit gracefully without pressure.

### User just wants command reference

If the user says they just want to see the commands or skip the tutorial:

```
## outline-spec Quick Reference

**The commands you have installed:**

 | Command                  | What it does                               |
 |--------------------------|--------------------------------------------|
 | `/outl-propose <name>`  | Create a change and generate all artifacts |
 | `/outl-explore`         | Think through problems (no code changes)   |
 | `/outl-apply-change <name>`    | Implement tasks                            |
 | `/outl-sync-specs <name>`     | Apply spec edits early, keep working       |
 | `/outl-archive-change <name>`  | Archive when done                          |
 | `/outl-new-change <name>`      | Start a new change, step by step           |
 | `/outl-continue-change <name>` | Continue an existing change                |
 | `/outl-ff-change <name>`       | Fast-forward: all artifacts at once        |
 | `/outl-verify-change <name>`   | Verify implementation                      |

Try `/outl-propose` to start your first change.
```

Exit gracefully.

---

## Guardrails

- **Follow the EXPLAIN → DO → SHOW → PAUSE pattern** at key transitions (after explore, after outline draft, after tasks, after archiving)
- **Keep narration light** during implementation—teach without lecturing
- **Don't skip phases** even if the change is small—the goal is teaching the workflow
- **Pause for acknowledgment** at marked points, but don't over-pause
- **Handle exits gracefully**—never pressure the user to continue
- **Use real codebase tasks**—don't simulate or use fake examples
- **Adjust scope gently**—guide toward smaller tasks but respect user choice
