# rules-injection
Define how per-artifact rules from project config are injected into generated instructions with deterministic formatting and validation.

1. Inject rules only for matching artifact: The system SHALL inject rules from config into instructions only when the artifact ID matches a key in the rules object.
  a. Rules exist for the artifact: WHEN loading instructions for "proposal" and config has `rules: { proposal: ["Rule 1", "Rule 2"] }` THEN instruction output includes rules section with both rules
  b. No rules for the artifact: WHEN loading instructions for "design" and config has `rules: { proposal: [...] }` THEN instruction output does not include `<rules>` tags
  c. Rules object is undefined: WHEN config omits the rules field or rules is undefined THEN instruction output does not include `<rules>` tags for any artifact
  d. Rules array is empty for artifact: WHEN config has `rules: { proposal: [] }` THEN instruction output does not include `<rules>` tags
2. Format rules with XML-style tags and bullet list: The system SHALL wrap rules in `<rules>` tags with each rule as a bulleted list item.
  a. Single rule for artifact: WHEN config has `rules: { proposal: ["Include rollback plan"] }` THEN instruction output includes `<rules>\n- Include rollback plan\n</rules>\n\n`
  b. Multiple rules for artifact: WHEN config has `rules: { proposal: ["Rule 1", "Rule 2", "Rule 3"] }` THEN instruction output includes each rule as separate bullet point
  c. Rules appear after context and before template: WHEN instructions are generated with both context and rules THEN order is `<context>` then `<rules>` then `<template>`
3. Preserve rule text exactly as provided: The system SHALL inject rule text without modification, escaping, or interpretation.
  a. Rule contains markdown: WHEN rule includes markdown like "Use Given/When/Then format" THEN markdown is preserved in the injected content
  b. Rule contains special characters: WHEN rule includes characters like `<`, `>`, quotes THEN characters are preserved exactly as written
  c. Rule is multi-line string: WHEN rule text contains line breaks THEN line breaks are preserved within the bullet point
4. Support multiple artifacts with different rules: The system SHALL allow different rule sets for different artifacts in the same config.
  a. Multiple artifacts have rules: WHEN config has `rules: { proposal: ["P1"], specs: ["S1", "S2"], tasks: ["T1"] }` THEN proposal instructions show only ["P1"], specs show only ["S1", "S2"], tasks show only ["T1"]
  b. Some artifacts have rules, others do not: WHEN config has rules for proposal and specs only THEN design and tasks instructions have no `<rules>` section
5. Rules are additive to schema guidance: The system SHALL add config rules to the schema's built-in artifact instruction, not replace it.
  a. Artifact has schema instruction and config rules: WHEN artifact has built-in instruction from schema and config provides rules THEN final instruction contains both schema guidance and config rules
  b. Rules provide additional constraints: WHEN schema says "create proposal" and config rules say "include rollback plan" THEN agent sees both the schema template and the additional rule
6. Validate artifact IDs during instruction loading: The system SHALL validate artifact IDs in rules against the schema when instructions are loaded and emit warnings for unknown IDs.
  a. All artifact IDs are valid: WHEN instructions loaded and config has `rules: { proposal: [...], specs: [...] }` for schema with those artifacts THEN no validation warnings are emitted
  b. Unknown artifact ID in rules: WHEN instructions loaded and config has `rules: { unknownartifact: [...] }` THEN warning emitted: "Unknown artifact ID in rules: 'unknownartifact'. Valid IDs for schema 'spec-driven': design, proposal, specs, tasks"
  c. Multiple unknown artifact IDs: WHEN instructions loaded and config has multiple unknown artifact IDs THEN separate warning emitted for each unknown artifact ID
  d. Validation warnings shown once per session: WHEN instructions loaded multiple times in same CLI session THEN each unique validation warning is shown only once (cached)
