import { promises as fs } from 'fs';
import path from 'path';
import { FileSystemUtils } from './file-system.js';

export interface DiscoveredSpec {
  /** Spec id relative to the specs root, forward-slash separated on every platform (e.g. "web" or "platform/session-layout"). */
  id: string;
  /** Path to the spec.md file (absolute if the specs root is absolute). */
  specFile: string;
}

function assertDiscoveredSpecPath(specsRoot: string, capabilityDir: string, specFile: string): void {
  try {
    FileSystemUtils.assertPathWithin(specsRoot, specFile);
  } catch {
    // Direct capability directories may intentionally be external monorepo
    // links. In that case, confine the file to the capability itself.
    FileSystemUtils.assertPathWithin(capabilityDir, specFile);
  }
}

/**
 * Recursively discover every `spec.md` under a specs root, so both the flat
 * `specs/<id>/spec.md` layout and nested `specs/<area>/<id>/spec.md` layouts
 * are found (#1353). A `spec.md` sitting directly in the root is ignored,
 * matching the historical requirement that specs live in a capability folder.
 * Dot-directories are skipped and symlinked directories are not followed.
 * An in-capability symlinked `spec.md` IS resolved; a link outside its
 * capability is rejected and a dangling link is skipped. Results are sorted by id.
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
      } else if (entry.name === 'spec.md' && segments.length > 0) {
        const specFile = path.join(dir, entry.name);
        if (entry.isFile()) {
          assertDiscoveredSpecPath(specsRoot, dir, specFile);
          results.push({ id: segments.join('/'), specFile });
        } else if (entry.isSymbolicLink()) {
          try {
            if ((await fs.stat(specFile)).isFile()) {
              assertDiscoveredSpecPath(specsRoot, dir, specFile);
              results.push({ id: segments.join('/'), specFile });
            }
          } catch (err: any) {
            // A dangling link is not content; anything else fails loudly.
            if (err?.code !== 'ENOENT') throw err;
          }
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
