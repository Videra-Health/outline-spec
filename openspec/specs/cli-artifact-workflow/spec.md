# cli-artifact-workflow
Define artifact workflow CLI behavior (`status`, `instructions`, `templates`, and setup flows) for scaffolded and active changes.

1. Status Command: The system SHALL display artifact completion status for a change, including scaffolded (empty) changes. > **Fixes bug**: Previously required `proposal.md` to exist via `getActiveChangeIds()`.
  a. Show status with all states: WHEN user runs `openspec status --change <id>` THEN the system displays each artifact with status indicator: `[x]` for completed artifacts `[ ]` for ready artifacts `[-]` for blocked artifacts (with missing dependencies listed)
  b. Status shows completion summary: WHEN user runs `openspec status --change <id>` THEN output includes completion percentage and count (e.g., "2/4 artifacts complete")
  c. Status JSON output: WHEN user runs `openspec status --change <id> --json` THEN the system outputs JSON with changeName, schemaName, isPlanningComplete, isComplete, and artifacts array AND `isPlanningComplete` is true only when every non-skipped planning artifact exists AND a skipped artifact counts as satisfied without being created AND `isComplete` remains a compatibility alias with the same value
  d. Status JSON includes apply requirements: WHEN user runs `openspec status --change <id> --json` THEN the system outputs JSON with: `changeName`, `schemaName`, `isPlanningComplete`, `isComplete`, `artifacts` array `applyRequires`: array of artifact IDs needed for apply phase
  e. Status JSON exposes each artifact's dependency edges: WHEN user runs `openspec status --change <id> --json` THEN every entry in the `artifacts` array includes `requires`: the array of artifact IDs it directly depends on AND `requires` is present regardless of the artifact's status, so a `done` artifact still reports its dependencies (letting agents compute the transitive required set from status alone)
  f. Status lists artifacts in dependency order, declaration order breaking ties: WHEN user runs `openspec status --change <id>` (text or `--json`) THEN artifacts appear in dependency order, so a dependency is never listed after something that requires it AND artifacts that become ready at the same time keep the order the schema declares them, rather than being reordered alphabetically AND the first `ready` entry is therefore the artifact to write next AND a blocked artifact's `missingDeps` uses that same order
  g. Status on scaffolded change: WHEN user runs `openspec status --change <id>` on a change with no artifacts THEN system displays all artifacts with their status AND root artifacts (no dependencies) show as ready `[ ]` AND dependent artifacts show as blocked `[-]`
  h. Missing change parameter: WHEN user runs `openspec status` without `--change` THEN the system displays an error with list of available changes AND includes scaffolded changes (directories without proposal.md)
  i. Unknown change: WHEN user runs `openspec status --change unknown-id` AND directory `openspec/changes/unknown-id/` does not exist THEN the system displays an error listing all available change directories
2. Next Artifact Discovery: The workflow SHALL use `openspec status` output to determine what can be created next, rather than a separate next-command surface.
  a. Discover next artifacts from status output: WHEN a user needs to know which artifact to create next THEN `openspec status --change <id>` identifies ready artifacts with `[ ]` AND the first `[ ]` entry is the schema's recommended next artifact AND no dedicated "next command" is required to continue the workflow
3. Instructions Command: The system SHALL output enriched instructions for creating an artifact, including for scaffolded changes.
  a. Show enriched instructions: WHEN user runs `openspec instructions <artifact> --change <id>` THEN the system outputs: Artifact metadata (ID, output path, description) Template content Dependency status (done/missing) Unlocked artifacts (what becomes available after completion)
  b. Instructions JSON output: WHEN user runs `openspec instructions <artifact> --change <id> --json` THEN the system outputs JSON matching ArtifactInstructions interface
  c. Unknown artifact: WHEN user runs `openspec instructions unknown-artifact --change <id>` THEN the system displays an error listing valid artifact IDs for the schema
  d. Artifact with unmet dependencies: WHEN user requests instructions for a blocked artifact THEN the system displays instructions with a warning about missing dependencies
  e. Instructions on scaffolded change: WHEN user runs `openspec instructions proposal --change <id>` on a scaffolded change THEN system outputs template and metadata for creating the proposal AND does not require any artifacts to already exist
4. Templates Command: The system SHALL show resolved template paths for all artifacts in a schema.
  a. List template paths with default schema: WHEN user runs `openspec templates` THEN the system displays each artifact with its resolved template path using the default schema
  b. List template paths with custom schema: WHEN user runs `openspec templates --schema tdd` THEN the system displays template paths for the specified schema
  c. Templates JSON output: WHEN user runs `openspec templates --json` THEN the system outputs JSON mapping artifact IDs to template paths
  d. Template resolution source: WHEN displaying template paths THEN the system indicates whether each template is from user override or package built-in
5. New Change Command: The system SHALL create new change directories with validation.
  a. Create valid change: WHEN user runs `openspec new change add-feature` THEN the system creates `openspec/changes/add-feature/` directory
  b. Invalid change name: WHEN user runs `openspec new change "Add Feature"` with invalid name THEN the system displays validation error with guidance
  c. Duplicate change name: WHEN user runs `openspec new change existing-change` for an existing change THEN the system displays an error indicating the change already exists
  d. Create with description: WHEN user runs `openspec new change add-feature --description "Add new feature"` THEN the system creates the change directory with description in README.md
