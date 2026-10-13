import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCLI } from '../helpers/run-cli.js';

const SHIPS = `# ships
Ships fly between stations.

1. Docking: Ships dock at stations.
`;

let root: string;
const file = (...p: string[]) => path.join(root, 'outline-spec', ...p);
const write = (rel: string, text: string) => {
  mkdirSync(path.dirname(file(rel)), { recursive: true });
  writeFileSync(file(rel), text);
};
const cli = (...args: string[]) => runCLI(args, { cwd: root });
const payload = (html: string) => JSON.parse(/id="outline-spec-review">([\s\S]*?)<\/script>/.exec(html)![1]);

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'outline-spec-review-')));
  write('config.yaml', 'schema: outline\n');
  write('specs/ships/spec.md', SHIPS);
  write('changes/c1/outline.md', '## Proposal\nWhy.\n\n## Requirements\n1. ships:\n  a. Docking (patch): Ships dock at ~~stations~~ **ports**.\n');
  write('changes/c1/diagrams.md', '# Diagrams\n');
  write('changes/c1/design.md', '# Design\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('outline-spec review', () => {
  it('renders the page into the temp directory and prints its path', async () => {
    const r = await cli('review', 'c1', '--json');
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ change: 'c1', enabled: true });
    expect(path.dirname(path.dirname(out.path))).toBe(path.join(os.tmpdir(), 'outline-spec-review'));
    expect(path.basename(out.path)).toBe('c1.html');
    const html = readFileSync(out.path, 'utf-8');
    expect(html).toContain('<title>c1 proposal</title>');
    const data = payload(html);
    expect(data.banner).toEqual({ valid: true, errors: [], overlaps: [] });
    expect(data.tabs.map((t: { title: string }) => t.title)).toEqual(['Outline', 'Diagrams', 'Spec changes']);
    // A leftover design.md is not shown.
    expect(data.tabs[1].files.map((f: { name: string }) => f.name)).toEqual(['diagrams.md']);
    expect(data.tabs[2].specs[0].requirements[0]).toMatchObject({ name: 'Docking', kind: 'edited' });
    rmSync(path.dirname(out.path), { recursive: true, force: true });
  });

  it('writes to --out relative to the current directory, creating folders', async () => {
    const r = await cli('review', 'c1', '--out', path.join('pages', 'deep', 'c1.html'));
    expect(r.exitCode).toBe(0);
    const expected = path.join(root, 'pages', 'deep', 'c1.html');
    expect(r.stdout.trim()).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  it('writes nothing when review-on excludes the workflow', async () => {
    write('config.yaml', 'schema: outline\nreview-on: [update]\n');
    const r = await cli('review', 'c1', '--for', 'propose', '--json', '--out', 'page.html');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ change: 'c1', enabled: false });
    expect(existsSync(path.join(root, 'page.html'))).toBe(false);
  });

  it('renders for a workflow review-on includes', async () => {
    const r = await cli('review', 'c1', '--for', 'propose', '--json', '--out', 'page.html');
    expect(JSON.parse(r.stdout)).toMatchObject({ enabled: true, path: path.join(root, 'page.html') });
  });

  it('records --url in the change metadata and reports it on later renders', async () => {
    const r = await cli('review', 'c1', '--url', 'https://claude.ai/artifact/abc', '--json');
    expect(r.exitCode).toBe(0);
    expect(readFileSync(file('changes/c1/.outline-spec.yaml'), 'utf-8')).toContain('reviewUrl: https://claude.ai/artifact/abc');
    const again = await cli('review', 'c1', '--json', '--out', 'page.html');
    expect(JSON.parse(again.stdout)).toMatchObject({ reviewUrl: 'https://claude.ai/artifact/abc' });
  });

  it('fails on an unknown change with the list of open changes', async () => {
    const r = await cli('review', 'nope');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/Change 'nope' not found\. Available changes:\s+c1/);
  });

  it('says so when the schema has no review block', async () => {
    write('schemas/plain/schema.yaml', 'name: plain\nversion: 1\nartifacts:\n  - id: outline\n    generates: outline.md\n    description: Outline\n    template: outline.md\n');
    write('schemas/plain/templates/outline.md', '# Outline\n');
    write('changes/c1/.outline-spec.yaml', 'schema: plain\n');
    const r = await cli('review', 'c1', '--json');
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).status[0].message).toMatch(/Schema 'plain' has no review block/);
  });
});
