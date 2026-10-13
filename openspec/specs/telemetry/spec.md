# telemetry
This spec defines how OpenSpec collects anonymous usage telemetry to help improve the tool. It governs the `src/telemetry/` module, which handles PostHog integration, privacy-preserving event design, user opt-out mechanisms, and first-run notice display. The spec ensures telemetry is minimal, transparent, and respects user privacy.

1. Command execution tracking: The system SHALL send a `command_executed` event to PostHog when any CLI command executes, including only the command name and OpenSpec version as properties.
  a. Standard command execution: WHEN a user runs any openspec command THEN the system sends a `command_executed` event with `command` and `version` properties
  b. Subcommand execution: WHEN a user runs a nested command like `openspec change apply` THEN the system sends a `command_executed` event with the full command path (e.g., `change:apply`)
2. Privacy-preserving event design: The system SHALL NOT include command arguments, file paths, project names, spec content, error messages, or IP addresses in telemetry events.
  a. Command with arguments: WHEN a user runs `openspec init my-project --force` THEN the telemetry event contains only `command: "init"` and `version: "<version>"` without arguments
  b. IP address exclusion: WHEN the system sends a telemetry event THEN the event explicitly sets `$ip: null` to prevent IP tracking
3. Environment variable opt-out: The system SHALL disable telemetry when `OPENSPEC_TELEMETRY=0` or `DO_NOT_TRACK=1` environment variables are set.
  a. OPENSPEC_TELEMETRY opt-out: WHEN `OPENSPEC_TELEMETRY=0` is set in the environment THEN the system sends no telemetry events
  b. DO_NOT_TRACK opt-out: WHEN `DO_NOT_TRACK=1` is set in the environment THEN the system sends no telemetry events
  c. Environment variable takes precedence: WHEN the user has previously used the CLI (config exists) AND the user sets `OPENSPEC_TELEMETRY=0` THEN telemetry is disabled regardless of config state
4. CI environment auto-disable: The system SHALL automatically disable telemetry when `CI=true` environment variable is detected.
  a. CI environment detection: WHEN `CI=true` is set in the environment THEN the system sends no telemetry events
  b. CI with explicit enable: WHEN `CI=true` is set AND `OPENSPEC_TELEMETRY=1` is explicitly set THEN telemetry remains disabled (CI takes precedence for privacy)
5. First-run telemetry notice: The system SHALL display a one-line telemetry disclosure notice on the first command execution, before any telemetry is sent.
  a. First command execution: WHEN a user runs their first openspec command AND telemetry is enabled THEN the system displays: "Note: OpenSpec collects anonymous usage stats. Opt out: OPENSPEC_TELEMETRY=0"
  b. Subsequent command execution: WHEN a user has already seen the notice (noticeSeen: true in config) THEN the system does not display the notice
  c. Notice before telemetry: WHEN displaying the first-run notice THEN the notice appears before any telemetry event is sent
6. Anonymous user identification: The system SHALL generate a random UUID as an anonymous identifier on first telemetry send, stored in global config.
  a. First telemetry event: WHEN the first telemetry event is sent AND no anonymousId exists in config THEN the system generates a random UUID v4 and stores it in config
  b. Persistent identity: WHEN a user runs multiple commands across sessions THEN the same anonymousId is used for all events
  c. Lazy generation with opt-out: WHEN a user opts out before running any command THEN no anonymousId is ever generated or stored
7. Immediate event sending: The system SHALL send telemetry events immediately without batching, using `flushAt: 1` and `flushInterval: 0` configuration.
  a. Event transmission timing: WHEN a command executes THEN the telemetry event is sent immediately, not queued for batch transmission
8. Graceful shutdown: The system SHALL call `posthog.shutdown()` before CLI exit to ensure pending events are flushed.
  a. Normal exit: WHEN a command completes successfully THEN the system awaits `shutdown()` before exiting
  b. Error exit: WHEN a command fails with an error THEN the system still awaits `shutdown()` before exiting
9. Silent failure handling: The system SHALL silently ignore telemetry failures without affecting CLI functionality.
  a. Network failure: WHEN the telemetry request fails due to network error THEN the CLI command completes normally without error message
  b. PostHog outage: WHEN PostHog service is unavailable THEN the CLI command completes normally without error message
  c. Shutdown failure: WHEN `shutdown()` fails or times out THEN the CLI exits normally without error message
