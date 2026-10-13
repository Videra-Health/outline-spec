import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readPage(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, ...relativePath.split('/')), 'utf-8');
}

const CLI_INIT = readPage('docs-lab/reference/cli.md')
  .split('## outline-spec init')[1]
  .split('## outline-spec update')[0];
const STORE_INTEGRATIONS = readPage('docs-lab/multi-repo/stores.md')
  .split('### Install integrations in a store-only repo')[1]
  .split('### `defaultStore` on your machine')[0];

describe('store-only init documentation', () => {
  it.each([
    ['CLI reference', CLI_INIT],
    ['Stores guide', STORE_INTEGRATIONS],
  ])('keeps the complete pointer-repository contract in the %s', (_name, section) => {
    expect(section).toContain('repository root');
    expect(section).toContain('preserved byte-for-byte');
    expect(section).toContain('`outline-spec/specs/` and `outline-spec/changes/`');
    expect(section).toContain('not created');
    expect(section).toContain('`--language`');
    expect(section).toContain("external store's config");
  });
});
