import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  getGlobalDataDir,
  registerStore,
} from '../../src/core/index.js';
import { writeStoreMetadataState } from '../../src/core/store/foundation.js';
import { runCLI, type RunCLIResult } from '../helpers/run-cli.js';
import { cleanupTempPath } from '../helpers/temp-cleanup.js';
import { writeSpec } from '../helpers/outline-spec-fixtures.js';

const VALID_OUTLINE = `## Proposal
Billing needs work.

## Requirements
1. billing: Bills customers.
  a. Billing: The system creates bills.
`;

// A new requirement with no sentence: the outline can't land.
const INVALID_OUTLINE = `## Proposal
Billing needs work.

## Requirements
1. billing: Bills customers.
  a. Billing:
`;

// Patches a requirement in a spec that does not exist yet.
const PATCH_MISSING_SPEC_OUTLINE = `## Proposal
Billing needs work.

## Requirements
1. billing:
  a. Billing (patch): ~~The system creates bills.~~ **The system creates bills monthly.**
`;

function outlineSpec(name: string, purpose: string, requirement: string): string {
  return `# ${name}\n${purpose}\n\n1. ${requirement}\n`;
}

describe('store root selection for normal commands', () => {
  let tempDir: string;
  let appRepo: string;
  let storeRoot: string;
  let globalDataDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-store-root-selection-'))
    );
    env = {
      XDG_DATA_HOME: path.join(tempDir, 'data'),
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      OPEN_SPEC_INTERACTIVE: '0',
    };
    globalDataDir = getGlobalDataDir({ env });
    appRepo = path.join(tempDir, 'app-repo');
    fs.mkdirSync(appRepo, { recursive: true });
    storeRoot = await registerStoreFixture('team-context');
  });

  afterEach(() => {
    cleanupTempPath(tempDir);
  });

  function createOutlineSpecRoot(rootDir: string): void {
    fs.mkdirSync(path.join(rootDir, 'outline-spec', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'outline-spec', 'changes'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'outline-spec', 'config.yaml'), 'schema: outline\n');
  }

  async function registerStoreFixture(id: string): Promise<string> {
    const root = path.join(tempDir, 'stores', id);
    createOutlineSpecRoot(root);
    await registerStore({ id, localPath: root, globalDataDir });
    return fs.realpathSync.native(root);
  }

  function createChange(
    rootDir: string,
    name: string,
    options: { outline?: string; tasksDone?: boolean } = {}
  ): string {
    const changeDir = path.join(rootDir, 'outline-spec', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      options.tasksDone === false ? '- [ ] Task 1\n' : '- [x] Task 1\n'
    );
    fs.writeFileSync(path.join(changeDir, 'outline.md'), options.outline ?? VALID_OUTLINE);
    return changeDir;
  }

  function parseJson(result: RunCLIResult): any {
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(
        `Could not parse JSON.\nCommand: ${result.command}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n${String(error)}`
      );
    }
  }

  function expectNoLocalOutlineSpec(): void {
    expect(fs.existsSync(path.join(appRepo, 'outline-spec'))).toBe(false);
  }

  it.each(['local', 'store', 'declared', 'global_default'] as const)(
    'discovers and reads capabilities in the %s root using the generated guidance (#1689)',
    async (source) => {
      const selectedRoot = source === 'local' ? appRepo : storeRoot;
      const storeArgs = source === 'store' ? ['--store', 'team-context'] : [];
      if (source === 'local' || source === 'store') {
        createOutlineSpecRoot(appRepo);
      } else if (source === 'declared') {
        fs.mkdirSync(path.join(appRepo, 'outline-spec'), { recursive: true });
        fs.writeFileSync(path.join(appRepo, 'outline-spec', 'config.yaml'), 'store: team-context\n');
      } else {
        const configDir = path.join(tempDir, 'config', 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ defaultStore: 'team-context' }));
      }

      const specFor = (id: string) => outlineSpec(id, 'Bills from the selected root.', 'Billing: The system bills.');
      writeSpec(selectedRoot, 'billing', specFor('billing'));
      writeSpec(selectedRoot, 'billing/invoices', specFor('billing/invoices'));
      createChange(selectedRoot, 'billing');
      if (source === 'store') {
        // A missing --store on the read must not silently return local content.
        writeSpec(appRepo, 'billing', specFor('billing').replace('system bills', 'system uses local billing'));
        writeSpec(appRepo, 'local-only', specFor('local-only'));
      }

      const changes = await runCLI(['list', '--json', ...storeArgs], { cwd: appRepo, env });
      expect(changes.exitCode).toBe(0);
      expect(parseJson(changes).changes.map((change: any) => change.name)).toEqual(['billing']);

      const inventory = await runCLI(['list', '--specs', '--json', ...storeArgs], { cwd: appRepo, env });
      expect(inventory.exitCode).toBe(0);
      const json = parseJson(inventory);
      expect(json.specs).toEqual([
        { id: 'billing', requirementCount: 1 },
        { id: 'billing/invoices', requirementCount: 1 },
      ]);
      expect(json.root).toEqual({
        path: selectedRoot,
        source: source === 'local' ? 'nearest' : source,
        ...(source === 'local' ? {} : { store_id: 'team-context' }),
      });

      for (const { id } of json.specs) {
        const shown = await runCLI(
          ['show', id, '--type', 'spec', '--json', ...storeArgs],
          { cwd: appRepo, env }
        );
        expect(shown.exitCode).toBe(0);
        expect(parseJson(shown)).toEqual({
          name: id,
          purpose: 'Bills from the selected root.',
          items: [{ label: '1', text: 'Billing: The system bills.', children: [] }],
          root: json.root,
        });

        const full = await runCLI(['show', id, '--type', 'spec', ...storeArgs], { cwd: appRepo, env });
        expect(full.exitCode).toBe(0);
        expect(full.stdout.trim()).toBe(specFor(id).trim());
      }
    },
    30_000
  );

  describe('selecting a registered store by id', () => {
    it('creates a change only in the store and names the root on stderr', async () => {
      const result = await runCLI(['new', 'change', 'add-billing', '--store', 'team-context'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(`Using outline-spec root: team-context (${storeRoot})`);
      expect(result.stdout).toContain("Created change 'add-billing'");
      expect(result.stdout).toContain(
        path.join(storeRoot, 'outline-spec', 'changes', 'add-billing')
      );

      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'add-billing'))
      ).toBe(true);
      expectNoLocalOutlineSpec();
    });

    it('includes the shared root block and absolute paths in new change JSON', async () => {
      const result = await runCLI(
        ['new', 'change', 'add-billing', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);

      const json = parseJson(result);
      expect(json.root).toEqual({
        path: storeRoot,
        source: 'store',
        store_id: 'team-context',
      });
      expect(path.isAbsolute(json.change.path)).toBe(true);
      expect(json.change.path).toBe(
        path.join(storeRoot, 'outline-spec', 'changes', 'add-billing')
      );
      expectNoLocalOutlineSpec();
    });

    it('wins over the nearest local root', async () => {
      const localRepo = path.join(tempDir, 'local-repo');
      createOutlineSpecRoot(localRepo);
      createChange(localRepo, 'local-change');
      createChange(storeRoot, 'store-change');

      const result = await runCLI(['list', '--json', '--store', 'team-context'], {
        cwd: localRepo,
        env,
      });
      expect(result.exitCode).toBe(0);

      const json = parseJson(result);
      const names = json.changes.map((change: any) => change.name);
      expect(names).toContain('store-change');
      expect(names).not.toContain('local-change');
      expect(json.root.store_id).toBe('team-context');
    });

    it('lists an empty team store before any changes exist', async () => {
      const blankStoreRoot = path.join(tempDir, 'stores', 'blank-context');
      fs.mkdirSync(path.join(blankStoreRoot, 'outline-spec'), { recursive: true });
      fs.writeFileSync(
        path.join(blankStoreRoot, 'outline-spec', 'config.yaml'),
        'schema: outline\n'
      );
      await writeStoreMetadataState(blankStoreRoot, {
        version: 1,
        id: 'blank-context',
      });
      const registered = await runCLI(
        ['store', 'register', blankStoreRoot, '--json'],
        { cwd: appRepo, env }
      );
      expect(registered.exitCode).toBe(0);

      const result = await runCLI(['list', '--json', '--store', 'blank-context'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      expect(json.changes).toEqual([]);
      expect(json.root).toEqual({
        path: fs.realpathSync.native(blankStoreRoot),
        source: 'store',
        store_id: 'blank-context',
      });
    });

    it('reads, validates, shows, and reports status in the selected store', async () => {
      createChange(storeRoot, 'store-change');

      const status = await runCLI(
        ['status', '--change', 'store-change', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );
      expect(status.exitCode).toBe(0);
      const statusJson = parseJson(status);
      expect(statusJson.changeName).toBe('store-change');
      expect(statusJson.schemaName).toBe('outline');
      expect(statusJson.root).toEqual({
        path: storeRoot,
        source: 'store',
        store_id: 'team-context',
      });

      // The batch sweep must select the same root and carry the same store
      // context per change as the single-change path above.
      const batch = await runCLI(['status', '--all', '--store', 'team-context', '--json'], {
        cwd: appRepo,
        env,
      });
      expect(batch.exitCode).toBe(0);
      const batchJson = parseJson(batch);
      expect(batchJson.root).toEqual(statusJson.root);
      expect(batchJson.changes.map((change: { changeName: string }) => change.changeName)).toEqual([
        'store-change',
      ]);
      expect(batchJson.changes[0]).toEqual({ ...statusJson, root: undefined });

      const instructions = await runCLI(
        ['instructions', 'design', '--change', 'store-change', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );
      expect(instructions.exitCode).toBe(0);
      const instructionsJson = parseJson(instructions);
      expect(instructionsJson.artifactId).toBe('design');
      expect(instructionsJson.root.store_id).toBe('team-context');
      expect(path.isAbsolute(instructionsJson.changeDir)).toBe(true);
      expect(instructionsJson.changeDir).toContain(storeRoot);

      const show = await runCLI(
        ['show', 'store-change', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );
      expect(show.exitCode).toBe(0);
      const showJson = parseJson(show);
      expect(showJson.id).toBe('store-change');
      expect(showJson.root.store_id).toBe('team-context');

      const validate = await runCLI(
        ['validate', 'store-change', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );
      expect(validate.exitCode).toBe(0);
      const validateJson = parseJson(validate);
      expect(validateJson.items[0]).toMatchObject({ id: 'store-change', valid: true });
      expect(validateJson.root.store_id).toBe('team-context');

      expectNoLocalOutlineSpec();
    });

    it('loads apply and archive operation inputs from the selected store root', async () => {
      createChange(storeRoot, 'store-change');
      fs.writeFileSync(
        path.join(storeRoot, 'outline-spec', 'config.yaml'),
        `schema: outline
context: Store context
operations:
  apply:
    guidance:
      - Store apply guidance
  archive:
    guidance:
      - Store archive guidance
`
      );

      const applyResult = await runCLI(
        ['instructions', 'apply', '--change', 'store-change', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );
      const archiveResult = await runCLI(
        ['instructions', 'archive', '--change', 'store-change', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );

      expect(applyResult.exitCode).toBe(0);
      expect(parseJson(applyResult)).toMatchObject({
        context: 'Store context',
        operationGuidance: ['Store apply guidance'],
        root: { path: storeRoot, store_id: 'team-context' },
      });
      expect(archiveResult.exitCode).toBe(0);
      expect(parseJson(archiveResult)).toMatchObject({
        context: 'Store context',
        operationGuidance: ['Store archive guidance'],
        root: { path: storeRoot, store_id: 'team-context' },
      });
      expectNoLocalOutlineSpec();
    });

    it('runs bulk validation against the selected store', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(['validate', '--all', '--store', 'team-context', '--json'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      expect(json.items.map((item: any) => item.id)).toContain('store-change');
      expect(json.root.store_id).toBe('team-context');
    });

    it('lands a change into the store specs with JSON output', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(
        ['land', 'store-change', '--store', 'team-context', '--json', '--yes'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().startsWith('{')).toBe(true);

      const json = parseJson(result);
      expect(json.landed).toBe('store-change');
      expect(json.specs).toEqual([{ name: 'billing', action: 'created' }]);
      expect(json.root.store_id).toBe('team-context');

      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'store-change'))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'archive'))
      ).toBe(false);
      expect(
        fs.readFileSync(path.join(storeRoot, 'outline-spec', 'specs', 'billing', 'spec.md'), 'utf-8')
      ).toBe(outlineSpec('billing', 'Bills customers.', 'Billing: The system creates bills.'));
      expectNoLocalOutlineSpec();
    });

    it('accepts archive as an alias of land with a rename note on stderr', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(
        ['archive', 'store-change', '--store', 'team-context', '--json', '--yes'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('"outline-spec archive" is now "outline-spec land"');
      expect(parseJson(result).landed).toBe('store-change');
    });
  });

  describe('human output and stdout purity', () => {
    it('keeps show stdout as the raw markdown payload', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(['show', 'store-change', '--store', 'team-context'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith('## Proposal')).toBe(true);
      expect(result.stderr).toContain(`Using outline-spec root: team-context (${storeRoot})`);
    });

    it('diffs an outline against the selected store\'s main specs', async () => {
      // A same-named capability sits in the cwd repo with different text. If
      // --diff resolved main specs against the cwd instead of the store root,
      // the patch below would not match the decoy's sentence.
      writeSpec(appRepo, 'billing', outlineSpec('billing', 'Decoy.', 'Billing: The system creates decoy bills.'));
      writeSpec(storeRoot, 'billing', outlineSpec('billing', 'Billing.', 'Billing: The system creates bills.'));
      createChange(storeRoot, 'store-change', { outline: PATCH_MISSING_SPEC_OUTLINE });

      const result = await runCLI(
        ['show', 'store-change', '--store', 'team-context', '--diff'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--- outline-spec/specs/billing/spec.md (updated)');
      expect(result.stdout).toContain('1. Billing: The system creates bills monthly.');
      expect(result.stdout).not.toContain('decoy');
    });

    it('keeps instructions stdout as the artifact payload', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(
        ['instructions', 'design', '--change', 'store-change', '--store', 'team-context'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith('<artifact id="design"')).toBe(true);
      expect(result.stderr).toContain('Using outline-spec root: team-context');
    });

    it('writes the status banner to stderr in human mode', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(
        ['status', '--change', 'store-change', '--store', 'team-context'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(`Using outline-spec root: team-context (${storeRoot})`);
      expect(result.stdout).toContain('Change: store-change');
      expect(result.stdout).not.toContain('Using outline-spec root');
    });
  });

  describe('selector errors', () => {
    it('rejects --store-path with register guidance', async () => {
      const result = await runCLI(['new', 'change', 'nope', '--store-path', '/x'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('store register');
      expect(output).toContain('--store <id>');
      expectNoLocalOutlineSpec();
      expect(fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'nope'))).toBe(false);
    });

    it('rejects show --store-path despite allowUnknownOption', async () => {
      const result = await runCLI(['show', '--store-path', '/x'], { cwd: appRepo, env });
      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('store register');
    });

    it('reports unknown stores with the same message across commands', async () => {
      const expected =
        "Unknown store 'team-contxt'. Registered stores: team-context.";

      const status = await runCLI(['status', '--store', 'team-contxt'], { cwd: appRepo, env });
      const list = await runCLI(['list', '--store', 'team-contxt'], { cwd: appRepo, env });

      expect(status.exitCode).toBe(1);
      expect(list.exitCode).toBe(1);
      expect(status.stdout + status.stderr).toContain(expected);
      expect(list.stdout + list.stderr).toContain(expected);
    });

    it('rejects an invalid store id format before registry lookup', async () => {
      const result = await runCLI(['list', '--store', 'Bad_Id'], { cwd: appRepo, env });
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain('kebab-case');
    });

    it('emits machine-readable resolver failures in JSON mode', async () => {
      const result = await runCLI(['status', '--json', '--store', 'team-contxt'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.trim().startsWith('{')).toBe(true);
      const json = parseJson(result);
      expect(json.status[0].code).toBe('unknown_store');
      expect(json.status[0].message).toContain('team-contxt');
    });

    it('reports a corrupt registry as machine-readable JSON, not prose', async () => {
      fs.writeFileSync(
        path.join(globalDataDir, 'stores', 'registry.yaml'),
        '{not yaml: ['
      );

      const result = await runCLI(['status', '--json', '--store', 'team-context'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.trim().startsWith('{')).toBe(true);
      const json = parseJson(result);
      expect(json.status[0].severity).toBe('error');
      expect(json.status[0].code).toBe('invalid_store_registry');
    });

    it('fails on an unhealthy store root and points to doctor', async () => {
      const brokenRoot = path.join(tempDir, 'stores', 'broken-context');
      fs.mkdirSync(brokenRoot, { recursive: true });
      await writeStoreMetadataState(brokenRoot, { version: 1, id: 'broken-context' });
      await registerStore({
        id: 'broken-context',
        localPath: brokenRoot,
        globalDataDir,
      });

      const result = await runCLI(['list', '--store', 'broken-context'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain('store doctor');
      // No scaffolding or repair happened.
      expect(fs.existsSync(path.join(brokenRoot, 'outline-spec'))).toBe(false);
    });
  });

  describe('default resolution without --store', () => {
    it('fails with a store hint instead of scaffolding when no root exists', async () => {
      const result = await runCLI(['new', 'change', 'foo'], { cwd: appRepo, env });
      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('team-context');
      expect(output).toContain('--store <id>');
      expect(output).toContain('outline-spec init');
      expectNoLocalOutlineSpec();
    });

    it('treats leftover workspace state as no root at all', async () => {
      fs.mkdirSync(path.join(appRepo, '.outline-spec-workspace'), { recursive: true });
      fs.writeFileSync(
        path.join(appRepo, '.outline-spec-workspace', 'view.yaml'),
        'version: 1\nname: platform\ncontext: null\nlinks: {}\n'
      );

      const result = await runCLI(['status'], { cwd: appRepo, env });
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain('team-context');
    });

    it('ignores leftover workspace state when a nearby root exists', async () => {
      const localRepo = path.join(tempDir, 'workspace-repo');
      createOutlineSpecRoot(localRepo);
      fs.mkdirSync(path.join(localRepo, '.outline-spec-workspace'), { recursive: true });
      fs.writeFileSync(
        path.join(localRepo, '.outline-spec-workspace', 'view.yaml'),
        'version: 1\nname: platform\ncontext: null\nlinks: {}\n'
      );
      createChange(localRepo, 'local-change');

      const result = await runCLI(['status', '--change', 'local-change', '--json'], {
        cwd: localRepo,
        env,
      });
      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      expect(json.schemaName).toBe('outline');
      expect(json.root.source).toBe('nearest');
      expect(json.root.store_id).toBeUndefined();
    });

    it('works inside the standalone repo itself without a flag', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(['status', '--change', 'store-change', '--json'], {
        cwd: storeRoot,
        env,
      });
      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      expect(json.changeName).toBe('store-change');
      expect(json.root).toEqual({ path: storeRoot, source: 'nearest' });
    });

    it('keeps implicit-root behavior when no stores are registered', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };

      const result = await runCLI(['status', '--json'], { cwd: appRepo, env: isolatedEnv });
      expect(result.exitCode).toBe(0);
      const json = parseJson(result);
      expect(json.changes).toEqual([]);
      expect(json.root.source).toBe('implicit');
    });

    // Creating a change in a directory that was never set up silently
    // materializes `outline-spec/` there (#1645). The creation stays zero-config,
    // but a human who did not mean to adopt this directory has to be told.
    it('says so when the first change creates the root in an unset-up directory', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };

      const created = await runCLI(['new', 'change', 'adopt-me'], {
        cwd: appRepo,
        env: isolatedEnv,
      });
      expect(created.exitCode).toBe(0);
      const firstOutput = created.stdout + created.stderr;
      expect(firstOutput).toContain('no outline-spec root was found here');
      // Naming the directory it created is the point: the reader has to know
      // what to delete if this was not the project they meant. The path is
      // relative to where the command ran, so it reads the same on Windows.
      expect(firstOutput).toContain('created at outline-spec/.');
      expect(firstOutput).toContain('outline-spec init');
      expect(fs.existsSync(path.join(appRepo, 'outline-spec', 'changes', 'adopt-me'))).toBe(true);

      // The root exists now, so the notice must not repeat on every change.
      const second = await runCLI(['new', 'change', 'already-adopted'], {
        cwd: appRepo,
        env: isolatedEnv,
      });
      expect(second.exitCode).toBe(0);
      expect(second.stdout + second.stderr).not.toContain('no outline-spec root was found here');
    });

    // Run from a subdirectory and the subdirectory is what gets adopted - the
    // note has to name that directory, not the repository above it.
    it('names the directory it actually adopted when run from a subdirectory', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };
      const nested = path.join(appRepo, 'services', 'billing');
      fs.mkdirSync(nested, { recursive: true });

      const created = await runCLI(['new', 'change', 'adopt-the-subdir'], {
        cwd: nested,
        env: isolatedEnv,
      });
      expect(created.exitCode).toBe(0);
      expect(created.stdout + created.stderr).toContain('created at outline-spec/.');

      expect(fs.existsSync(path.join(nested, 'outline-spec', 'changes', 'adopt-the-subdir'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(appRepo, 'outline-spec'))).toBe(false);
    });

    it('keeps the notice out of JSON output', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };

      const result = await runCLI(['new', 'change', 'adopt-me-quietly', '--json'], {
        cwd: appRepo,
        env: isolatedEnv,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('no outline-spec root was found here');

      // `root.source` is how a caller in JSON mode learns the same fact.
      const json = parseJson(result);
      expect(json.root.source).toBe('implicit');
    });

    it('keeps list working for a legacy project.md root when no stores are registered', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };
      fs.mkdirSync(path.join(appRepo, 'outline-spec'), { recursive: true });
      fs.writeFileSync(path.join(appRepo, 'outline-spec', 'project.md'), '# Project\n');

      const result = await runCLI(['list', '--json'], { cwd: appRepo, env: isolatedEnv });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');

      const json = parseJson(result);
      expect(json.changes).toEqual([]);
      expect({
        ...json.root,
        path: fs.realpathSync.native(json.root.path),
      }).toEqual({ path: fs.realpathSync.native(appRepo), source: 'implicit' });
    });

    it('rejects implicit roots for bulk validation and listing', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };

      for (const args of [
        ['validate', '--all'],
        ['validate', '--changes'],
        ['validate', '--specs'],
        ['list'],
        ['list', '--specs'],
      ]) {
        const result = await runCLI(args, { cwd: appRepo, env: isolatedEnv });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'Error: No outline-spec root found from the current directory.'
        );
        expect(result.stderr).not.toContain('No items found to validate.');
        expect(result.stderr).not.toContain('No active changes found.');
        expect(result.stderr).not.toContain('No specs found.');
      }
    });

    it('reports missing roots as JSON instead of fabricating an implicit root', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };

      for (const args of [
        ['validate', '--all', '--json'],
        ['validate', '--changes', '--json'],
        ['validate', '--specs', '--json'],
        ['list', '--json'],
        ['list', '--specs', '--json'],
      ]) {
        const result = await runCLI(args, { cwd: appRepo, env: isolatedEnv });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const json = parseJson(result);
        if (args[0] === 'validate') {
          expect(json).not.toHaveProperty('root');
        } else {
          expect(json.root).toBeNull();
          expect(json[args.includes('--specs') ? 'specs' : 'changes']).toEqual([]);
        }
        expect(json.status[0]).toEqual(
          expect.objectContaining({
            severity: 'error',
            code: 'no_outline_spec_root',
            message: 'No outline-spec root found from the current directory.',
          })
        );
      }
    });

    // The generated workflows read `root` from `outline-spec list --json` to decide
    // whether a project is set up (#1645). That answer has to stay honest when
    // stores are registered but this directory has no root of its own -
    // an implicit root here would read as "set up" and the workflow would
    // scaffold a change into an unrelated repository.
    it('reports a missing root as JSON when only stores are registered', async () => {
      const result = await runCLI(['list', '--json'], { cwd: appRepo, env });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('');

      const json = parseJson(result);
      expect(json.root).toBeNull();
      expect(json.changes).toEqual([]);
      expect(json.status[0]).toEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'no_root_with_registered_stores',
        })
      );
    });

    it('still accepts an existing root with no items', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };
      createOutlineSpecRoot(appRepo);

      const result = await runCLI(['validate', '--all', '--json'], {
        cwd: appRepo,
        env: isolatedEnv,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');

      const json = parseJson(result);
      expect(json.items).toEqual([]);
      expect(json.summary.totals).toEqual({ items: 0, passed: 0, failed: 0 });
      expect({
        ...json.root,
        path: fs.realpathSync.native(json.root.path),
      }).toEqual({ path: fs.realpathSync.native(appRepo), source: 'nearest' });
    });

    it('preserves direct validation behavior without a root', async () => {
      const isolatedEnv = {
        ...env,
        XDG_DATA_HOME: path.join(tempDir, 'data-empty'),
      };

      const result = await runCLI(['validate', 'missing'], {
        cwd: appRepo,
        env: isolatedEnv,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown item 'missing'.");
      expect(result.stderr).not.toContain('No outline-spec root found');
    });
  });

  describe('land --json is non-interactive', () => {
    it('fails without a change name instead of opening a picker', async () => {
      createChange(storeRoot, 'store-change');

      const result = await runCLI(['land', '--store', 'team-context', '--json'], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.trim().startsWith('{')).toBe(true);
      const json = parseJson(result);
      expect(json.landed).toBeNull();
      expect(json.status[0].code).toBe('land_change_name_required');
    });

    it('reports no active changes for a selected empty store without init guidance', async () => {
      const blankStoreRoot = path.join(tempDir, 'stores', 'land-blank-context');
      fs.mkdirSync(path.join(blankStoreRoot, 'outline-spec'), { recursive: true });
      fs.writeFileSync(
        path.join(blankStoreRoot, 'outline-spec', 'config.yaml'),
        'schema: outline\n'
      );
      await writeStoreMetadataState(blankStoreRoot, {
        version: 1,
        id: 'land-blank-context',
      });
      const registered = await runCLI(
        ['store', 'register', blankStoreRoot, '--json'],
        { cwd: appRepo, env }
      );
      expect(registered.exitCode).toBe(0);

      const result = await runCLI(
        ['land', 'missing-change', '--store', 'land-blank-context', '--json', '--yes'],
        { cwd: appRepo, env }
      );

      expect(result.exitCode).toBe(1);
      const json = parseJson(result);
      expect(json.landed).toBeNull();
      expect(json.status[0]).toEqual(expect.objectContaining({
        code: 'land_change_not_found',
        message: "Change 'missing-change' not found. No active changes exist in this root.",
      }));
    });

    it('reports outline conflicts as diagnostics without stdout prose', async () => {
      createChange(storeRoot, 'bad-change', { outline: INVALID_OUTLINE });

      const result = await runCLI(
        ['land', 'bad-change', '--store', 'team-context', '--json', '--yes'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout.trim().startsWith('{')).toBe(true);
      const json = parseJson(result);
      expect(json.landed).toBeNull();
      expect(json.status[0].code).toBe('land_conflicts');
      // The change was not landed.
      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'bad-change'))
      ).toBe(true);
    });

    it('keeps stdout pure when --yes skips incomplete tasks', async () => {
      createChange(storeRoot, 'wip-yes-change', { tasksDone: false });

      const result = await runCLI(
        ['land', 'wip-yes-change', '--store', 'team-context', '--json', '--yes'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);
      // The human-mode task status and --yes warning must not precede the JSON payload.
      expect(result.stdout.trim().startsWith('{')).toBe(true);
      expect(parseJson(result).landed).toBe('wip-yes-change');
    });

    it('writes no spec when any spec in the change fails to land', async () => {
      // 'aaa-good' is a new spec that lands cleanly; 'zzz-bad' patches a
      // requirement its live spec lacks, so the whole change must write nothing.
      createChange(storeRoot, 'two-spec-change', {
        outline: `## Requirements
1. aaa-good: A good spec.
  a. Good: The system is good.
2. zzz-bad:
  a. Missing rule (patch): ~~Old.~~ **New.**
`,
      });
      const badTargetContent = outlineSpec('zzz-bad', 'Legacy.', 'Old rule: The system holds.');
      writeSpec(storeRoot, 'zzz-bad', badTargetContent);

      const result = await runCLI(
        ['land', 'two-spec-change', '--store', 'team-context', '--json', '--yes'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(1);
      const json = parseJson(result);
      expect(json.landed).toBeNull();
      expect(json.status[0].code).toBe('land_conflicts');

      // "Nothing was written" must be true: the good spec was not created
      // and the bad target is byte-identical.
      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'specs', 'aaa-good', 'spec.md'))
      ).toBe(false);
      expect(
        fs.readFileSync(path.join(storeRoot, 'outline-spec', 'specs', 'zzz-bad', 'spec.md'), 'utf-8')
      ).toBe(badTargetContent);
      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'two-spec-change'))
      ).toBe(true);
    });

    it('reports a patch to a missing spec as a diagnostic without stdout prose', async () => {
      createChange(storeRoot, 'modified-change', { outline: PATCH_MISSING_SPEC_OUTLINE });

      const result = await runCLI(
        ['land', 'modified-change', '--store', 'team-context', '--json', '--yes'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout.trim().startsWith('{')).toBe(true);
      const json = parseJson(result);
      expect(json.landed).toBeNull();
      expect(json.status[0].code).toBe('land_conflicts');
      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'modified-change'))
      ).toBe(true);
    });

    it('refuses incomplete tasks without --yes', async () => {
      createChange(storeRoot, 'wip-change', { tasksDone: false });

      const result = await runCLI(
        ['land', 'wip-change', '--store', 'team-context', '--json'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(1);
      const json = parseJson(result);
      expect(json.status[0].code).toBe('land_tasks_incomplete');
      expect(
        fs.existsSync(path.join(storeRoot, 'outline-spec', 'changes', 'wip-change'))
      ).toBe(true);
    });
  });

  describe('initiative links are retired from normal change flows', () => {
    it('rejects --initiative and creates no files', async () => {
      const localRepo = path.join(tempDir, 'initiative-repo');
      createOutlineSpecRoot(localRepo);

      const result = await runCLI(
        ['new', 'change', 'linked-change', '--initiative', 'billing-launch'],
        { cwd: localRepo, env }
      );
      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('--initiative is no longer supported');
      expect(
        fs.existsSync(path.join(localRepo, 'outline-spec', 'changes', 'linked-change'))
      ).toBe(false);
    });

    it('removes outline-spec set change entirely', async () => {
      const localRepo = path.join(tempDir, 'set-change-repo');
      createOutlineSpecRoot(localRepo);
      createChange(localRepo, 'existing-change');
      const metadataPath = path.join(
        localRepo,
        'outline-spec',
        'changes',
        'existing-change',
        '.outline-spec.yaml'
      );

      const result = await runCLI(
        ['set', 'change', 'existing-change', '--initiative', 'billing-launch'],
        { cwd: localRepo, env }
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('unknown command');
      expect(fs.existsSync(metadataPath)).toBe(false);

      const help = await runCLI(['--help'], { cwd: localRepo, env });
      expect(help.stdout).not.toContain('Set checked-in outline-spec metadata');
      expect(help.stdout).not.toMatch(/^\s*set\s/m);
    });
  });

  describe('setup and register point to --store usage', () => {
    it('shows --store usage after setup', async () => {
      const result = await runCLI(
        ['store', 'setup', 'fresh-context', '--path', path.join(tempDir, 'fresh-context'), '--no-init-git'],
        { cwd: appRepo, env }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('outline-spec new change <change-id> --store fresh-context');
    });

    it('shows --store usage after register', async () => {
      const registerRoot = path.join(tempDir, 'register-context');
      createOutlineSpecRoot(registerRoot);
      await writeStoreMetadataState(registerRoot, {
        version: 1,
        id: 'register-context',
      });

      const result = await runCLI(['store', 'register', registerRoot], {
        cwd: appRepo,
        env,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('outline-spec new change <change-id> --store register-context');
    });
  });
});
