# The outline schema

`outline` is the built-in workflow schema. A change has four artifacts, written in this order:

| Artifact | File | Requires |
|---|---|---|
| `outline` | `outline.md` | nothing |
| `design` | `design.md` | `outline` |
| `diagrams` | `diagrams.md` | `outline` |
| `tasks` | `tasks.md` | `outline` |

`design` is optional: its instruction tells the agent to skip it unless the change needs technical decisions explained. `diagrams` holds the views that explain the change (sequence diagrams, call trees, state machines, data shapes, and so on); its template lists the candidate views and when each fits. Apply needs only `tasks`, so `diagrams` never blocks it, and tracks progress in `tasks.md`.

The templates are in [`schemas/outline/templates/`](../schemas/outline/templates/). To change any of this for a project, fork the schema ([Configuration](configuration.md#custom-schemas)).

The instructions below are what `outline-spec instructions <artifact>` sends the agent, quoted from [`schemas/outline/schema.yaml`](../schemas/outline/schema.yaml). Project `context` and `rules` from `config.yaml` are added to them.

## outline

The proposal and its spec edits as a labeled outline.

### Instructions

The instruction sent to the agent when it writes this artifact.

```md
State the proposal in one or two sentences under `## Proposal`.

Under `## Requirements`, write a nested outline, one sentence per item.
This outline is the change's spec edits: `outline-spec archive <change>` applies
it to the live specs in `outline-spec/specs/` and deletes the change folder.
`outline-spec sync <change>` applies it earlier and keeps the change open.

Before writing, read the specs this change touches. Run `outline-spec list --specs`
for the inventory, then `outline-spec show "<spec>" --type spec` for each related
one (append `--store "<id>"` to both only for a registered standalone store).
Reuse an existing spec's exact folder name instead of inventing a near-duplicate.

Structure:
- Each top-level item is one spec: its kebab-case folder name, a colon, and
  for a new spec its purpose.
- Each second-level item is one requirement, found by its exact name. Deeper
  items are its details, labeled exactly as the live spec labels them
  (`a.` / `i.` / `1.` by depth, two spaces of indent per level).
- List only what this change adds, edits, or removes. An unchanged
  requirement or detail never appears.

Edits:
- A new requirement is `<Name>: <sentence>` with its details under it,
  unmarked, labeled `a.` / `i.` / `1.` from the start.
- An existing requirement is `<Name> (patch):`, then only the details that
  change. A detail you only pass through to reach a deeper one is its bare
  label, as `b.`.
- Mark every edit to existing text: wrap the words it drops in `~~ ~~` and the
  words it adds in `** **`, leaving kept words unmarked. Struck text must match
  the live spec exactly.
- A new detail needs no marks, just a label after the last one at its level.
- A removed detail or requirement is wholly in `~~ ~~`, with its live text.
- Never relabel: a removed item leaves a gap, and a new item always goes at
  the end of its level.
- To rename a requirement, mark the name: `~~Old~~ **New** (patch):`.
- State each rule once, in the spec that owns it; other specs reference it
  as "(see `spec-name`)".

Tables:
- When an item lists the same few facts for many things (every ship, catalog
  item, good), give it a table instead of a run-on list: directly under the
  item, indented one level, first column `id`. Its details follow the table.
- An id is the thing's id in the code or data when it has a readable one,
  otherwise a kebab-case slug of its name. Never change an id; edit the name
  column instead.
- To edit a live table, repeat it under its item (the `(patch)` requirement or
  the detail's label) with the `id` column and only the columns you touch. Mark a changed cell `~~old~~ **new**` and
  leave untouched cells blank. A new id is a new row; a struck id `~~id~~`
  removes its row. A bold header `**Col**` adds a column at the end, a struck
  header removes one, and `~~Old~~ **New**` renames one.
- Another spec refers to a column as "(see `spec-name` Item, Column)" instead
  of copying its numbers.

A spec describes observable behavior, not implementation: no internal
function names, library choices, or step-by-step plans. Those belong in
design.md or tasks.md.

Under `## Out of Scope`, list only what a reader might wrongly assume is
included, a few words per item, as a flat numbered list. Omit the section
if there is nothing.

Run `outline-spec validate <change>` after writing; it checks that the outline
archives cleanly against the live specs.

When the workflow finishes and you summarize it to the user, include the full
contents of outline.md verbatim in that reply, not a paraphrase or a link.
```

## design

Technical design for changes that need decisions explained.

### Instructions

The instruction sent to the agent when it writes this artifact.

```md
Create design.md only when the change needs technical decisions explained:
- Cross-cutting change (multiple services/modules) or a new architectural pattern
- New external dependency or significant data model changes
- Security, performance, or migration complexity
- Ambiguity that benefits from technical decisions before coding

Otherwise skip it; the outline and tasks are enough.

Sections:
- **Context**: Only the current state and constraints needed to explain the approach.
- **Decisions**: Key technical choices with rationale (why X over Y?).
- **Risks / Trade-offs**: Known limitations. Format: [Risk] → Mitigation
- **Open Questions**: Unknowns that can safely be answered later without
  changing the outline, the approach, or the task breakdown. Omit if none.

If a question would change the outline or the tasks, ask the user now
instead of deferring it. Reference outline.md for what changes; design
covers how.
```

## diagrams

Diagrams describing the change.

### Instructions

The instruction sent to the agent when it writes this artifact.

```md
Use diagrams to describe the proposed change. Each section in the template is a candidate visualization to explain the change. Some visualizations are applicable for certain changes, while others are not. Pick the smallest number of views that makes the point. Put each view right after the one-line text it supports. Before each visualization include a small muted text with the label of the visualization. (e.g. <sub>GraphQL Contract</sub>)
```

## tasks

Implementation checklist with trackable tasks.

### Instructions

The instruction sent to the agent when it writes this artifact.

```md
Create the task list that breaks down the implementation work.

If design.md exists and has Open Questions that would change what gets
built, resolve them with the user first.

**Follow the template for tracked tasks.** The apply phase parses checkbox
format to track progress. A box holding only `x` counts as done; every other
marker reads as unfinished. A line with no checkbox is not tracked.

Guidelines:
- Group related tasks under `## N. Group` headings.
- Each task is a checkbox: `- [ ] N.M Task description`.
- Tasks should be small enough to complete in one session, ordered by dependency.
- Each task states how to verify it (a test, command, or observable behavior).
- Each group includes the tests and docs its own work calls for; don't collect
  them into a final group.
- The last task archives the change: `outline-spec archive <change>`, which applies
  outline.md to the live specs and deletes the change folder.

Reference outline.md for what to build and design.md (if present) for how.
```

## apply

Requires `tasks`; tracks `tasks.md`.

### Instructions

The instruction sent to the agent when it implements the change.

```md
Read context files, work through pending tasks, mark complete as you go.
Pause if you hit blockers or need clarification.
```

## review

The review page `outline-spec review <change>` renders ([CLI](cli.md#outline-spec-review-change)). The schema's `review` block names the page template, in `templates/`, and its tabs:

```yaml
review:
  template: review.html
  tabs:
    - title: Outline
      from: [outline.md]
    - title: Diagrams
      from: [diagrams.md, design.md]
    - title: Spec changes
      view: spec-changes
```

Each tab has a `title` and exactly one of `from`, change files rendered as Markdown in order, or `view`, a view the CLI computes. `spec-changes` is the one view: every spec the change touches and every requirement it adds, edits, or removes, with live and after-archive text side by side. A file tab skips files the change doesn't have and is left off when it has none. `template` defaults to `review.html`; a forked schema can replace the file. A schema with no `review` block has no review page. `outline-spec schema validate` reports a bad tab or a missing template, and a project can swap the tabs with `review.tabs` in `config.yaml` ([Configuration](configuration.md)).

The template holds one `<script type="application/json" id="outline-spec-review"></script>` that the CLI fills with the page's data: `change`, `generatedAt`, `banner` (`valid`, `errors`, `overlaps`), and `tabs`, each `{ title, kind: "markdown", files: [{ name, markdown }] }` or `{ title, kind: "spec-changes", specs }`.
