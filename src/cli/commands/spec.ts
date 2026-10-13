import { Command } from 'commander';
import type { ShowOptions } from '../../commands/spec.js';

export function registerSpecCommand(rootProgram: Command) {
  const specCommand = rootProgram
    .command('spec')
    .description('Manage and view outline-spec specifications');

  // Deprecation notice for noun-based commands
  specCommand.hook('preAction', () => {
    console.error('Warning: The "outline-spec spec ..." commands are deprecated. Prefer verb-first commands (e.g., "outline-spec show", "outline-spec validate --specs").');
  });

  specCommand
    .command('show [spec-id]')
    .description('Display a specific specification')
    .option('--json', 'Output as JSON')
    .option('--item <path>', 'Show one item, e.g. "Catalog" or "Catalog.n.ii"')
    .option('--no-interactive', 'Disable interactive prompts')
    .action(async (specId: string | undefined, options: ShowOptions & { noInteractive?: boolean }) => {
      const { specShowCommand } = await import('../../commands/spec.js');
      await specShowCommand(specId, options);
    });

  specCommand
    .command('list')
    .description('List all available specifications')
    .option('--json', 'Output as JSON')
    .option('--long', 'Show id and title with counts')
    .action(async (options: { json?: boolean; long?: boolean }) => {
      const { specListCommand } = await import('../../commands/spec.js');
      await specListCommand(options);
    });

  specCommand
    .command('validate [spec-id]')
    .description('Validate a specification structure')
    .option('--strict', 'Enable strict validation mode')
    .option('--json', 'Output validation report as JSON')
    .option('--no-interactive', 'Disable interactive prompts')
    .action(async (specId: string | undefined, options: { strict?: boolean; json?: boolean; noInteractive?: boolean }) => {
      const { specValidateCommand } = await import('../../commands/spec.js');
      await specValidateCommand(specId, options);
    });

  return specCommand;
}
