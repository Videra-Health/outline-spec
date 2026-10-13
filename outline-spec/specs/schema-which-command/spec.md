# schema-which-command
Define `outline-spec schema which` behavior for reporting resolved schema source, location, and fallback details.

1. Schema which shows resolution result: The CLI SHALL provide an `outline-spec schema which <name>` command that displays where a schema resolves from.
  a. Schema resolves from project: WHEN user runs `outline-spec schema which my-workflow` and schema exists in `outline-spec/schemas/my-workflow/` THEN system displays source as "project" AND displays full path to schema directory
  b. Schema resolves from user directory: WHEN user runs `outline-spec schema which my-workflow` and schema exists only in user data directory THEN system displays source as "user" AND displays full path including XDG data directory
  c. Schema resolves from package: WHEN user runs `outline-spec schema which spec-driven` and no override exists THEN system displays source as "package" AND displays full path to package's schemas directory
  d. Schema not found: WHEN user runs `outline-spec schema which nonexistent` THEN system displays error that schema was not found AND lists available schemas AND exits with non-zero code
2. Schema which shows shadowing information: The CLI SHALL indicate when a schema shadows another schema at a lower priority level.
  a. Project schema shadows package: WHEN user runs `outline-spec schema which spec-driven` and both project and package have `spec-driven` THEN system displays that project schema is active AND indicates it shadows the package version AND shows path to shadowed package schema
  b. No shadowing: WHEN schema exists only in one location THEN system does not display shadowing information
  c. Multiple shadows: WHEN project schema shadows both user and package schemas THEN system lists all shadowed locations in priority order
3. Schema which outputs JSON format: The CLI SHALL support `--json` flag for machine-readable output.
  a. JSON output basic: WHEN user runs `outline-spec schema which spec-driven --json` THEN system outputs JSON with `name`, `source`, and `path` fields
  b. JSON output with shadows: WHEN user runs `outline-spec schema which spec-driven --json` and schema has shadows THEN JSON includes `shadows` array with `source` and `path` for each shadowed schema
4. Schema which supports list mode: The CLI SHALL support listing all schemas with their resolution sources.
  a. List all schemas: WHEN user runs `outline-spec schema which --all` THEN system displays all available schemas grouped by source AND indicates which schemas shadow others
  b. List in JSON format: WHEN user runs `outline-spec schema which --all --json` THEN system outputs JSON array with resolution info for each schema
