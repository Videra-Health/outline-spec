# schema-validate-command
Define `outline-spec schema validate` behavior for validating schema syntax, structure, templates, and dependency graphs.

1. Schema validate checks schema structure: The CLI SHALL provide an `outline-spec schema validate [name]` command that validates schema configuration and reports errors.
  a. Validate specific schema: WHEN user runs `outline-spec schema validate my-workflow` THEN system locates schema using resolution order AND validates `schema.yaml` against the schema Zod type AND displays validation result (valid or list of errors)
  b. Validate all project schemas: WHEN user runs `outline-spec schema validate` without a name THEN system validates all schemas in `outline-spec/schemas/` AND displays results for each schema AND exits with non-zero code if any schema is invalid
  c. Schema not found: WHEN user runs `outline-spec schema validate nonexistent` THEN system displays error that schema was not found AND exits with non-zero code
2. Schema validate checks YAML syntax: The CLI SHALL report YAML parsing errors with line numbers when possible.
  a. Invalid YAML syntax: WHEN user runs `outline-spec schema validate my-workflow` and `schema.yaml` has syntax errors THEN system displays YAML parse error with line number AND exits with non-zero code
  b. Valid YAML but missing required fields: WHEN `schema.yaml` is valid YAML but missing `name` field THEN system displays Zod validation error for missing required field AND identifies the specific missing field
3. Schema validate checks template existence: The CLI SHALL verify that all template files referenced by artifacts exist.
  a. Missing template file: WHEN artifact references `template: proposal.md` but file doesn't exist in schema directory THEN system reports error: "Template file 'proposal.md' not found for artifact 'proposal'" AND exits with non-zero code
  b. All templates exist: WHEN all artifact templates exist THEN system reports that templates are valid AND template existence is included in validation summary
4. Schema validate checks dependency graph: The CLI SHALL verify that artifact dependencies form a valid directed acyclic graph.
  a. Valid dependency graph: WHEN artifact dependencies form a valid DAG (e.g., tasks → specs → proposal) THEN system reports dependency graph is valid
  b. Circular dependency detected: WHEN artifact A requires B and artifact B requires A THEN system reports circular dependency error AND identifies the artifacts involved in the cycle AND exits with non-zero code
  c. Unknown dependency reference: WHEN artifact requires `nonexistent-artifact` THEN system reports error: "Artifact 'x' requires unknown artifact 'nonexistent-artifact'" AND exits with non-zero code
5. Schema validate outputs JSON format: The CLI SHALL support `--json` flag for machine-readable validation results.
  a. JSON output for valid schema: WHEN user runs `outline-spec schema validate my-workflow --json` and schema is valid THEN system outputs JSON with `valid: true`, `name`, and `path` fields
  b. JSON output for invalid schema: WHEN user runs `outline-spec schema validate my-workflow --json` and schema has errors THEN system outputs JSON with `valid: false` and `issues` array AND each issue includes `level`, `path`, and `message` fields AND format matches existing `outline-spec validate` output structure
6. Schema validate supports verbose mode: The CLI SHALL support `--verbose` flag for detailed validation information.
  a. Verbose output shows all checks: WHEN user runs `outline-spec schema validate my-workflow --verbose` THEN system displays each validation check as it runs AND shows pass/fail status for: YAML parsing, Zod validation, template existence, dependency graph
