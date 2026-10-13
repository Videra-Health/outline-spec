import { touches } from '../core/outline/outline.js';
import { hasChangeOutline, listChanges, readChangeEdits } from '../core/outline/specs.js';
import { resolveRootForCommand, toRootOutput } from '../core/root-selection.js';

export interface PendingOptions {
  json?: boolean;
  store?: string;
  storePath?: string;
}

export interface PendingChange {
  name: string;
  touches: string[];
  error?: string;
}

/** What each open change's outline touches, and which paths two or more changes share. */
export function collectPending(changesDir: string): {
  changes: PendingChange[];
  overlaps: Array<{ path: string; changes: string[] }>;
} {
  const changes: PendingChange[] = [];
  const seen = new Map<string, string[]>();
  for (const name of listChanges(changesDir)) {
    if (!hasChangeOutline(changesDir, name)) continue;
    try {
      const paths = readChangeEdits(changesDir, name).flatMap(touches);
      changes.push({ name, touches: paths });
      for (const p of paths) seen.set(p, [...(seen.get(p) ?? []), name]);
    } catch (e) {
      changes.push({ name, touches: [], error: (e as Error).message });
    }
  }
  const overlaps = [...seen].filter(([, cs]) => cs.length > 1).map(([p, cs]) => ({ path: p, changes: cs }));
  return { changes, overlaps };
}

export async function pendingCommand(options: PendingOptions): Promise<void> {
  const root = await resolveRootForCommand(options, {
    json: options.json,
    failurePayload: { changes: [], overlaps: [], root: null },
  });
  if (!root) return;
  const result = collectPending(root.changesDir);
  if (result.changes.some((c) => c.error)) process.exitCode = 1;
  if (options.json) {
    console.log(JSON.stringify({ ...result, root: toRootOutput(root) }, null, 2));
    return;
  }
  if (result.changes.length === 0) {
    console.log('No pending changes with an outline.md.');
    return;
  }
  for (const c of result.changes) {
    console.log(c.name);
    if (c.error) console.log(c.error.split('\n').map((l) => `  ! ${l}`).join('\n'));
    else console.log(c.touches.map((p) => `  ${p}`).join('\n') || '  (no spec edits)');
  }
  if (result.overlaps.length) {
    console.log(`\noverlaps:\n${result.overlaps.map((o) => `  ${o.path}: ${o.changes.join(', ')}`).join('\n')}`);
  }
}
