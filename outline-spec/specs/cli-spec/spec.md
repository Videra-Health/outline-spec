# cli-spec
Define `outline-spec spec` command behavior for listing, showing, and validating source-of-truth specifications.

1. Interactive spec show: The spec show command SHALL support interactive selection when no spec-id is provided.
  a. Interactive spec selection for show: WHEN executing `outline-spec spec show` without arguments THEN display an interactive list of available specs AND allow the user to select a spec to show AND display the selected spec content AND maintain all existing show options (--json, --requirements, --no-scenarios, -r)
  b. Non-interactive fallback keeps current behavior: GIVEN stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0` WHEN executing `outline-spec spec show` without a spec-id THEN do not prompt interactively AND print the existing error message for missing spec-id AND set non-zero exit code
2. Spec Command: The system SHALL provide a `spec` command with subcommands for displaying, listing, and validating specifications.
  a. Show spec as JSON: WHEN executing `outline-spec spec show init --json` THEN parse the markdown spec file AND extract headings and content hierarchically AND output valid JSON to stdout
  b. List all specs: WHEN executing `outline-spec spec list` THEN scan the outline-spec/specs directory AND return list of all available capabilities AND support JSON output with `--json` flag
  c. Filter spec content: WHEN executing `outline-spec spec show init --requirements` THEN display only requirement names and SHALL statements AND exclude scenario content
  d. Validate spec structure: WHEN executing `outline-spec spec validate init` THEN parse the spec file AND validate against Zod schema AND report any structural issues
3. JSON Schema Definition: The system SHALL define Zod schemas that accurately represent the spec structure for runtime validation.
  a. Schema validation: WHEN parsing a spec into JSON THEN validate the structure using Zod schemas AND ensure all required fields are present AND provide clear error messages for validation failures
4. Interactive spec validation: The spec validate command SHALL support interactive selection when no spec-id is provided.
  a. Interactive spec selection for validation: WHEN executing `outline-spec spec validate` without arguments THEN display an interactive list of available specs AND allow the user to select a spec to validate AND validate the selected spec AND maintain all existing validation options (--strict, --json)
  b. Non-interactive fallback keeps current behavior: GIVEN stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0` WHEN executing `outline-spec spec validate` without a spec-id THEN do not prompt interactively AND print the existing error message for missing spec-id AND set non-zero exit code
