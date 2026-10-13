# Outline

## Proposal
The built-in `outline` schema drops the `design` artifact, so a change has only `outline.md`, `diagrams.md`, and `tasks.md`; no workflow writes, reads, or verifies `design.md`.

## Requirements
1. review-page:
  a. Schema review block (patch):
    e. The `outline` schema ships a review block with three tabs: Outline from `outline.md`, Diagrams from ~~`diagrams.md` and `design.md`~~ **`diagrams.md`**, and Spec changes from the `spec-changes` view.
2. outline-spec-verify-skill:
  a. Coherence Verification (patch): The agent SHALL verify that implementation is sensible ~~and follows design decisions~~ **and follows project patterns**.
    a. ~~Design.md adherence check: WHEN verifying coherence AND design.md exists for the change THEN extract key decisions from design.md AND verify implementation follows those decisions AND report any deviations~~
    b. ~~No design.md: WHEN verifying coherence AND no design.md exists THEN skip design adherence check AND report "Design Adherence: Not verified (No design.md to verify against)"~~
    c. ~~Design decision followed: WHEN implementation follows a design decision THEN report as confirmed AND cite evidence from code~~
    d. ~~Design decision violated: WHEN implementation contradicts a design decision THEN report as WARNING AND explain the contradiction AND suggest: either update implementation or update design.md~~
  b. Verification Report Format (patch):
    b. Issue prioritization: WHEN issues are found THEN group and display in priority order: CRITICAL - Must fix before archive (missing implementation, incomplete tasks) WARNING - Should fix (divergence from ~~spec/design~~ **spec**, missing tests) SUGGESTION - Nice to fix (pattern inconsistencies, minor improvements)
  c. Flexible Artifact Handling (patch):
    a. Minimal change (tasks only): WHEN change has only tasks.md THEN verify task completion only AND skip ~~spec and design checks~~ **spec checks** AND note which checks were skipped
    b. ~~Change with specs but no design: WHEN change has tasks.md and delta specs but no design.md THEN verify completeness and correctness AND skip design adherence AND still check code coherence against project patterns~~
    c. Full change (all artifacts): WHEN change has ~~proposal, design, specs, and tasks~~ **proposal, specs, and tasks** THEN perform all verification checks AND cross-reference artifacts for consistency
    d. Unusable or partial artifact evidence: WHEN an artifact cannot be read or lacks usable ~~requirements, scenarios, or design decisions~~ **requirements or scenarios** THEN mark each affected check as not verified with its reason AND continue checks supported by the remaining evidence without treating partial coverage as a fully verified check
3. outline-spec-onboard-skill:
  a. Guided Artifact Creation (patch):
    d. ~~Design creation with narration: WHEN creating design.md THEN agent explains design captures HOW we'll build it AND notes this is where technical decisions and tradeoffs live AND for small changes, acknowledges design may be brief AND creates design based on proposal and specs~~
    e. Tasks creation with narration: WHEN creating tasks.md THEN agent explains tasks break work into checkboxes AND explains these drive the apply phase AND generates task list from ~~design and specs~~ **specs** AND shows tasks and asks if ready to implement
  b. Guided Implementation (patch):
    a. Implementation with narration: WHEN implementing tasks THEN agent announces each task before working on it AND implements the change in the codebase AND occasionally references how ~~specs/design~~ **specs** informed decisions AND marks each task complete as it finishes AND keeps narration light (not over-explaining)
4. docs-agent-instructions:
  a. Behavior-First Spec Authoring Guidance (patch): Agent instruction docs SHALL explicitly teach that specs capture observable behavior contracts, while implementation details belong in ~~design/tasks~~ **tasks**.
    b. Routing detail to the right artifact: WHEN implementation detail is necessary THEN instructions SHALL direct the agent to place it in ~~`design.md` or `tasks.md`~~ **`tasks.md`**, not in the behavioral requirements section of `spec.md`
5. outline-spec-conventions:
  a. Behavior-First Specification Boundary (patch):
    b. Avoiding implementation leakage: WHEN details involve concrete library choices, class/function structure, or execution mechanics THEN those details SHALL be documented in ~~`design.md` or `tasks.md`~~ **`tasks.md`** instead of behavioral requirements
  b. Project Structure (patch):
    a. Initializing project structure: WHEN an outline-spec project is initialized THEN it SHALL have this structure: `outline-spec/ / ├── project.md # Project-specific context / ├── AGENTS.md # AI assistant instructions / ├── specs/ # Current deployed capabilities / │ └── <capability-path>/ # One or more directories for a focused capability / ~~│ ├── spec.md # WHAT and WHY / │ └── design.md # HOW (optional, for established patterns)~~ **│ └── spec.md # WHAT and WHY** / └── changes/ # Proposed changes / ├── [change-name]/ # Descriptive change identifier / │ ├── proposal.md # Why, what, and impact / ~~│ ├── tasks.md # Implementation checklist / │ ├── design.md # Technical decisions (optional)~~ **│ ├── tasks.md # Implementation checklist** / │ └── specs/ # Complete future state / │ └── <capability-path>/ / │ └── spec.md # Clean markdown (no diff syntax) / └── archive/ # Completed changes / └── YYYY-MM-DD-[name]/`
