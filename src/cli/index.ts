import { Command, Option } from 'commander';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, promises as fs } from 'fs';
import { AI_TOOLS, TOOL_ID_ALIASES } from '../core/config.js';
import type { ArchiveOptions } from '../core/archive.js';
import { registerSpecCommand } from './commands/spec.js';
import { registerConfigCommand } from './commands/config.js';
import { registerSchemaCommand } from './commands/schema.js';
import { registerStoreCommand } from './commands/store.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerContextCommand } from './commands/context.js';
import { registerWorksetCommand } from './commands/workset.js';
import { DEFAULT_SCHEMA } from '../commands/workflow/default-schema.js';
import type {
  StatusOptions,
  InstructionsOptions,
  TemplatesOptions,
  SchemasOptions,
  NewChangeOptions,
} from '../commands/workflow/index.js';
import { COMMON_FLAGS } from '../core/completions/shared-flags.js';

// Startup cost: every command's implementation, and the packages it uses,
// loads with `await import()` inside its action. This module and
// ./commands/ only define commands (names, options, help), so `--version`,
// `--help`, and each command load no other command's implementation.

const STORE_OPTION_DESCRIPTION = COMMON_FLAGS.store.description;

// Deliberate rejection path: --store-path stays registered (hidden) so the
// resolver can explain that registering the path is the supported route,
// instead of Commander emitting a generic unknown-option error (or, for
// `show`, silently ignoring it via allowUnknownOption).
function hiddenStorePathOption(): Option {
  return new Option(
    '--store-path <path>',
    'Not supported; register the path with "outline-spec store register <path>" and use --store <id>'
  ).hideHelp();
}

async function failWithError(
  error: unknown,
  json?: { enabled: boolean | undefined; payload?: Record<string, unknown>; fallbackCode?: string }
): Promise<void> {
  // The agent contract: every --json failure leaves exactly one JSON
  // document on stdout (the command's null-shape plus a status array).
  if (json?.enabled) {
    const { asStatus } = await import('../commands/shared-output.js');
    console.log(
      JSON.stringify(
        { ...(json.payload ?? {}), status: [asStatus(error, json.fallbackCode ?? 'command_error')] },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }
  const { default: ora } = await import('ora');
  ora().fail(`Error: ${(error as Error).message}`);
  // Resolution and store errors carry a pasteable fix - never drop it.
  const fix = (error as { diagnostic?: { fix?: string } }).diagnostic?.fix;
  if (fix) {
    console.error(`Fix: ${fix}`);
  }
  process.exitCode = process.exitCode ?? 1;
}

const program = new Command();
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

/**
 * Get the full command path for nested commands.
 * For example: 'change show' -> 'change:show'
 */
export function getCommandPath(command: Command): string {
  const names: string[] = [];
  let current: Command | null = command;

  while (current) {
    const name = current.name();
    // Skip the root 'outline-spec' command
    if (name && name !== 'outline-spec') {
      names.unshift(name);
    }
    current = current.parent;
  }

  return names.join(':') || 'outline-spec';
}

/**
 * True when the executing command asked for JSON output — used to defer the
 * first-run completions tip so a JSON run carries no incidental output.
 *
 * `--json` reaches commands three ways, so a single parsed option is not enough:
 * - declared on the leaf (`outline-spec status --json`) → `opts().json`
 * - declared on a parent group and read via globals (`outline-spec workset --json list`)
 *   → `optsWithGlobals().json`
 * - a residual arg on a permissive group that never declares the option
 *   (`outline-spec store --json`, which detects it from `command.args`) → `args`
 */
export function isJsonRun(command: Command): boolean {
  return (
    command.optsWithGlobals().json === true ||
    command.args.includes('--json')
  );
}

/**
 * True for the commands that exist to serve shell completions: the user-facing
 * `outline-spec completion ...` group and the hidden `__complete` resolver that
 * generated completion scripts call on every Tab press. Tipping either about
 * completions is noise, and `__complete` would burn the one-shot tip invisibly.
 */
export function isCompletionRun(commandPath: string): boolean {
  return commandPath.split(':')[0] === 'completion' || commandPath === '__complete';
}

/**
 * True when the first-run completions tip must be deferred rather than shown.
 *
 * Deferring keeps the tip unconsumed, so it still reaches the user on a later
 * run that can actually carry it. All three cases are runs nobody would read a
 * hint from: JSON output, the completion machinery itself, and a stderr that is
 * not a terminal — pipes and the agent-driven runs that dominate this CLI's
 * usage would otherwise burn the user's one-shot tip into a log nobody opens.
 */
export function shouldDeferCompletionTip(command: Command, stderrIsTty: boolean): boolean {
  return isJsonRun(command) || isCompletionRun(getCommandPath(command)) || !stderrIsTty;
}

program
  .name('outline-spec')
  .description('Outline specs for AI-assisted development')
  .version(version);

// Global options
program.option('--no-color', 'Disable color output');

program
  .command('version')
  .description('Report the installed outline-spec version')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    if (options.json) {
      console.log(JSON.stringify({ schemaVersion: 1, version }, null, 2));
      return;
    }
    console.log(`outline-spec ${version}`);
  });

