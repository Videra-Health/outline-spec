import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// validate parses with the mermaid dependency and the review page draws with the CDN build, so they must match.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(ROOT, 'schemas', 'outline', 'templates', 'review.html');

describe('Mermaid version', () => {
  it('is pinned exactly in package.json and matches the review page CDN URL', () => {
    const pinned: string | undefined = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).dependencies?.mermaid;
    expect(pinned, 'package.json must pin mermaid to an exact version, with no range').toMatch(/^\d+\.\d+\.\d+$/);
    const cdn = /cdn\.jsdelivr\.net\/npm\/mermaid@([^/"']+)\//.exec(readFileSync(TEMPLATE, 'utf-8'))?.[1];
    expect(cdn, `review.html must load mermaid@<version> from the CDN`).toBeDefined();
    expect(cdn, `review.html loads mermaid@${cdn} but package.json pins mermaid ${pinned}; change both together`).toBe(pinned);
  });
});
