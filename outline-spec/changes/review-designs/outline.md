# Outline

## Proposal
A change that adds or changes something a person sees can carry visual designs as self-contained HTML pages, and the review page shows each one running in a Designs tab. A change without designs has no Designs tab. Schemas gain optional artifacts so a change without designs still reads as fully planned.

## Requirements
1. review-page:
  a. Tabs (patch):
    a. A file tab renders the listed change files ~~as Markdown~~**, Markdown files as Markdown and HTML files as running pages (see Designs)**, in the listed order, skipping any file the change does not have.
    f. A `from` entry may be a glob, as `designs/*.html`, matching files inside the change folder in file-name order, written with `/` on every platform and shown with `/` on the page, so a tab reads the same on macOS, Linux, and Windows.
  b. Schema review block (patch):
    e. The `outline` schema ships a review block with ~~three~~ **four** tabs: Outline from `outline.md`, Diagrams from `diagrams.md`, **Designs from `designs/*.html`,** and Spec changes from the `spec-changes` view.
  c. Publishing from workflows (patch):
    b. Update renders the page after a revision that changes `outline.md` **or a design**, and skips it when only other artifacts changed.
  d. Designs: A change that adds or changes something a person sees can carry visual designs, which the review page shows as working pages.
    a. The `outline` schema has an optional `designs` artifact (see `artifact-graph`), written only when the change has a visual surface, as one self-contained HTML page per design in the change's `designs/` folder.
    b. Each design shows the full window width in its own frame, labeled with its file name, running its own styles and scripts as it would on its own.
    c. A design's scripts cannot read or change the review page around it.
    d. A frame fills the window's height below the tab bar and scrolls on its own, and a Full screen button beside its file name shows it full screen.
    e. A change with no designs shows no Designs tab (see Tabs).
    f. Designs are planning files, so archive deletes them with the change folder and they never reach the live specs.
2. artifact-graph:
  a. Schema Loading (patch):
    g. Optional artifact: WHEN an artifact sets `optional: true` THEN the graph loads it as optional AND an artifact without the field is required
  b. Ready Artifact Query (patch):
    e. Optional dependency: WHEN an artifact requires an optional artifact that is not completed THEN that dependency counts as met, so the artifact is ready once its other dependencies are AND getBlocked() never lists the optional one
  c. Completion Check (patch):
    c. Optional artifacts: WHEN every required artifact is completed and an optional one is not THEN isComplete() returns true
3. cli-artifact-workflow:
  a. Status Command (patch):
    a. Show status with all states: WHEN user runs `outline-spec status --change <id>` THEN the system displays each artifact with status indicator: `[x]` for completed artifacts `[ ]` for ready artifacts `[-]` for blocked artifacts (with missing dependencies listed) **AND an optional artifact's line ends with `(optional)`**
    b. Status shows completion summary: WHEN user runs `outline-spec status --change <id>` THEN output includes completion percentage and count (e.g., "2/4 artifacts complete") **AND the count leaves out optional artifacts that don't exist, so a change with every required artifact and no optional one reads `3/3`**
    c. Status JSON output: WHEN user runs `outline-spec status --change <id> --json` THEN the system outputs JSON with changeName, schemaName, isPlanningComplete, isComplete, and artifacts array AND `isPlanningComplete` is true only when every ~~non-skipped~~ **required** planning artifact exists AND ~~a skipped~~ **an optional** artifact counts as satisfied without being created AND **each optional artifact's entry carries `optional: true` and a required one's has no `optional` field AND** `isComplete` remains a compatibility alias with the same value
  b. Next Artifact Discovery (patch):
    a. Discover next artifacts from status output: WHEN a user needs to know which artifact to create next THEN `outline-spec status --change <id>` identifies ready artifacts with `[ ]` AND the first `[ ]` entry **that isn't optional** is the schema's recommended next artifact AND **the next step never names an optional artifact, and names apply once every required artifact exists, AND** no dedicated "next command" is required to continue the workflow
  c. Schema Apply Block (patch):
    b. Schema without apply block: WHEN a schema has no `apply` block THEN the system requires all ~~non-skipped~~ **required** artifacts to exist before apply is available AND once those artifacts exist, uses default instruction: "All required artifacts complete. Proceed with implementation."
4. cli-view:
  a. Active Change Workflow Status (patch):
    a. Workflow states: WHEN an active change's workflow can be loaded THEN show the schema name and artifacts in dependency order AND mark existing artifact outputs with `✓`, ready artifacts with `→`, blocked artifacts with no symbol, and ~~skipped artifacts with `(skipped)`~~ **optional artifacts that don't exist with `(optional)` in place of a symbol** AND treat an existing tasks artifact as done even when its implementation checklist is unfinished

## Out of Scope
1. Image files as designs
2. Comparing a design against the built UI
