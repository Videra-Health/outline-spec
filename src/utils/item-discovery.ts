import { promises as fs } from 'fs';
import path from 'path';
import { discoverSpecFiles } from './spec-discovery.js';

/**
 * Returns the ids of active changes: every directory under outline-spec/changes/
 * except hidden ones and an `archive` folder left by older projects.
 *
 * A change is resolved by its directory alone - the same rule `list`,
 * `status`, `instructions` and `validate` use (`getAvailableChanges`).
 * Requiring proposal.md here made `outline-spec show` and shell completion miss
 * changes those commands resolve: `outline-spec new change <name>` scaffolds only
 * `.outline-spec.yaml`, and a custom schema need not define a proposal artifact at
 * all (#1161).
 */
export async function getActiveChangeIds(root: string = process.cwd()): Promise<string[]> {
  const changesPath = path.join(root, 'outline-spec', 'changes');
  try {
    const entries = await fs.readdir(changesPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function getSpecIds(root: string = process.cwd()): Promise<string[]> {
  const specsPath = path.join(root, 'outline-spec', 'specs');
  const discovered = await discoverSpecFiles(specsPath);
  return discovered.map((spec) => spec.id);
}
