# change-creation
Provide programmatic utilities for creating and validating OpenSpec change directories.

1. Change Creation: The system SHALL provide a function to create new change directories programmatically.
  a. Create change: WHEN `createChange(projectRoot, 'add-auth')` is called THEN the system creates `openspec/changes/add-auth/` directory
  b. Duplicate change rejected: WHEN `createChange(projectRoot, 'add-auth')` is called and `openspec/changes/add-auth/` already exists THEN the system throws an error indicating the change already exists
  c. Creates parent directories if needed: WHEN `createChange(projectRoot, 'add-auth')` is called and `openspec/changes/` does not exist THEN the system creates the full path including parent directories
  d. Invalid change name rejected: WHEN `createChange(projectRoot, 'Add Auth')` is called with an invalid name THEN the system throws a validation error
2. Change Name Validation: The system SHALL validate change names follow kebab-case conventions.
  a. Valid kebab-case name accepted: WHEN a change name like `add-user-auth` is validated THEN validation returns `{ valid: true }`
  b. Numeric suffixes accepted: WHEN a change name like `add-feature-2` is validated THEN validation returns `{ valid: true }`
  c. Single word accepted: WHEN a change name like `refactor` is validated THEN validation returns `{ valid: true }`
  d. Uppercase characters rejected: WHEN a change name like `Add-Auth` is validated THEN validation returns `{ valid: false, error: "..." }`
  e. Spaces rejected: WHEN a change name like `add auth` is validated THEN validation returns `{ valid: false, error: "..." }`
  f. Underscores rejected: WHEN a change name like `add_auth` is validated THEN validation returns `{ valid: false, error: "..." }`
  g. Special characters rejected: WHEN a change name like `add-auth!` is validated THEN validation returns `{ valid: false, error: "..." }`
  h. Leading hyphen rejected: WHEN a change name like `-add-auth` is validated THEN validation returns `{ valid: false, error: "..." }`
  i. Trailing hyphen rejected: WHEN a change name like `add-auth-` is validated THEN validation returns `{ valid: false, error: "..." }`
  j. Consecutive hyphens rejected: WHEN a change name like `add--auth` is validated THEN validation returns `{ valid: false, error: "..." }`
