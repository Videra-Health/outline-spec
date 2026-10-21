import * as fs from 'node:fs';
import * as path from 'node:path';

/** Minimal healthy outline-spec root layout shared by slice test suites. */
export function createOutlineSpecRoot(rootDir: string): void {
  fs.mkdirSync(path.join(rootDir, 'outline-spec', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'outline-spec', 'changes'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'outline-spec', 'config.yaml'), 'schema: outline\n');
}

/** Writes a spec file at the root's outline-spec/specs/<id>.md. */
export function writeSpec(rootDir: string, specId: string, body: string): void {
  const file = path.join(rootDir, 'outline-spec', 'specs', ...specId.split('/')) + '.md';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}
