import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
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
  write('specs/ships.md', SHIPS);
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

describe('outline-spec review --base', () => {
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const commit = () => {
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'c');
    return git('rev-parse', 'HEAD');
  };
  let base: string;
  beforeEach(() => {
    git('init', '-q', '-b', 'main');
    write('changes/stale/outline.md', '## Proposal\nOld.\n\n## Requirements\n1. ships:\n  a. Docking (patch): Ships dock at ~~stations~~ **docks**.\n');
    base = commit();
    git('checkout', '-q', '-b', 'fix-docking');
    write('specs/ships.md', `${SHIPS}2. Hulls: Every ship has a hull.\n`);
    write('changes/c1/diagrams.md', '# Diagrams\nEdited on the branch.\n');
    writeFileSync(path.join(root, 'summary.md'), '# Why\n\n<script>alert(1)</script>\n');
  });

  it('renders Summary, Spec changes and the touched change, with the base and changes in --json', async () => {
    const r = await cli('review', '--base', 'main', '--summary', 'summary.md', '--title', 'Fix docking', '--out', 'pr.html', '--json');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ path: path.join(root, 'pr.html'), base, changes: ['c1'] });
    const data = payload(readFileSync(path.join(root, 'pr.html'), 'utf-8'));
    expect(data).toMatchObject({ title: 'Fix docking', base, banner: null });
    expect(data.tabs.map((t: { title: string }) => t.title)).toEqual(['Summary', 'Spec changes', 'c1 · Outline', 'c1 · Diagrams']);
    expect(data.tabs[0].files[0]).toMatchObject({ untrusted: true, markdown: '# Why\n\n<script>alert(1)</script>\n' });
    expect(data.tabs[1].specs[0].requirements[0]).toMatchObject({ name: 'Hulls', kind: 'added' });
  });

  it('heads the page with the branch and leaves out a change the work did not touch', async () => {
    rmSync(file('changes', 'c1'), { recursive: true });
    const r = await cli('review', '--base', 'main', '--out', 'pr.html', '--json');
    expect(JSON.parse(r.stdout).changes).toEqual([]);
    const data = payload(readFileSync(path.join(root, 'pr.html'), 'utf-8'));
    expect(data.title).toBe('fix-docking');
    expect(data.tabs.map((t: { title: string }) => t.title)).toEqual(['Spec changes']);
  });

  it('names a touched change that fails validate in the banner', async () => {
    write('changes/c1/outline.md', '## Proposal\nWhy.\n\n## Requirements\n1. ships:\n  a. Nope (patch):\n');
    const data = payload(readFileSync(JSON.parse((await cli('review', '--base', 'main', '--out', 'pr.html', '--json')).stdout).path, 'utf-8'));
    expect(data.banner).toMatchObject({ valid: false, errors: ['c1: ships › Nope: no such requirement to patch'] });
  });

  it('gives a repository without outline-spec a Summary-only page', async () => {
    rmSync(file(), { recursive: true });
    commit();
    const r = await cli('review', '--base', 'main', '--summary', 'summary.md', '--out', 'pr.html', '--json');
    expect(r.exitCode).toBe(0);
    expect(payload(readFileSync(path.join(root, 'pr.html'), 'utf-8')).tabs.map((t: { title: string }) => t.title)).toEqual(['Summary']);
  });

  it('fails naming a base git cannot resolve, writing nothing', async () => {
    const r = await cli('review', '--base', 'nope', '--out', 'pr.html');
    expect(r.exitCode).toBe(1);
    expect(r.stderr + r.stdout).toContain("Can't resolve base 'nope' to a commit");
    expect(existsSync(path.join(root, 'pr.html'))).toBe(false);
  });

  it('asks for a change or --base when given neither', async () => {
    const r = await cli('review');
    expect(r.exitCode).toBe(1);
    expect(r.stderr + r.stdout).toContain('Name a change to review, or pass --base <ref>');
  });

  it('leaves the working tree, index and branch as they were', async () => {
    const before = [git('status', '--porcelain'), git('rev-parse', '--abbrev-ref', 'HEAD')];
    await cli('review', '--base', 'main', '--out', path.join('..', `${path.basename(root)}-pr.html`));
    expect([git('status', '--porcelain'), git('rev-parse', '--abbrev-ref', 'HEAD')]).toEqual(before);
    rmSync(path.join(root, '..', `${path.basename(root)}-pr.html`), { force: true });
  });
});
