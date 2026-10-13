# cli-list
The `outline-spec list` command SHALL provide developers with a quick overview of all active changes in the project, showing their names and task completion status. Developers need a quick way to: See what changes are in progress Identify which changes are ready to archive Understand the overall project evolution status Get a bird's-eye view without opening multiple files This command provides that visibility with minimal effort, following outline-spec's philosophy of simplicity and clarity.

1. Command Execution: The command SHALL scan and analyze either active changes or specs based on the selected mode.
  a. Scanning for changes (default): WHEN `outline-spec list` is executed without flags THEN scan the `outline-spec/changes/` directory for change directories AND exclude the `archive/` subdirectory from results AND parse each change's `tasks.md` file to count task completion
  b. Scanning for specs: WHEN `outline-spec list --specs` is executed THEN scan the `outline-spec/specs/` directory for capabilities AND read each capability's `spec.md` AND parse requirements to compute requirement counts
2. Task Counting: The command SHALL accurately count task completion status using standard markdown checkbox patterns.
  a. Counting tasks in tasks.md: WHEN parsing a `tasks.md` file THEN count tasks matching these patterns: Completed: Lines containing `- [x]` Incomplete: Lines containing `- [ ]` AND calculate total tasks as the sum of completed and incomplete
3. Output Format: The command SHALL display items in a clear, readable table format with mode-appropriate progress or counts.
  a. Displaying change list (default): WHEN displaying the list of changes THEN show a table with columns: Change name (directory name) Task progress (e.g., "3/5 tasks" or "✓ Complete")
  b. Displaying spec list: WHEN displaying the list of specs THEN show a table with columns: Spec id (directory name) Requirement count (e.g., "requirements 12")
4. Flags: The command SHALL accept flags to select the noun being listed.
  a. Selecting specs: WHEN `--specs` is provided THEN list specs instead of changes
  b. Selecting changes: WHEN `--changes` is provided THEN list changes explicitly (same as default behavior)
5. Empty State: The command SHALL provide clear feedback when no items are present for the selected mode.
  a. Handling empty state (changes): WHEN no active changes exist (only archive/ or empty changes/) THEN display: "No active changes found."
  b. Handling empty state (specs): WHEN no specs directory exists or contains no capabilities THEN display: "No specs found."
6. Error Handling: The command SHALL gracefully handle missing files and directories with appropriate messages.
  a. Missing tasks.md file: WHEN a change directory has no `tasks.md` file THEN display the change with "No tasks" status
  b. Missing changes directory: WHEN `outline-spec/changes/` directory doesn't exist THEN display error: "No outline-spec changes directory found. Run 'outline-spec init' first." AND exit with code 1
7. Sorting: The command SHALL maintain consistent ordering of changes for predictable output.
  a. Ordering changes: WHEN displaying multiple changes THEN sort them in alphabetical order by change name
