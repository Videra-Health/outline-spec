# ai-tool-paths
Define AI tool path metadata used to generate outline-spec skills and commands in tool-specific directories.

1. AIToolOption skillsDir field: The `AIToolOption` interface SHALL include an optional `skillsDir` field for skill generation path configuration.
  a. Interface includes skillsDir field: WHEN a tool entry is defined in `AI_TOOLS` that supports skill generation THEN it SHALL include a `skillsDir` field specifying the project-local base directory (e.g., `.claude`)
  b. Skills path follows Agent Skills spec: WHEN generating skills for a tool with `skillsDir: '.claude'` THEN skills SHALL be written to `<projectRoot>/<skillsDir>/skills/` AND the `/skills` suffix is appended per Agent Skills specification
2. Path configuration for supported tools: The `AI_TOOLS` array SHALL include `skillsDir` for tools that support the Agent Skills specification.
  a. Claude Code paths defined: WHEN looking up the `claude` tool THEN `skillsDir` SHALL be `.claude`
  b. Cursor paths defined: WHEN looking up the `cursor` tool THEN `skillsDir` SHALL be `.cursor`
  c. Devin Desktop paths defined: WHEN looking up the `devin` tool THEN `skillsDir` SHALL be `.devin`
  d. Legacy Windsurf tool ID: WHEN initializing with `outline-spec init --tools windsurf` THEN the `windsurf` alias SHALL resolve to `devin` AND when skill delivery is enabled, skills SHALL be generated under `.devin/skills/`, not `.windsurf/skills/`
  e. Kimi Code paths defined: WHEN looking up the `kimi` tool THEN `skillsDir` SHALL be `.kimi-code` AND outline-spec-managed skills remaining under the legacy `.kimi/skills` directory SHALL be migrated to `.kimi-code/skills` during init and update, preserving user files
  f. Hermes Agent paths defined: WHEN looking up the `hermes` tool THEN `skillsDir` SHALL be `.hermes` AND `setupNote` SHALL explain that project `.hermes/skills` must be added to `skills.external_dirs` in `~/.hermes/config.yaml` AND `outline-spec init` and `outline-spec update` SHALL display the note whenever `hermes` is configured
  g. DeepSeek Harness paths defined: WHEN looking up the `dsh` tool THEN `skillsDir` SHALL be `.dsh` AND auto-detection SHALL require `.dsh` to be a directory AND outline-spec SHALL write dsh skills under `<projectRoot>/.dsh/skills/` using platform-native path joining
  h. Grok Build paths defined: WHEN looking up the `grok` tool THEN `skillsDir` SHALL be `.grok`
  i. Warp paths and detection defined: WHEN looking up the `warp` tool THEN `skillsDir` SHALL be `.warp` AND `detectionPaths` SHALL include `.warp` and `WARP.md`
  j. Warp invokes skills without command files: WHEN generating workflows for the `warp` tool with delivery set to `commands` THEN skills SHALL remain installed in `.warp/skills/` AND no command adapter or command files SHALL be required AND each skill SHALL be directly invocable by its `/outl-*` name
  k. Tools without skillsDir: WHEN a tool has no `skillsDir` defined THEN skill generation SHALL error with message indicating the tool is not supported
3. Cross-platform path handling: The system SHALL handle paths correctly across operating systems.
  a. Path construction on Windows: WHEN constructing skill paths on Windows THEN the system SHALL use `path.join()` for all path construction AND SHALL NOT hardcode forward slashes
  b. Path construction on Unix: WHEN constructing skill paths on macOS or Linux THEN the system SHALL use `path.join()` for consistency
