import { writeFileSync } from 'fs';
import { relabel, writeSpec } from '../core/outline/outline.js';
import { changesEditing, readLiveSpec, specFile, specNameProblem } from '../core/outline/specs.js';
import { resolveRootForCommand } from '../core/root-selection.js';

export interface RelabelOptions {
  store?: string;
  storePath?: string;
}

/** Closes label gaps in one spec; refused while a pending change edits it, since its labels would shift underneath. */
export async function relabelCommand(name: string, options: RelabelOptions): Promise<void> {
  const root = await resolveRootForCommand(options);
  if (!root) return;
  const problem = specNameProblem(name);
  if (problem) throw new Error(problem);
  const busy = changesEditing(root.changesDir, name);
  if (busy.length) throw new Error(`${name} has pending edits in ${busy.join(', ')}; land them first`);
  const spec = readLiveSpec(root.specsDir, name);
  if (!spec) throw new Error(`No spec '${name}'`);
  const after = writeSpec({ ...spec, items: relabel(spec.items) });
  if (after === writeSpec(spec)) {
    console.log(`${name} has no label gaps.`);
    return;
  }
  writeFileSync(specFile(root.specsDir, name), after);
  console.log(`Relabeled ${name}.`);
}