6. Schema Selection: The system SHALL support custom schema selection for workflow commands.
  a. Default schema: WHEN user runs workflow commands without `--schema` THEN the system uses the "spec-driven" schema
  b. Custom schema: WHEN user runs `openspec status --change <id> --schema tdd` THEN the system uses the specified schema for artifact graph
  c. Unknown schema: WHEN user specifies an unknown schema THEN the system displays an error listing available schemas
7. Output Formatting: The system SHALL provide consistent output formatting.
  a. Color output: WHEN terminal supports colors THEN status indicators use colors: green (done), yellow (ready), red (blocked)
  b. No color output: WHEN `--no-color` flag is used or NO_COLOR environment variable is set THEN output uses text-only indicators without ANSI colors
  c. Progress indication: WHEN loading change state takes time THEN the system displays a spinner during loading
8. Schema Apply Block: The system SHALL support an `apply` block in schema definitions that controls when and how implementation begins.
  a. Schema with apply block: WHEN a schema defines an `apply` block THEN the system uses `apply.requires` to determine which artifacts must exist before apply AND uses `apply.tracks` to identify the file for progress tracking (or null if none) AND uses `apply.instruction` for guidance shown to the agent
  b. Schema without apply block: WHEN a schema has no `apply` block THEN the system requires all non-skipped artifacts to exist before apply is available AND once those artifacts exist, uses default instruction: "All required artifacts complete. Proceed with implementation."
9. Apply Instructions Command: The system SHALL generate schema-aware apply instructions via `openspec instructions apply`.
  a. Generate apply instructions: WHEN user runs `openspec instructions apply --change <id>` AND all required artifacts (per schema's `apply.requires`) exist THEN the system outputs: `contextFiles` mapping artifact IDs to arrays of concrete paths for all existing artifacts Schema-specific instruction text Progress tracking file path (if `apply.tracks` is set)
  b. Apply blocked by missing artifacts: WHEN user runs `openspec instructions apply --change <id>` AND required artifacts are missing THEN the system indicates apply is blocked AND lists which artifacts must be created first
  c. Apply instructions JSON output: WHEN user runs `openspec instructions apply --change <id> --json` THEN the system outputs JSON with: `contextFiles`: object mapping artifact IDs to arrays of concrete paths for existing artifacts `instruction`: the apply instruction text `tracks`: path to progress file or null `applyRequires`: list of required artifact IDs
10. Tool selection flag: The `artifact-experimental-setup` command SHALL accept a `--tool <tool-id>` flag to specify the target AI tool.
  a. Specify tool via flag: WHEN user runs `openspec artifact-experimental-setup --tool cursor` THEN skill files are generated in `.cursor/skills/` AND command files are generated using Cursor's frontmatter format
  b. Missing tool flag: WHEN user runs `openspec artifact-experimental-setup` without `--tool` THEN the system displays an error requiring the `--tool` flag AND lists valid tool IDs in the error message
  c. Unknown tool ID: WHEN user runs `openspec artifact-experimental-setup --tool unknown-tool` AND the tool ID is not in `AI_TOOLS` THEN the system displays an error listing valid tool IDs
  d. Tool without skillsDir: WHEN user specifies a tool that has no `skillsDir` configured THEN the system displays an error indicating skill generation is not supported for that tool
  e. Tool without command adapter: WHEN user specifies a tool that has `skillsDir` but no command adapter registered THEN skill files are generated successfully AND command generation is skipped with informational message
11. Output messaging: The `openspec init` command SHALL display clear output about what was generated.
  a. Show target tool in output: WHEN initialization creates or refreshes a tool configuration THEN output includes the tool name under `Created:` or `Refreshed:`, respectively
  b. Show generated paths: WHEN initialization generates skills or commands THEN output summarizes their counts and destination directories AND only reports the types enabled by the selected profile and delivery mode
  c. Show skipped commands message: WHEN initialization skips command generation due to a missing adapter THEN output includes message: "Commands skipped for: <tools> (no adapter)" AND `<tools>` lists the skipped tool IDs separated by commas
12. Status JSON provides planning context: The status command SHALL provide machine-readable planning context for changes.
  a. Reporting next steps: WHEN a user runs `openspec status --change <id> --json` THEN the output SHALL include next step guidance for agents AND the guidance SHALL use plain action language
13. Status JSON action context: The status command SHALL expose action context that lets agents act without hardcoded filesystem assumptions.
  a. Repo-local action context: GIVEN the change is repo-local WHEN a user runs `openspec status --change <id> --json` THEN status JSON SHALL preserve existing artifact status behavior AND it SHALL report a repo-local planning home for agents that use action context
14. Instructions use resolved planning paths: Artifact and apply instructions SHALL use resolved planning paths rather than hardcoded repo-local change paths.
  a. Repo-local artifact instructions: GIVEN the change is repo-local WHEN a user runs `openspec instructions <artifact> --change <id> --json` THEN instruction output SHALL preserve existing repo-local paths
15. Workflow skills use CLI artifact context: Generated workflow skills SHALL use OpenSpec CLI output as the source of truth for artifact locations.
  a. Skills inspect status before artifact work: WHEN a generated workflow skill needs to inspect or create artifacts for a change THEN it SHALL instruct the agent to run `openspec status --change <id> --json` AND it SHALL use returned planning context and artifact paths rather than assuming a repo-local change path
  b. Skills use instructions before writing artifacts: WHEN a generated workflow skill is about to create or update an artifact THEN it SHALL instruct the agent to run `openspec instructions <artifact> --change <id> --json` AND it SHALL write to the resolved artifact path returned by the command