program.hook('preAction', (thisCommand) => {
  if (thisCommand.opts().color === false) {
    process.env.NO_COLOR = '1';
  }
});

program.hook('postAction', async (_thisCommand, actionCommand) => {
  // Show the first-run shell-completions tip (on stderr, so piped stdout stays
  // clean). postAction, not preAction: the tip trails the command's own output
  // instead of pushing an error message or `init`'s setup summary down the
  // screen. Deferred — not consumed — whenever nobody would read it: JSON runs,
  // `outline-spec completion ...`, and a stderr that is not a terminal (agents and
  // pipes would otherwise silently burn the user's one-shot tip).
  const { maybeShowCompletionTip } = await import('../core/completion-tip.js');
  await maybeShowCompletionTip({
    silent: shouldDeferCompletionTip(actionCommand, Boolean(process.stderr.isTTY)),
  });
});

const availableToolIds = AI_TOOLS
  .filter((tool) => tool.skillsDir || tool.globalSkillsDir)
  .map((tool) => tool.value);
const toolAliasNote = Object.entries(TOOL_ID_ALIASES)
  .map(([retired, current]) => `${retired} (now ${current})`)
  .join(', ');
const toolsOptionDescription = `Configure AI tools non-interactively. Use "all", "none", or a comma-separated list of: ${availableToolIds.join(', ')}. Also accepted: ${toolAliasNote}`;

