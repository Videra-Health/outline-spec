import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { isOutlineSpec, migrateSpec, type Unplaced } from '../core/outline/migrate.js';
import { parseSpec, writeSpec } from '../core/outline/outline.js';
import { resolveRootForCommand, toRootOutput } from '../core/root-selection.js';
import { discoverSpecFiles } from '../utils/spec-discovery.js';
import { applySpecLayout, planSpecLayout, type KeptFolder } from '../core/outline/spec-layout.js';
import { specFile as flatSpecFile } from '../core/outline/specs.js';
import { FileSystemUtils } from '../utils/file-system.js';

export interface MigrateSpecsOptions {
  dryRun?: boolean;
  json?: boolean;
  store?: string;
  storePath?: string;
}

interface SpecReport {
  name: string;
  status: 'converted' | 'reformatted' | 'already-outline' | 'blocked';
  notes: string[];
  unplaced: Unplaced[];
  text?: string;
}

/** Moves old-layout specs to `<id>.md`, then converts old-format specs to outlines; a spec with content it can't place is left untouched. */
export async function migrateSpecsCommand(options: MigrateSpecsOptions): Promise<void> {
  const root = await resolveRootForCommand(options, { json: options.json, failurePayload: { specs: [], root: null }, allowOldSpecLayout: true });
  if (!root) return;
  const rel = (p: string) => FileSystemUtils.toPosixPath(path.relative(root.path, p));
  const layout = planSpecLayout(root.specsDir);
  const kept: KeptFolder[] = options.dryRun ? [] : await applySpecLayout(root.specsDir, layout);
  const moves = layout.moves.map((m) => ({ id: m.id, from: rel(m.from), to: rel(m.to) }));
  const conflicts = layout.conflicts.map((c) => ({ id: c.id, from: rel(c.from), to: rel(c.to), reason: c.reason }));
  const keptFolders = kept.map((k) => ({ dir: rel(k.dir), files: k.files.map(FileSystemUtils.toPosixPath) }));
  if (conflicts.length) process.exitCode = 1;

  const specs = await discoverSpecFiles(root.specsDir);
  // A dry run converts each spec where it sits, before its move.
  if (options.dryRun) specs.push(...layout.moves.map((m) => ({ id: m.id, specFile: m.from })));
  specs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const reports: SpecReport[] = [];
  for (const { id, specFile } of specs) {
    const src = readFileSync(specFile, 'utf-8');
    if (isOutlineSpec(src)) {
      // An outline written before the current layout is rewritten in it; one that doesn't parse is validate's to report.
      let text: string | undefined;
      try {
        text = writeSpec(parseSpec(src.replace(/\r\n/g, '\n'), id));
      } catch {
        text = undefined;
      }
      const stale = text !== undefined && text !== src;
      if (stale && !options.dryRun) writeFileSync(specFile, text!);
      reports.push({ name: id, status: stale ? 'reformatted' : 'already-outline', notes: [], unplaced: [] });
      continue;
    }
    const result = migrateSpec(src, id);
    const blocked = result.unplaced.length > 0;
    if (!blocked && !options.dryRun) writeFileSync(specFile, result.text);
    reports.push({
      name: id,
      status: blocked ? 'blocked' : 'converted',
      notes: result.notes,
      unplaced: result.unplaced,
      ...(options.dryRun && !blocked ? { text: result.text } : {}),
    });
  }
  if (reports.some((r) => r.status === 'blocked')) process.exitCode = 1;

  if (options.json) {
    console.log(JSON.stringify({ dryRun: !!options.dryRun, moves, conflicts, keptFolders, specs: reports, root: toRootOutput(root) }, null, 2));
    return;
  }
  printLayout(moves, conflicts, keptFolders, !!options.dryRun);
  if (reports.length === 0) {
    console.log('No specs found.');
    return;
  }
  for (const r of reports) {
    const file = rel(layout.moves.find((m) => m.id === r.name && options.dryRun)?.from ?? flatSpecFile(root.specsDir, r.name));
    if (r.status === 'already-outline') {
      console.log(`- ${r.name}: already an outline`);
      continue;
    }
    if (r.status === 'reformatted') {
      console.log(`✓ ${r.name}: ${options.dryRun ? 'would update' : 'updated'} to the current layout`);
      continue;
    }
    if (r.status === 'blocked') {
      console.log(`✗ ${r.name}: not converted; these lines have no place in an outline:`);
      for (const u of r.unplaced) console.log(`    ${file}:${u.line} (${u.reason}) ${u.text.trim()}`);
    } else {
      console.log(`✓ ${r.name}: ${options.dryRun ? 'would convert' : 'converted'}`);
    }
    for (const n of r.notes) console.log(`    note: ${n}`);
    if (r.text) console.log(`\n${r.text}`);
  }
  const blocked = reports.filter((r) => r.status === 'blocked').length;
  const converted = reports.filter((r) => r.status === 'converted').length;
  const reformatted = reports.filter((r) => r.status === 'reformatted').length;
  console.log(
    `\n${converted} ${options.dryRun ? 'would convert' : 'converted'}, ${reformatted} ${options.dryRun ? 'would update' : 'updated'} to the current layout, ${blocked} blocked, ${reports.length - converted - reformatted - blocked} already current.` +
      (blocked ? ' Move or rewrite the listed lines as requirement text, details, or scenarios, then rerun.' : '')
  );
}

function printLayout(
  moves: Array<{ from: string; to: string }>,
  conflicts: Array<{ from: string; to: string; reason: string }>,
  kept: Array<{ dir: string; files: string[] }>,
  dryRun: boolean
): void {
  if (moves.length === 0 && conflicts.length === 0) {
    console.log('No old-layout specs to move.\n');
    return;
  }
  for (const m of moves) console.log(`→ ${m.from} ${dryRun ? 'would move to' : 'moved to'} ${m.to}`);
  for (const c of conflicts) console.log(`✗ ${c.from}: not moved; ${c.reason}`);
  for (const k of kept) console.log(`    kept ${k.dir}/ for: ${k.files.join(', ')}`);
  console.log(
    `${moves.length} ${dryRun ? 'would move' : 'moved'}, ${conflicts.length} not moved.` +
      (conflicts.length ? ' Rename or merge each listed spec by hand, then rerun.' : '') + '\n'
  );
}
