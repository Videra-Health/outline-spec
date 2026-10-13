# Context Store As Standalone outline-spec Root Spec

## Outcome

`context-store setup` and `context-store register` treat a context store as a
normal standalone outline-spec root with a thin identity file.

After setup or registration, the durable planning state lives in normal
outline-spec artifacts: config, specs, changes, and archived changes. The
`.outline-spec-store/` directory remains identity or local registry metadata, not a
separate planning model.

The existing beta context-store, initiative, and workspace shapes are not a
compatibility contract. This slice ignores old beta files unless they are the
thin `.outline-spec-store/store.yaml` identity file used by the new model.

## User Experience

A human or agent can create or register a standalone outline-spec repo and then see
the same root shape they would expect from a normal outline-spec project:

```text
context-store-root/
  .outline-spec-store/
    store.yaml
  outline-spec/
    config.yaml
    specs/
    changes/
      archive/
```

The command output and help point users toward normal outline-spec specs and
changes, not initiatives, workspace-owned planning, generated agent files, or
collection-specific state.

In plain terms:

```text
context store = normal outline-spec root + .outline-spec-store/store.yaml
```

## Scope

In scope:

- Root shape parity for `context-store setup` and `context-store register`.
- Default config creation during setup.
- Safe handling of missing, empty, Git-only, and existing healthy outline-spec-root
  directories.
- Registering cloned or existing context stores on the local machine.
- Turning a healthy standalone outline-spec root into a context store only after
  clear user confirmation.
- Separate `context-store doctor` reporting for outline-spec-root health.
- Tests that verify setup, register, doctor, idempotency for the new model, and
  unsafe-folder behavior.

Out of scope:

- Store selectors for core lifecycle commands.
- Creating initiative links or initiative collections.
- Workspace-owned planning behavior.
- Agent/tool installation, generated commands, migration, or onboarding flows.
- Clone, pull, push, sync, branch, worktree, dashboard, apply, verify, or archive
  orchestration.
- Migrating, preserving, or cleaning up old beta context-store, initiative, or
  workspace file shapes.
- Public terminology cleanup or broad documentation rewrites.

## Acceptance Criteria

### Setup Ensures A Normal Root

`context-store setup` creates or preserves a healthy outline-spec root. A healthy
outline-spec root contains `outline-spec/`, a config file
(`outline-spec/config.yaml` or `outline-spec/config.yml`), `outline-spec/specs/`,
`outline-spec/changes/`, and `outline-spec/changes/archive/`.

When setup creates a config file, it creates `outline-spec/config.yaml` with the
default `spec-driven` schema.

#### Scenario: Setting Up A Missing Or Empty Store

- **GIVEN** a missing directory or empty directory
- **WHEN** the user runs `context-store setup`
- **THEN** outline-spec leaves the directory with `.outline-spec-store/store.yaml`
- **AND** `outline-spec/config.yaml` exists with the default `spec-driven` schema
- **AND** `outline-spec/specs/`, `outline-spec/changes/`, and
  `outline-spec/changes/archive/` exist
- **AND** JSON output reports the relative paths created by the operation in
  `created_files`

#### Scenario: Accepting A Git-Only Directory

- **GIVEN** an existing directory that contains only `.git/`
- **WHEN** the user runs `context-store setup`
- **THEN** outline-spec treats the directory as a safe fresh store
- **AND** outline-spec preserves `.git/`
- **AND** outline-spec creates the context-store identity metadata and healthy
  outline-spec root

#### Scenario: Preserving An Existing Healthy Root

- **GIVEN** an initialized standalone outline-spec root
- **WHEN** the user runs `context-store setup`
- **THEN** outline-spec preserves existing config, specs, changes, and archived
  changes
- **AND** outline-spec creates `.outline-spec-store/store.yaml` when identity metadata
  is missing

#### Scenario: Creating Default Config Non-Interactively

- **GIVEN** setup runs in non-interactive or JSON mode without tool selection
- **AND** no `outline-spec/config.yaml` or `outline-spec/config.yml` exists
- **WHEN** setup completes successfully
- **THEN** `outline-spec/config.yaml` exists with the default `spec-driven` schema

#### Scenario: Preserving Existing Config

- **GIVEN** `outline-spec/config.yaml` or `outline-spec/config.yml` already exists
- **WHEN** setup completes successfully
- **THEN** outline-spec preserves the existing config file

#### Scenario: Rejecting Unsafe Folders

- **GIVEN** an arbitrary non-empty unmarked folder
- **WHEN** the user runs `context-store setup`
- **THEN** outline-spec rejects it without treating it as a store root
- **AND** it does not create context-store metadata or outline-spec-root files in
  that folder

#### Scenario: Rejecting Nested Git Setup Paths

- **GIVEN** a setup target path inside another Git repository
- **WHEN** the user runs `context-store setup`
- **THEN** outline-spec rejects the path as unsafe for this slice
- **AND** it does not create context-store metadata or outline-spec-root files in
  that path

### Register Requires An Existing Root

`context-store register` remembers a local clone or existing local root on this
machine. It does not initialize planning files.

#### Scenario: Registering A Cloned Context Store

