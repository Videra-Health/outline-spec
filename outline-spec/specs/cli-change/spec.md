# cli-change
Define `outline-spec change` command behavior for showing, listing, and validating change proposals and deltas.

1. Change Command: The system SHALL provide a `change` command with subcommands for displaying, listing, and validating change proposals.
  a. Show change as JSON: WHEN executing `outline-spec change show update-error --json` THEN parse the markdown change file AND extract change structure and deltas AND output valid JSON to stdout
  b. List all changes: WHEN executing `outline-spec change list` THEN scan the outline-spec/changes directory AND return list of all pending changes AND support JSON output with `--json` flag
  c. Show only requirement changes: WHEN executing `outline-spec change show update-error --requirements-only` THEN display only the requirement changes (ADDED/MODIFIED/REMOVED/RENAMED) AND exclude why and what changes sections
  d. Validate change structure: WHEN executing `outline-spec change validate update-error` THEN parse the change file AND validate against Zod schema AND ensure deltas are well-formed
2. Legacy Compatibility: The system SHALL retain `outline-spec change list` as a deprecated alias for listing active changes and direct users to `outline-spec list`.
  a. Legacy list command: WHEN executing `outline-spec change list` THEN display the current list of active changes on stdout AND write `Warning: "outline-spec change list" is deprecated. Use "outline-spec list".` to stderr
  b. Legacy list with JSON output: WHEN executing `outline-spec change list --json` THEN output the active changes as a JSON array on stdout AND write the deprecation warning to stderr without corrupting the JSON output
  c. Unsupported legacy list flag: WHEN executing `outline-spec change list --all` THEN reject the unknown option with a nonzero exit code
  d. Preferred list command: WHEN executing `outline-spec list` THEN display the current list of active changes without a deprecation warning
3. Interactive show selection: The change show command SHALL support interactive selection when no change name is provided.
  a. Interactive change selection for show: WHEN executing `outline-spec change show` without arguments THEN display an interactive list of available changes AND allow the user to select a change to show AND display the selected change content AND maintain all existing show options (--json, --deltas-only)
  b. Non-interactive fallback keeps current behavior: GIVEN stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0` WHEN executing `outline-spec change show` without a change name THEN do not prompt interactively AND print the existing hint including available change IDs AND set `process.exitCode = 1`
4. Interactive validation selection: The change validate command SHALL support interactive selection when no change name is provided.
  a. Interactive change selection for validation: WHEN executing `outline-spec change validate` without arguments THEN display an interactive list of available changes AND allow the user to select a change to validate AND validate the selected change
  b. Non-interactive fallback keeps current behavior: GIVEN stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0` WHEN executing `outline-spec change validate` without a change name THEN do not prompt interactively AND print the existing hint including available change IDs AND set `process.exitCode = 1`
