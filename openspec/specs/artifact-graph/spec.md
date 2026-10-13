# artifact-graph
Define the artifact graph model, dependency validation, and completion-state logic used by schema-driven workflows.

1. Schema Loading: The system SHALL load artifact graph definitions from YAML schema files within schema directories.
  a. Valid schema loaded: WHEN a schema directory contains a valid `schema.yaml` file THEN the system returns an ArtifactGraph with all artifacts and dependencies
  b. Invalid schema rejected: WHEN a schema YAML file is missing required fields THEN the system throws an error with a descriptive message
  c. Cyclic dependencies detected: WHEN a schema contains cyclic artifact dependencies THEN the system throws an error listing the artifact IDs in the cycle
  d. Invalid dependency reference: WHEN an artifact's `requires` array references a non-existent artifact ID THEN the system throws an error identifying the invalid reference
  e. Duplicate artifact IDs rejected: WHEN a schema contains multiple artifacts with the same ID THEN the system throws an error identifying the duplicate
  f. Schema directory not found: WHEN resolving a schema name that has no corresponding directory THEN the system throws an error listing available schemas
2. Build Order Calculation: The system SHALL compute a valid topological build order for artifacts.
  a. Linear dependency chain: WHEN artifacts form a linear chain (A → B → C) THEN getBuildOrder() returns [A, B, C]
  b. Diamond dependency: WHEN artifacts form a diamond (A → B, A → C, B → D, C → D) THEN getBuildOrder() returns A before B and C, and D last
  c. Independent artifacts: WHEN artifacts have no dependencies THEN getBuildOrder() returns them in the order the schema declares them
  d. Simultaneously ready artifacts ordered by declaration: WHEN artifacts become ready at the same time (spec-driven's specs and design both require only proposal) THEN getBuildOrder() returns them in the order the schema's artifacts list declares them, not alphabetically AND an artifact already waiting to be built is not placed ahead of one the schema declares before it
3. State Detection: The system SHALL detect artifact completion state by scanning the filesystem. The system SHALL recognize `generates` values containing `*`, `?`, or `[` as glob patterns. It SHALL also support brace alternatives, brace ranges, and the `@()`, `+()`, `!()`, `*()`, and `?()` extglob forms. An artifact with a glob output SHALL be completed when at least one matching file exists. The system SHALL preserve literal filenames with a bare leading `!`, plain parentheses, or single-element braces when no supported glob syntax is present. Brace expansion SHALL preserve literal brace groups and recognize later and nested expansion groups. Expanded output paths and traversed symbolic links SHALL remain within the change directory.
  a. Simple file exists: WHEN an artifact generates "proposal.md" and the file exists THEN the artifact is marked as completed
  b. Simple file missing: WHEN an artifact generates "proposal.md" and the file does not exist THEN the artifact is not marked as completed
  c. Glob pattern with files: WHEN an artifact generates "specs/*.md" and the specs/ directory contains .md files THEN the artifact is marked as completed
  d. Glob pattern empty: WHEN an artifact generates "specs/*.md" and the specs/ directory is empty or missing THEN the artifact is not marked as completed
  e. Missing change directory: WHEN the change directory does not exist THEN all artifacts are marked as not completed (empty state)
  f. Brace alternatives with matching files: WHEN an artifact generates "review-{api,ui}.md" and "review-api.md" exists THEN the artifact is marked as completed
  g. Brace range after a literal brace group: WHEN an artifact generates "report-{draft}-{1..3}.md" AND "report-{draft}-1.md", "report-{draft}-2.md", "report-{draft}-3.md", and "report-{draft}-4.md" exist THEN its resolved outputs contain exactly the first three files AND the artifact is marked as completed
  h. Later and nested brace alternatives: WHEN an artifact generates "report-{draft}-{{api},ui}.md" and "report-{draft}-{api}.md" exists THEN the artifact is marked as completed
  i. Extglob alternatives with matching files: WHEN an artifact generates "@(proposal|design).md" or "+(proposal|design).md" and "proposal.md" exists THEN the artifact is marked as completed
  j. Negative extglob excludes its alternatives: WHEN an artifact generates "!(proposal|design).md" AND "proposal.md", "design.md", and "notes.md" exist THEN its resolved outputs contain only "notes.md" AND the artifact is marked as completed
  k. Brace or extglob pattern without matching files: WHEN an artifact generates "review-{api,ui}.md" or "@(proposal|design).md" and no matching files exist THEN the artifact is not marked as completed
  l. Literal output names remain literal: WHEN an artifact generates "!review.md", "(proposal|design).md", or "review-{api}.md" THEN completion depends on the existence of a file with that exact name
  m. Brace expansion escapes the change directory: WHEN an artifact generates "{safe,../outside}/review.md" THEN output resolution rejects the expanded path outside the change directory before matching files AND rejection does not depend on whether the outside file exists
  n. Expanded directory pattern reaches an outbound symbolic link: WHEN an artifact generates "content/{safe,linked}/review.md" or "content/@(safe|linked)/review.md" AND "content/linked" is a symbolic link to a directory outside the change directory THEN output resolution rejects traversal through that link even when no matching files exist
4. Ready Artifact Query: The system SHALL identify which artifacts are ready to be created based on dependency completion.
  a. Root artifacts ready initially: WHEN no artifacts are completed THEN getNextArtifacts() returns artifacts with no dependencies
  b. Dependent artifact becomes ready: WHEN an artifact's dependencies are all completed THEN getNextArtifacts() includes that artifact
  c. Blocked artifacts excluded: WHEN an artifact has uncompleted dependencies THEN getNextArtifacts() does not include that artifact
  d. Ready artifacts ordered by declaration: WHEN several artifacts are ready at once THEN getNextArtifacts() returns them in the order the schema declares them, so the first entry is the artifact the schema recommends writing next
5. Completion Check: The system SHALL determine when all artifacts in a graph are complete.
  a. All complete: WHEN all artifacts in the graph are in the completed set THEN isComplete() returns true
  b. Partially complete: WHEN some artifacts in the graph are not completed THEN isComplete() returns false
6. Blocked Query: The system SHALL identify which artifacts are blocked and return all their unmet dependencies.
  a. Artifact blocked by single dependency: WHEN artifact B requires artifact A and A is not complete THEN getBlocked() returns `{ B: ['A'] }`
  b. Artifact blocked by multiple dependencies: WHEN artifact C requires A and B, and only A is complete THEN getBlocked() returns `{ C: ['B'] }`
  c. Artifact blocked by all dependencies: WHEN artifact C requires A and B, and neither is complete THEN getBlocked() returns `{ C: ['A', 'B'] }` AND unmet dependencies are listed in the order the schema declares them
7. Schema Directory Structure: The system SHALL support self-contained schema directories with co-located templates.
  a. Schema with templates: WHEN a schema directory contains `schema.yaml` and `templates/` subdirectory THEN artifacts can reference templates relative to the schema's templates directory
  b. User schema override: WHEN a schema directory exists at `${XDG_DATA_HOME}/openspec/schemas/<name>/` THEN the system uses that directory instead of the built-in
  c. Built-in schema fallback: WHEN no user override exists for a schema THEN the system uses the package built-in schema directory
  d. List available schemas: WHEN listing schemas THEN the system returns schema names from both user and package directories
