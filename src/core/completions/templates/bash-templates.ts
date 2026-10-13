/**
 * Static template strings for Bash completion scripts.
 * These are Bash-specific helper functions that never change.
 */

export const BASH_DYNAMIC_HELPERS = `# Dynamic completion helpers

_outline_spec_complete_changes() {
  local changes
  changes=$(outline-spec __complete changes 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$changes" -- "$cur"))
}

_outline_spec_complete_specs() {
  local specs
  specs=$(outline-spec __complete specs 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$specs" -- "$cur"))
}

_outline_spec_complete_items() {
  local items
  items=$(outline-spec __complete changes 2>/dev/null | cut -f1; outline-spec __complete specs 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$items" -- "$cur"))
}

_outline_spec_complete_schemas() {
  local schemas
  schemas=$(outline-spec __complete schemas 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$schemas" -- "$cur"))
}`;