program
  .command('init [path]')
  .description('Initialize outline-spec in your project')
  .option('--tools <tools>', toolsOptionDescription)
  .option('--language <language>', 'Write new outline-spec artifacts in this language')
  .option('--profile <profile>', 'Override global config profile (core or custom)')
  .option('--no-animation', 'Show a static welcome screen instead of the animated one')
  .option('--copilot-cloud', 'Set up GitHub Copilot cloud coding-agent files without prompting')
  .option('--no-copilot-cloud', 'Skip GitHub Copilot cloud coding-agent files without prompting')
  .action(async (targetPath = '.', options?: { tools?: string; language?: string; profile?: string; animation?: boolean; copilotCloud?: boolean }) => {
    try {
      // Validate that the path is a valid directory
      const resolvedPath = path.resolve(targetPath);

      try {
        const stats = await fs.stat(resolvedPath);
        if (!stats.isDirectory()) {
          throw new Error(`Path "${targetPath}" is not a directory`);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // Directory doesn't exist, but we can create it
          console.log(`Directory "${targetPath}" doesn't exist, it will be created.`);
        } else if (error.message && error.message.includes('not a directory')) {
          throw error;
        } else {
          throw new Error(`Cannot access path "${targetPath}": ${error.message}`);
        }
      }

      const { InitCommand } = await import('../core/init.js');
      const initCommand = new InitCommand({
        tools: options?.tools,
        language: options?.language,
        profile: options?.profile,
        animation: options?.animation,
        copilotCloud: options?.copilotCloud,
      });
      await initCommand.execute(targetPath);
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

// Hidden alias: 'experimental' -> 'init' for backwards compatibility
program
  .command('experimental', { hidden: true })
  .description('Alias for init (deprecated)')
  .option('--tool <tool-id>', 'Target AI tool (maps to --tools)')
  .option('--no-interactive', 'Disable interactive prompts')
  .action(async (options?: { tool?: string; noInteractive?: boolean }) => {
    try {
      console.log('Note: "outline-spec experimental" is deprecated. Use "outline-spec init" instead.');
      const { InitCommand } = await import('../core/init.js');
      const initCommand = new InitCommand({
        tools: options?.tool,
        interactive: options?.noInteractive === true ? false : undefined,
      });
      await initCommand.execute('.');
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

program
  .command('update [path]')
  .description('Update outline-spec instruction files')
  .option('--force', 'Force update even when tools are up to date')
  .action(async (targetPath = '.', options?: { force?: boolean }) => {
    try {
      const { UpdateCommand } = await import('../core/update.js');
      await new UpdateCommand({ force: options?.force }).execute(targetPath);
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List items (changes by default). Use --specs to list specs.')
  .option('--specs', 'List specs instead of changes')
  .option('--changes', 'List changes explicitly (default)')
  .option('--sort <order>', 'Sort order: "recent" (default) or "name"', 'recent')
  .option('--json', 'Output as JSON (for programmatic use)')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (options?: { specs?: boolean; changes?: boolean; sort?: string; json?: boolean; store?: string; storePath?: string }) => {
    try {
      const [{ resolveRootForCommand, toRootOutput }, { ListCommand }] = await Promise.all([
        import('../core/root-selection.js'),
        import('../core/list.js'),
      ]);
      const root = await resolveRootForCommand(options ?? {}, {
        json: options?.json,
        failurePayload: options?.specs ? { specs: [], root: null } : { changes: [], root: null },
        // Preserve the cwd fallback for pre-config.yaml projects. The resolver
        // still lets a registered/default store take precedence over it.
        allowImplicitRoot: existsSync(path.join(process.cwd(), 'outline-spec', 'project.md')),
      });
      if (!root) {
        return;
      }
      const listCommand = new ListCommand();
      const mode: 'changes' | 'specs' = options?.specs ? 'specs' : 'changes';
      const sort = options?.sort === 'name' ? 'name' : 'recent';
      await listCommand.execute(root.path, mode, {
        sort,
        json: options?.json,
        ...(options?.json ? { root: toRootOutput(root) } : {}),
      });
    } catch (error) {
      await failWithError(error, {
        enabled: options?.json,
        payload: options?.specs ? { specs: [], root: null } : { changes: [], root: null },
        fallbackCode: 'list_error',
      });
      process.exit(1);
    }
  });

program
  .command('view')
  .description('Display an interactive dashboard of specs and changes')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (options?: { store?: string; storePath?: string }) => {
    try {
      // Implicit cwd fallback stays enabled so `view` keeps accepting the same
      // directories as `list`/`status` — notably pre-config.yaml `outline-spec/`
      // dirs. ViewCommand still reports a missing outline-spec/ directory itself.
      const [{ resolveRootForCommand }, { ViewCommand }] = await Promise.all([
        import('../core/root-selection.js'),
        import('../core/view.js'),
      ]);
      const root = await resolveRootForCommand(options ?? {});
      if (!root) {
        return;
      }
      const viewCommand = new ViewCommand();
      await viewCommand.execute(root.path);
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

// Change command with subcommands
const changeCmd = program
  .command('change')
  .description('Manage outline-spec change proposals');

// Deprecation notice for noun-based commands
changeCmd.hook('preAction', () => {
  console.error('Warning: The "outline-spec change ..." commands are deprecated. Prefer verb-first commands (e.g., "outline-spec list", "outline-spec validate --changes").');
});

changeCmd
  .command('show [change-name]')
  .description("Show a change's outline.md")
  .option('--json', 'Output as JSON')
  .option('--diff', 'Show the spec text archiving the change would produce')
  .option('--no-interactive', 'Disable interactive prompts')
  .action(async (changeName?: string, options?: { json?: boolean; diff?: boolean; noInteractive?: boolean }) => {
    try {
      const { ChangeCommand } = await import('../commands/change.js');
      const changeCommand = new ChangeCommand();
      await changeCommand.show(changeName, options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

changeCmd
  .command('list')
  .description('List all active changes (DEPRECATED: use "outline-spec list" instead)')
  .option('--json', 'Output as JSON')
  .option('--long', 'Show id and title with counts')
  .action(async (options?: { json?: boolean; long?: boolean }) => {
    try {
      console.error('Warning: "outline-spec change list" is deprecated. Use "outline-spec list".');
      const { ChangeCommand } = await import('../commands/change.js');
      const changeCommand = new ChangeCommand();
      await changeCommand.list(options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

changeCmd
  .command('validate [change-name]')
  .description('Validate a change proposal')
  .option('--strict', 'Enable strict validation mode')
  .option('--json', 'Output validation report as JSON')
  .option('--no-interactive', 'Disable interactive prompts')
  .action(async (changeName?: string, options?: { strict?: boolean; json?: boolean; noInteractive?: boolean }) => {
    try {
      const { ChangeCommand } = await import('../commands/change.js');
      const changeCommand = new ChangeCommand();
      // process.exit() would skip postAction (the completions tip) on a routine failed validation.
      await changeCommand.validate(changeName, options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

function addArchiveOptions(command: Command): Command {
  return command
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--dry-run', 'Print the resulting spec text and write nothing')
    .option('--json', 'Output as JSON (non-interactive)')
    .option('--store <id>', STORE_OPTION_DESCRIPTION)
    .addOption(hiddenStorePathOption());
}

addArchiveOptions(
  program
    .command('archive [change-name]')
    .description("Apply a change's outline to the specs and remove the change")
).action(async (changeName: string | undefined, options: ArchiveOptions) => {
  try {
    const { ArchiveCommand } = await import('../core/archive.js');
    await new ArchiveCommand().execute(changeName, options);
  } catch (error) {
    await failWithError(error);
    process.exit(1);
  }
});

addArchiveOptions(
  program
    .command('sync [change-name]')
    .description("Apply a change's spec edits now and keep the change open")
).action(async (changeName: string | undefined, options: ArchiveOptions) => {
  try {
    const { SyncCommand } = await import('../core/sync.js');
    await new SyncCommand().execute(changeName, options);
  } catch (error) {
    await failWithError(error);
    process.exit(1);
  }
});

program
  .command('pending')
  .description('List what each open change touches and where changes overlap')
  .option('--json', 'Output as JSON')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (options: { json?: boolean; store?: string; storePath?: string }) => {
    try {
      const { pendingCommand } = await import('../commands/pending.js');
      await pendingCommand(options);
    } catch (error) {
      await failWithError(error, { enabled: options.json, payload: { changes: [], overlaps: [] }, fallbackCode: 'pending_error' });
      process.exit(1);
    }
  });

program
  .command('relabel <spec>')
  .description("Close gaps in a spec's labels (refused while a change edits it)")
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (spec: string, options: { store?: string; storePath?: string }) => {
    try {
      const { relabelCommand } = await import('../commands/relabel.js');
      await relabelCommand(spec, options);
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

program
  .command('migrate-specs')
  .description('Convert old-format specs (### Requirement: / #### Scenario:) to outlines')
  .option('--dry-run', 'Print the converted specs and write nothing')
  .option('--json', 'Output as JSON')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (options: { dryRun?: boolean; json?: boolean; store?: string; storePath?: string }) => {
    try {
      const { migrateSpecsCommand } = await import('../commands/migrate-specs.js');
      await migrateSpecsCommand(options);
    } catch (error) {
      await failWithError(error, { enabled: options.json, payload: { specs: [] }, fallbackCode: 'migrate_specs_error' });
      process.exit(1);
    }
  });

program
  .command('adopt [path]')
  .description('Convert an OpenSpec project: move openspec/ to outline-spec/ and convert its specs to outlines')
  .option('--dry-run', 'Report what would change and write nothing')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options: { dryRun?: boolean; json?: boolean }) => {
    try {
      const { adoptCommand } = await import('../commands/adopt.js');
      await adoptCommand(targetPath, options);
    } catch (error) {
      await failWithError(error, { enabled: options.json, fallbackCode: 'adopt_error' });
      process.exit(1);
    }
  });

registerSpecCommand(program);
registerConfigCommand(program);
registerSchemaCommand(program);
registerStoreCommand(program);
registerDoctorCommand(program);
registerContextCommand(program);
registerWorksetCommand(program);

// Top-level validate command
program
  .command('validate [item-name]')
  .description('Validate changes and specs')
  .option('--all', 'Validate all changes and specs')
  .option('--changes', 'Validate all changes')
  .option('--specs', 'Validate all specs')
  .option('--report <full|findings>', 'Select bulk report content: full|findings; combine with --json for JSON')
  .option('--type <type>', 'Specify item type when ambiguous: change|spec')
  .option('--strict', 'Enable strict validation mode')
  .option('--json', 'Output validation results as JSON')
  .option('--concurrency <n>', 'Max concurrent validations (defaults to env OUTLINE_SPEC_CONCURRENCY or 6)')
  .option('--no-interactive', 'Disable interactive prompts')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (itemName?: string, options?: { all?: boolean; changes?: boolean; specs?: boolean; report?: string; type?: string; strict?: boolean; json?: boolean; noInteractive?: boolean; concurrency?: string; store?: string; storePath?: string }) => {
    try {
      const { ValidateCommand } = await import('../commands/validate.js');
      const validateCommand = new ValidateCommand();
      await validateCommand.execute(itemName, options);
    } catch (error) {
      await failWithError(error, { enabled: options?.json, fallbackCode: 'validate_error' });
      process.exit(1);
    }
  });

// Top-level show command
program
  .command('show [item-name]')
  .description('Show a change or spec')
  .option('--json', 'Output as JSON')
  .option('--type <type>', 'Specify item type when ambiguous: change|spec')
  .option('--no-interactive', 'Disable interactive prompts')
  .option('--diff', 'Show the spec text archiving the change would produce (change)')
  .option('--item <path>', 'Show one item or table row, e.g. "Catalog", "Catalog.n.ii", or "Catalog.overdrive" (spec)')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  // Explicit registration required: allowUnknownOption would otherwise
  // silently swallow --store-path instead of rejecting it deliberately.
  .addOption(hiddenStorePathOption())
  // allow unknown options to pass-through to underlying command implementation
  .allowUnknownOption(true)
  .action(async (itemName?: string, options?: { json?: boolean; type?: string; noInteractive?: boolean; [k: string]: any }) => {
    try {
      const { ShowCommand } = await import('../commands/show.js');
      const showCommand = new ShowCommand();
      await showCommand.execute(itemName, options ?? {});
    } catch (error) {
      await failWithError(error, { enabled: options?.json, fallbackCode: 'show_error' });
      process.exit(1);
    }
  });

// Feedback command
program
  .command('feedback <message>')
  .description('Submit feedback about outline-spec')
  .option('--body <text>', 'Detailed description for the feedback')
  .action(async (message: string, options?: { body?: string }) => {
    try {
      const { FeedbackCommand } = await import('../commands/feedback.js');
      const feedbackCommand = new FeedbackCommand();
      await feedbackCommand.execute(message, options);
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

// Completion command with subcommands
const completionCmd = program
  .command('completion')
  .description('Manage shell completions for outline-spec CLI');

completionCmd
  .command('generate [shell]')
  .description('Generate completion script for a shell (outputs to stdout)')
  .action(async (shell?: string) => {
    try {
      const { CompletionCommand } = await import('../commands/completion.js');
      const completionCommand = new CompletionCommand();
      await completionCommand.generate({ shell });
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

completionCmd
  .command('install [shell]')
  .description('Install completion script for a shell')
  .option('--verbose', 'Show detailed installation output')
  .action(async (shell?: string, options?: { verbose?: boolean }) => {
    try {
      const { CompletionCommand } = await import('../commands/completion.js');
      const completionCommand = new CompletionCommand();
      await completionCommand.install({ shell, verbose: options?.verbose });
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

completionCmd
  .command('uninstall [shell]')
  .description('Uninstall completion script for a shell')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (shell?: string, options?: { yes?: boolean }) => {
    try {
      const { CompletionCommand } = await import('../commands/completion.js');
      const completionCommand = new CompletionCommand();
      await completionCommand.uninstall({ shell, yes: options?.yes });
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

// Hidden command for machine-readable completion data
program
  .command('__complete <type>', { hidden: true })
  .description('Output completion data in machine-readable format (internal use)')
  .action(async (type: string) => {
    try {
      const { CompletionCommand } = await import('../commands/completion.js');
      const completionCommand = new CompletionCommand();
      await completionCommand.complete({ type });
    } catch (error) {
      // Silently fail for graceful shell completion experience
      process.exitCode = 1;
    }
  });

// ═══════════════════════════════════════════════════════════
// Workflow Commands (formerly experimental)
// ═══════════════════════════════════════════════════════════

// Status command
program
  .command('status')
  .description('Display artifact completion status for a change')
  .option('--change <id>', 'Change name to show status for')
  .option('--all', 'Show status for all active changes')
  .option('--schema <name>', 'Schema override (auto-detected from config.yaml)')
  .option('--json', 'Output as JSON')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (options: StatusOptions) => {
    try {
      const { statusCommand } = await import('../commands/workflow/status.js');
      await statusCommand(options);
    } catch (error) {
      await failWithError(error, {
        enabled: options.json,
        // The batch null-shape; the single-change failure shape is
        // pre-existing contract and stays payload-free.
        payload: options.all
          ? (await import('../commands/workflow/status.js')).BATCH_STATUS_FAILURE_PAYLOAD
          : undefined,
        fallbackCode: 'change_error',
      });
      process.exit(1);
    }
  });

// Instructions command
program
  .command('instructions [artifact]')
  .description('Output enriched instructions for artifacts, apply, or archive')
  .option('--change <id>', 'Change name')
  .option('--schema <name>', 'Schema override (auto-detected from config.yaml)')
  .option('--json', 'Output as JSON')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (artifactId: string | undefined, options: InstructionsOptions) => {
    try {
      const { applyInstructionsCommand, archiveInstructionsCommand, instructionsCommand } =
        await import('../commands/workflow/instructions.js');
      // Workflow instruction surfaces are reserved command branches, not artifacts.
      if (artifactId === 'apply') {
        await applyInstructionsCommand(options);
      } else if (artifactId === 'archive') {
        await archiveInstructionsCommand(options);
      } else {
        await instructionsCommand(artifactId, options);
      }
    } catch (error) {
      await failWithError(error, { enabled: options.json, fallbackCode: 'change_error' });
      process.exit(1);
    }
  });

// Templates command
program
  .command('templates')
  .description('Show resolved template paths for all artifacts in a schema')
  .option('--schema <name>', `Schema to use (default: ${DEFAULT_SCHEMA})`)
  .option('--json', 'Output as JSON mapping artifact IDs to template paths')
  .action(async (options: TemplatesOptions) => {
    try {
      const { templatesCommand } = await import('../commands/workflow/templates.js');
      await templatesCommand(options);
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

// Schemas command
program
  .command('schemas')
  .description('List available workflow schemas with descriptions')
  .option('--json', 'Output as JSON (for agent use)')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  .action(async (options: SchemasOptions) => {
    try {
      const { schemasCommand } = await import('../commands/workflow/schemas.js');
      await schemasCommand(options);
    } catch (error) {
      await failWithError(error, {
        enabled: options.json,
        payload: { schemas: [], root: null },
        fallbackCode: 'schemas_error',
      });
      process.exit(1);
    }
  });

// New command group with change subcommand
const newCmd = program.command('new').description('Create new items');

newCmd
  .command('change <name>')
  .description('Create a new change directory')
  .option('--description <text>', 'Description to add to README.md')
  .option('--goal <text>', 'Optional goal metadata to store with the change')
  .option('--schema <name>', `Workflow schema to use (default: ${DEFAULT_SCHEMA})`)
  .option('--json', 'Output as JSON')
  .option('--store <id>', STORE_OPTION_DESCRIPTION)
  .addOption(hiddenStorePathOption())
  // Removed options kept registered (hidden) so users get a deliberate
  // explanation instead of a generic unknown-option error.
  .addOption(new Option('--initiative <id>', 'No longer supported').hideHelp())
  .addOption(new Option('--areas <names>', 'No longer supported').hideHelp())
  .action(async (name: string, options: NewChangeOptions) => {
    try {
      const { newChangeCommand } = await import('../commands/workflow/new-change.js');
      await newChangeCommand(name, options);
    } catch (error) {
      await failWithError(error);
      process.exit(1);
    }
  });

export { program };

export function runCli(argv = process.argv): void {
  program.parse(argv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
