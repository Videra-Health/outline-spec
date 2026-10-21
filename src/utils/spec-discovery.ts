import { promises as fs } from 'fs';
import path from 'path';
import { FileSystemUtils } from './file-system.js';
import { SPEC_EXT } from '../core/outline/specs.js';

export interface DiscoveredSpec {
  /** Spec id relative to the specs root, forward-slash separated on every platform (e.g. "web" or "platform/session-layout"). */
  id: string;
  /** Path to the `<id>.md` file (absolute if the specs root is absolute). */
  specFile: string;
}

function assertDiscoveredSpecPath(specsRoot: string, areaDir: string, specFile: string): void {
  try {
    FileSystemUtils.assertPathWithin(specsRoot, specFile);
  } catch {
    // Area directories may intentionally be external monorepo links. In that
    // case, confine the file to the area itself.
    FileSystemUtils.assertPathWithin(areaDir, specFile);
  }
}

/**
 * Recursively discover every `<id>.md` under a specs root; nested ids name
 * area folders (`specs/<area>/<id>.md`). Dot entries and non-`.md` files are
 * skipped and symlinked directories are not followed. A symlinked spec file
 * IS resolved; a link outside its area is rejected and a dangling link is
 * skipped. Results are sorted by id.
 *
 * A missing root (ENOENT) yields an empty list, but any other read failure
 * (EACCES, EIO, ...) is thrown rather than swallowed, so an unreadable spec
 * never silently drops out of validate or list.
 */
export async function discoverSpecFiles(specsRoot: string): Promise<DiscoveredSpec[]> {
  const results: DiscoveredSpec[] = [];
  const walk = async (dir: string, segments: string[]): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err?.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), [...segments, entry.name]);
        continue;
      }
      if (!entry.name.endsWith(SPEC_EXT) || entry.name.length === SPEC_EXT.length) continue;
      const specFile = path.join(dir, entry.name);
      const id = [...segments, entry.name.slice(0, -SPEC_EXT.length)].join('/');
      if (entry.isFile()) {
        assertDiscoveredSpecPath(specsRoot, dir, specFile);
        results.push({ id, specFile });
      } else if (entry.isSymbolicLink()) {
        try {
          if ((await fs.stat(specFile)).isFile()) {
            assertDiscoveredSpecPath(specsRoot, dir, specFile);
            results.push({ id, specFile });
          }
        } catch (err: any) {
          // A dangling link is not content; anything else fails loudly.
          if (err?.code !== 'ENOENT') throw err;
        }
      }
    }
  };
  await walk(specsRoot, []);
  // Plain code-point comparison, not localeCompare: the latter follows the
  // process's ICU locale, so ordering could vary by OS/CI. Code-point ordering
  // guarantees the deterministic output the docstring promises.
  return results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * True when any regular non-dot file exists anywhere under the given
 * directory. Dot entries are skipped to match discoverSpecFiles; symlinks
 * count without being followed. A missing directory returns false; other
 * read failures are thrown for the caller to decide.
 */
export async function hasAnyFileUnder(dirPath: string): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    if (entry.isFile() || entry.isSymbolicLink()) {
      return true;
    }
    if (entry.isDirectory() && (await hasAnyFileUnder(path.join(dirPath, entry.name)))) {
      return true;
    }
  }
  return false;
}
