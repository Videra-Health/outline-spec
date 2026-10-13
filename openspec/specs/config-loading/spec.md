# config-loading
Define how `openspec/config.yaml` is discovered, parsed, validated, and exposed to callers with safe fallbacks.

1. Load project config from openspec/config.yaml: The system SHALL read and parse the project configuration file located at `openspec/config.yaml` relative to the project root.
  a. Valid config file exists: WHEN `openspec/config.yaml` exists with valid YAML content THEN system parses the file and returns a ProjectConfig object
  b. Config file does not exist: WHEN `openspec/config.yaml` does not exist THEN system returns null without error
  c. Config file has invalid YAML syntax: WHEN `openspec/config.yaml` contains malformed YAML THEN system logs a warning message and returns null
  d. Config file has valid YAML but invalid schema: WHEN `openspec/config.yaml` contains valid YAML that fails Zod schema validation THEN system logs a warning message with validation details and returns null
2. Support .yml file extension alias: The system SHALL accept both `.yaml` and `.yml` file extensions for the config file.
  a. Config file uses .yml extension: WHEN `openspec/config.yml` exists and `openspec/config.yaml` does not exist THEN system reads from `openspec/config.yml`
  b. Both .yaml and .yml exist: WHEN both `openspec/config.yaml` and `openspec/config.yml` exist THEN system prefers `openspec/config.yaml`
3. Use resilient field-by-field parsing: The system SHALL parse each config field independently, collecting valid fields and warning about invalid ones without rejecting the entire config.
  a. Schema field is valid: WHEN config contains `schema: "spec-driven"` THEN schema field is included in returned config
  b. Schema field is missing: WHEN config lacks the `schema` field THEN no warning is logged (field is optional at parse level)
  c. Schema field is empty string: WHEN config contains `schema: ""` THEN warning is logged and schema field is not included in returned config
  d. Schema field is invalid type: WHEN config contains `schema: 123` (number instead of string) THEN warning is logged and schema field is not included in returned config
  e. Context field is valid: WHEN config contains `context: "Tech stack: TypeScript"` THEN context field is included in returned config
  f. Context field is invalid type: WHEN config contains `context: 123` (number instead of string) THEN warning is logged and context field is not included in returned config
  g. Rules field has valid structure: WHEN config contains `rules: { proposal: ["Rule 1"], specs: ["Rule 2"] }` THEN rules field is included in returned config with valid rules
  h. Rules field has non-array value for artifact: WHEN config contains `rules: { proposal: "not an array", specs: ["Valid"] }` THEN warning is logged for proposal, but specs rules are still included in returned config
  i. Rules array contains non-string elements: WHEN config contains `rules: { proposal: ["Valid rule", 123, ""] }` THEN only "Valid rule" is included, warning logged about invalid elements
  j. Mix of valid and invalid fields: WHEN config contains valid schema, invalid context type, valid rules THEN config is returned with schema and rules fields, warning logged about context
4. Enforce context size limit: The system SHALL reject context fields exceeding 50KB and log a warning.
  a. Context within size limit: WHEN config contains context of 1KB THEN context is included in returned config
  b. Context at size limit: WHEN config contains context of exactly 50KB THEN context is included in returned config
  c. Context exceeds size limit: WHEN config contains context of 51KB THEN warning is logged with size and limit, context field is not included in returned config
5. Defer artifact ID validation to instruction loading: The system SHALL NOT validate artifact IDs in rules during config load time. Validation happens during instruction loading when schema is known.
  a. Config with rules is loaded: WHEN config contains `rules: { unknownartifact: [...] }` THEN config is loaded successfully without validation errors
  b. Validation happens at instruction load time: WHEN instructions are loaded for any artifact and config has unknown artifact IDs in rules THEN warnings are emitted about unknown artifact IDs (see rules-injection spec for details)
6. Gracefully handle config errors without halting: The system SHALL continue operation with default values when config loading or parsing fails.
  a. Config parse failure during command execution: WHEN config file has syntax errors and user runs `openspec new change` THEN command executes using default schema "spec-driven"
  b. Warning is visible to user: WHEN config loading fails THEN system outputs warning message to stderr with details about the failure
