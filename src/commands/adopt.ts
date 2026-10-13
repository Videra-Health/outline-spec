import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { isOutlineSpec, migrateSpec, type Unplaced } from '../core/outline/migrate.js';
import { OUTLINE_SPEC_DIR_NAME } from '../core/config.js';
import { METADATA_FILENAME } from '../utils/change-metadata.js';
import { discoverSpecFiles } from '../utils/spec-discovery.js';

const OPENSPEC_DIR = 'openspec';
const OPENSPEC_METADATA = '.openspec.yaml';
const CONFIG_FILES = ['config.yaml', 'config.yml'];
// Only the retired built-in schema is rewritten; a project-local schema name is left alone.
const SPEC_DRIVEN_SCHEMA = /^(\s*schema:\s*)(["']?)spec-driven\2([ \t]*(?:#.*)?)$/m;

export interface AdoptOptions {
  dryRun?: boolean;
  json?: boolean;
}

interface SpecPlan {
  name: string;
  status: 'converted' | 'already-outline' | 'blocked';
  notes: string[];
  unplaced: Unplaced[];
  /** Path under the specs dir, and the converted text to write there. */
  rel: string;
  text?: string;
}

export interface AdoptReport {
  dryRun: boolean;
  blocked: boolean;
  specs: Array<Omit<SpecPlan, 'text' | 'rel'>>;
  deletedArchive: boolean;
  schemaRewritten: string[];
  metadataRenamed: string[];
  deltaChanges: string[];
}

/** Moves an OpenSpec project's openspec/ folder to outline-spec/ and converts its specs to outlines. */
export async function adoptProject(projectPath: string, options: AdoptOptions = {}): Promise<AdoptReport> {
  const root = path.resolve(projectPath);
  const from = path.join(root, OPENSPEC_DIR);
  const to = path.join(root, OUTLINE_SPEC_DIR_NAME);
  if (!existsSync(from)) {
    throw new Error(`No ${OPENSPEC_DIR}/ folder in ${root}; nothing to adopt.`);
  }
  if (existsSync(to)) {
    throw new Error(`${OUTLINE_SPEC_DIR_NAME}/ already exists in ${root}; move or remove it before adopting.`);
  }

  const specs = await planSpecs(path.join(from, 'specs'));
  const report: AdoptReport = {
    dryRun: !!options.dryRun,
    blocked: specs.some((s) => s.status === 'blocked'),
    specs: specs.map(({ text: _text, rel: _rel, ...rest }) => rest),
    deletedArchive: existsSync(path.join(from, 'changes', 'archive')),
    schemaRewritten: [],
    metadataRenamed: [],
    deltaChanges: [],
  };
  if (report.blocked) {
    report.deletedArchive = false;
    return report;
  }

  const changes = await findChanges(path.join(from, 'changes'));
  report.deltaChanges = changes.filter((c) => !existsSync(path.join(c.dir, 'outline.md'))).map((c) => c.name);
  const configs = [
    ...CONFIG_FILES.map((f) => ({ label: path.join(OUTLINE_SPEC_DIR_NAME, f), rel: f })),
    ...changes.flatMap((c) => [OPENSPEC_METADATA, METADATA_FILENAME].map((f) => ({
      label: path.join(OUTLINE_SPEC_DIR_NAME, 'changes', c.name, METADATA_FILENAME),
      rel: path.join('changes', c.name, f),
    }))),
  ];
  for (const { label, rel } of configs) {
    const file = path.join(from, rel);
    if (existsSync(file) && SPEC_DRIVEN_SCHEMA.test(await fs.readFile(file, 'utf-8'))) {
      report.schemaRewritten.push(label);
    }
  }
  report.metadataRenamed = changes
    .filter((c) => existsSync(path.join(c.dir, OPENSPEC_METADATA)) && !existsSync(path.join(c.dir, METADATA_FILENAME)))
    .map((c) => c.name);
  if (options.dryRun) return report;

  await fs.rename(from, to);
  if (report.deletedArchive) {
    await fs.rm(path.join(to, 'changes', 'archive'), { recursive: true, force: true });
  }
  for (const spec of specs) {
    if (spec.text !== undefined) await fs.writeFile(path.join(to, 'specs', spec.rel), spec.text);
  }
  for (const name of report.metadataRenamed) {
    const dir = path.join(to, 'changes', name);
    await fs.rename(path.join(dir, OPENSPEC_METADATA), path.join(dir, METADATA_FILENAME));
  }
  for (const rel of [...CONFIG_FILES, ...changes.map((c) => path.join('changes', c.name, METADATA_FILENAME))]) {
    const file = path.join(to, rel);
    if (!existsSync(file)) continue;
    const text = await fs.readFile(file, 'utf-8');
    if (SPEC_DRIVEN_SCHEMA.test(text)) await fs.writeFile(file, text.replace(SPEC_DRIVEN_SCHEMA, '$1$2outline$2$3'));
  }
  return report;
}

async function planSpecs(specsDir: string): Promise<SpecPlan[]> {
  const plans: SpecPlan[] = [];
  for (const { id, specFile } of await discoverSpecFiles(specsDir)) {
    const rel = path.relative(specsDir, specFile);
    const src = await fs.readFile(specFile, 'utf-8');
    if (isOutlineSpec(src)) {
      plans.push({ name: id, rel, status: 'already-outline', notes: [], unplaced: [] });
      continue;
    }
    const result = migrateSpec(src, id);
    const blocked = result.unplaced.length > 0;
    plans.push({
      name: id,
      rel,
      status: blocked ? 'blocked' : 'converted',
      notes: result.notes,
      unplaced: result.unplaced,
      ...(blocked ? {} : { text: result.text }),
    });
  }
  return plans;
}

const CHANGE_MARKERS = ['outline.md', 'proposal.md', 'tasks.md', 'design.md', 'specs', OPENSPEC_METADATA, METADATA_FILENAME];

/** Open change folders, recursing through namespace folders that hold changes rather than artifacts. */
async function findChanges(changesDir: string, prefix = ''): Promise<Array<{ name: string; dir: string }>> {
  let entries;
  try {
    entries = await fs.readdir(changesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: Array<{ name: string; dir: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || (!prefix && entry.name === 'archive')) continue;
    const dir = path.join(changesDir, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (CHANGE_MARKERS.some((m) => existsSync(path.join(dir, m)))) found.push({ name, dir });
    else found.push(...(await findChanges(dir, name)));
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export async function adoptCommand(projectPath: string, options: AdoptOptions): Promise<void> {
  const report = await adoptProject(projectPath, options);
  if (report.blocked) process.exitCode = 1;
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const would = (done: string, planned: string) => (options.dryRun ? planned : done);
  for (const s of report.specs) {
    const rel = path.join(OPENSPEC_DIR, 'specs', s.name, 'spec.md');
    if (s.status === 'already-outline') console.log(`- ${s.name}: already an outline`);
    else if (s.status === 'converted') console.log(`✓ ${s.name}: ${would('converted', 'would convert')}`);
    else {
      console.log(`✗ ${s.name}: can't convert; these lines have no place in an outline:`);
      for (const u of s.unplaced) console.log(`    ${rel}:${u.line} (${u.reason}) ${u.text.trim()}`);
    }
    for (const n of s.notes) console.log(`    note: ${n}`);
  }
  if (report.blocked) {
    console.log(
      `\nNothing moved. Rewrite the listed lines in ${OPENSPEC_DIR}/specs as requirement text, details, or scenarios, then rerun outline-spec adopt.`
    );
    return;
  }

  console.log();
  console.log(`${would('Moved', 'Would move')} ${OPENSPEC_DIR}/ to ${OUTLINE_SPEC_DIR_NAME}/`);
  if (report.deletedArchive) console.log(`${would('Deleted', 'Would delete')} ${OUTLINE_SPEC_DIR_NAME}/changes/archive/`);
  for (const name of report.metadataRenamed) {
    console.log(`${would('Renamed', 'Would rename')} ${OPENSPEC_METADATA} to ${METADATA_FILENAME} in changes/${name}`);
  }
  for (const file of report.schemaRewritten) console.log(`${would('Set', 'Would set')} schema: outline in ${file}`);
  if (report.deltaChanges.length > 0) {
    console.log('\nOpen changes still in delta format (adopt cannot convert these; write an outline.md for each):');
    for (const name of report.deltaChanges) console.log(`  - ${name}`);
  }
  console.log(
    options.dryRun
      ? '\nDry run: nothing written. Rerun without --dry-run to adopt.'
      : '\nNext: run `outline-spec update` to install outline-spec skills and commands.'
  );
}
