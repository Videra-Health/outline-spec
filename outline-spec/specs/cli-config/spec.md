# cli-config
Provide a user-friendly CLI interface for viewing and modifying global outline-spec configuration settings without manually editing JSON files.

1. Command Structure: The config command SHALL provide subcommands for all configuration operations.
  a. Available subcommands: WHEN user executes `outline-spec config --help` THEN display available subcommands: `path` - Show config file location `list` - Show all current settings `get <key>` - Get a specific value `set <key> <value>` - Set a value `unset <key>` - Remove a key (revert to default) `reset` - Reset configuration to defaults `edit` - Open config in editor
2. Config Path: The config command SHALL display the config file location.
  a. Show config path: WHEN user executes `outline-spec config path` THEN print the absolute path to the config file AND exit with code 0
3. Config List: The config command SHALL display all current configuration values.
  a. List config in human-readable format: WHEN user executes `outline-spec config list` THEN display all config values in YAML-like format AND show nested objects with indentation
  b. List config as JSON: WHEN user executes `outline-spec config list --json` THEN output the complete config as valid JSON AND output only JSON (no additional text)
4. Config Get: The config command SHALL retrieve specific configuration values.
  a. Get top-level key: WHEN user executes `outline-spec config get <key>` with a valid top-level key THEN print the raw value only (no labels or formatting) AND exit with code 0
  b. Get nested key with dot notation: WHEN user executes `outline-spec config get featureFlags.someFlag` THEN traverse the nested structure using dot notation AND print the value at that path
  c. Get non-existent key: WHEN user executes `outline-spec config get <key>` with a key that does not exist THEN print nothing (empty output) AND exit with code 1
  d. Get object value: WHEN user executes `outline-spec config get <key>` where the value is an object THEN print the object as JSON
5. Config Set: The config command SHALL set configuration values with automatic type coercion.
  a. Set string value: WHEN user executes `outline-spec config set <key> <value>` AND value does not match boolean or number patterns THEN store value as a string AND display confirmation message
  b. Set boolean value: WHEN user executes `outline-spec config set <key> true` or `outline-spec config set <key> false` THEN store value as boolean (not string) AND display confirmation message
  c. Set numeric value: WHEN user executes `outline-spec config set <key> <value>` AND value is a valid number (integer or float) THEN store value as number (not string)
  d. Force string with --string flag: WHEN user executes `outline-spec config set <key> <value> --string` THEN store value as string regardless of content AND this allows storing literal "true" or "123" as strings
  e. Set nested key: WHEN user executes `outline-spec config set featureFlags.newFlag true` THEN create intermediate objects if they don't exist AND set the value at the nested path
6. Config Unset: The config command SHALL remove configuration overrides.
  a. Unset existing key: WHEN user executes `outline-spec config unset <key>` AND the key exists in the config THEN remove the key from the config file AND the value reverts to its default AND display confirmation message
  b. Unset non-existent key: WHEN user executes `outline-spec config unset <key>` AND the key does not exist in the config THEN display message indicating key was not set AND exit with code 0
7. Config Reset: The config command SHALL reset configuration to defaults.
  a. Reset all with confirmation: WHEN user executes `outline-spec config reset --all` THEN prompt for confirmation before proceeding AND if confirmed, delete the config file or reset to defaults AND display confirmation message
  b. Reset all with -y flag: WHEN user executes `outline-spec config reset --all -y` THEN reset without prompting for confirmation
  c. Reset without --all flag: WHEN user executes `outline-spec config reset` without `--all` THEN display error indicating `--all` is required AND exit with code 1
8. Config Edit: The config command SHALL open the config file in the user's editor.
  a. Open editor successfully: WHEN user executes `outline-spec config edit` AND `$EDITOR` or `$VISUAL` environment variable is set THEN open the config file in that editor AND create the config file with defaults if it doesn't exist AND wait for the editor to close before returning
  b. No editor configured: WHEN user executes `outline-spec config edit` AND neither `$EDITOR` nor `$VISUAL` is set THEN display error message suggesting to set `$EDITOR` AND exit with code 1
9. Profile Configuration Flow: The `outline-spec config profile` command SHALL provide an action-first interactive flow that allows users to modify delivery and workflow settings independently.
  a. Current profile summary appears first: WHEN user runs `outline-spec config profile` in an interactive terminal THEN display a current-state header with: current delivery value workflow count with profile label (core or custom)
  b. Action-first menu offers skippable paths: WHEN user runs `outline-spec config profile` interactively THEN the first prompt SHALL offer: `Delivery and workflows` `Delivery only` `Workflows only` `Keep current settings (exit)`
  c. Delivery prompt marks current selection: WHEN delivery selection is shown in `outline-spec config profile` THEN the currently configured delivery option SHALL include `[current]` in its label AND that value SHALL be preselected by default
  d. No-op exits without saving or apply prompt: WHEN user chooses `Keep current settings (exit)` OR makes selections that do not change effective config values THEN the command SHALL print `No config changes.` AND SHALL NOT write config changes AND SHALL NOT ask to apply updates to the current project
  e. No-op warns when current project is out of sync: WHEN `outline-spec config profile` exits with `No config changes.` inside an outline-spec project AND project files are out of sync with the current global profile/delivery THEN display a non-blocking warning that global config is not yet applied to this project AND include guidance to run `outline-spec update` to sync project files
  f. Apply prompt is gated on actual changes: WHEN config values were changed and saved AND current directory is an outline-spec project THEN prompt `Apply changes to this project now?` AND if confirmed, run `outline-spec update` for the current project
10. Key Naming Convention: The config command SHALL use camelCase keys matching the JSON structure.
  a. Keys match JSON structure: WHEN accessing configuration keys via CLI THEN use camelCase matching the actual JSON property names AND support dot notation for nested access (e.g., `featureFlags.someFlag`)
11. Schema Validation: The config command SHALL validate configuration writes against the config schema using zod, while rejecting unknown keys for `config set` unless explicitly overridden.
  a. Unknown key rejected by default: WHEN user executes `outline-spec config set someFutureKey 123` THEN display a descriptive error message indicating the key is invalid AND do not modify the config file AND exit with code 1
  b. Unknown key accepted with override: WHEN user executes `outline-spec config set someFutureKey 123 --allow-unknown` THEN the value is saved successfully AND exit with code 0
  c. Invalid feature flag value rejected: WHEN user executes `outline-spec config set featureFlags.someFlag notABoolean` THEN display a descriptive error message AND do not modify the config file AND exit with code 1
12. Reserved Scope Flag: The config command SHALL reserve the `--scope` flag for future extensibility.
  a. Scope flag defaults to global: WHEN user executes any config command without `--scope` THEN operate on global configuration (default behavior)
  b. Project scope not yet implemented: WHEN user executes `outline-spec config --scope project <subcommand>` THEN display error message: "Project-local config is not yet implemented" AND exit with code 1