- **GIVEN** an existing healthy outline-spec root with `.outline-spec-store/store.yaml`
- **WHEN** the user runs `context-store register`
- **THEN** outline-spec registers it
- **AND** outline-spec writes local registry state only when needed
- **AND** outline-spec does not create or rewrite outline-spec planning files

#### Scenario: Turning A Healthy Root Into A Context Store

- **GIVEN** an existing healthy outline-spec root without `.outline-spec-store/store.yaml`
- **WHEN** the user runs `context-store register`
- **THEN** outline-spec asks whether to turn the root into the named context store
- **AND** if the user confirms, outline-spec creates `.outline-spec-store/store.yaml`
  and registers the store locally
- **AND** if the user declines, outline-spec does not write metadata or registry
  state

#### Scenario: Refusing Unconfirmed Non-Interactive Conversion

- **GIVEN** an existing healthy outline-spec root without `.outline-spec-store/store.yaml`
- **WHEN** the user runs `context-store register` in non-interactive or JSON mode
  without explicit confirmation
- **THEN** outline-spec refuses to convert the root into a context store
- **AND** outline-spec does not write metadata or registry state

#### Scenario: Refusing Arbitrary Directories

- **GIVEN** a missing directory, partial outline-spec root, or existing directory
  that is not a healthy outline-spec root
- **WHEN** the user runs `context-store register`
- **THEN** outline-spec refuses to register it
- **AND** outline-spec does not silently initialize it as an outline-spec root
- **AND** outline-spec does not create `.outline-spec-store/store.yaml` or local
  registry state

### Metadata Stays Thin

Context-store metadata remains identity or registry metadata only.

#### Scenario: Avoiding Old Planning Models In This Slice

- **WHEN** setup or register completes
- **THEN** outline-spec does not create initiative links, initiative collections, or
  workspace-owned planning state
- **AND** outline-spec does not install generated agent skills, slash commands, or
  tool configuration files into the store
- **AND** outline-spec does not run full `outline-spec init`, tool detection, legacy
  cleanup, migration, skill generation, command generation, or onboarding flows

#### Scenario: Ignoring Old Beta Files

- **GIVEN** a directory contains old beta files such as `initiatives/`,
  `.outline-spec-workspace/`, `workspace.yaml`, `AGENTS.md`, `.codex/`, `.claude/`,
  or `.cursor/`
- **WHEN** setup or register succeeds for the new model
- **THEN** outline-spec ignores those files for this slice
- **AND** outline-spec does not migrate, upgrade, delete, or repair those files
- **AND** outline-spec does not treat those files as proof that the folder is a
  healthy outline-spec root or valid context store
- **AND** outline-spec does not preserve old beta planning behavior as a requirement

#### Scenario: Validating Thin Identity Metadata

- **GIVEN** `.outline-spec-store/store.yaml` exists
- **WHEN** setup, register, or doctor reads it
- **THEN** outline-spec treats it as the context-store identity file
- **AND** the file must match the thin identity shape for the new model
- **AND** invalid or mismatched identity metadata is reported as a metadata issue

### Doctor Separates Root Health

`context-store doctor` reports outline-spec-root health separately from
context-store metadata and Git health. In JSON output, each store includes a
distinct `outline_spec_root` section.

#### Scenario: Reporting outline-spec Root Health

- **WHEN** doctor inspects a context store
- **THEN** the report covers the `outline-spec/` directory,
  `outline-spec/config.yaml` or `outline-spec/config.yml`, `outline-spec/specs/`,
  `outline-spec/changes/`, and `outline-spec/changes/archive/`
- **AND** root-health issues are distinguishable from metadata and Git issues in
  human and JSON output
- **AND** JSON output includes `outline_spec_root` separately from `metadata` and
  `git`
- **AND** doctor does not mutate files

#### Scenario: Reporting Without Repairing

- **GIVEN** a registered context store has valid metadata and Git state but is
  missing `outline-spec/changes/archive/`
- **WHEN** doctor inspects the context store
- **THEN** doctor reports the missing archive directory under `outline_spec_root`
- **AND** doctor does not create `outline-spec/changes/archive/`

### Safety, Not Beta Compatibility

This slice protects user-authored files and repeatable command behavior. It does
not treat previous beta context-store behavior as a stable surface.

#### Scenario: Repeating Setup Or Register

- **GIVEN** the same context-store id and path are already registered and the
  outline-spec root is healthy
- **WHEN** setup or register runs again for that root
- **THEN** outline-spec reports that the store is already registered, already exists,
  or has nothing to change
- **AND** outline-spec does not mutate files just to prove the command worked
- **AND** JSON output reports no newly created files for the no-op operation
- **AND** outline-spec does not duplicate registry entries

#### Scenario: Preserving User Edits Across Reruns

- **GIVEN** the user edits `outline-spec/config.yaml` or `outline-spec/config.yml` after
  setup
- **WHEN** setup or register runs again for that root
- **THEN** outline-spec preserves the edited config file
- **AND** outline-spec preserves user-authored specs, changes, archived changes, and
  valid identity metadata

#### Scenario: Preserving User Content On Failure

- **GIVEN** setup or register creates files or directories during an operation
- **WHEN** the operation fails before completion
- **THEN** outline-spec removes only files and empty directories it created during
  that operation
- **AND** outline-spec preserves unrelated user content
