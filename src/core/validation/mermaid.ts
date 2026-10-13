/** Finds Mermaid blocks in a change's Markdown files that Mermaid can't parse. */
import { promises as fs } from 'fs';
import path from 'path';
import type { ValidationIssue } from './types.js';

export const MERMAID_ISSUE = 'Mermaid diagram does not parse';
const FENCE = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/;

/** Each fenced mermaid block in `markdown`, with the 1-based line of its opening fence. */
export function mermaidBlocks(markdown: string): Array<{ line: number; source: string }> {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Array<{ line: number; source: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]);
    if (!open) continue;
    const close = new RegExp(`^\\s*${open[2][0]}{${open[2].length},}\\s*$`);
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) body.push(lines[j++]);
    blocks.push({ line: i + 1, source: body.join('\n') });
    i = j;
  }
  return blocks;
}

type Parse = (source: string) => Promise<unknown>;
let parser: Promise<Parse> | undefined;

// Mermaid's sanitizer needs a DOM, so it loads behind a jsdom window, once, and only when a change has diagrams.
function loadParser(): Promise<Parse> {
  parser ??= (async () => {
    const { JSDOM } = await import('jsdom');
    const g = globalThis as Record<string, unknown>;
    if (!g.window) {
      const { window } = new JSDOM('');
      g.window = window;
      g.document = window.document;
    }
    const { default: mermaid } = await import('mermaid');
    return (source: string) => mermaid.parse(source);
  })();
  return parser;
}

async function markdownFiles(dir: string, rel = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await markdownFiles(dir, p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** One error per Mermaid block in the change's Markdown files that fails to parse. */
export async function findMermaidIssues(changeDir: string): Promise<ValidationIssue[]> {
  const found: Array<{ file: string; line: number; source: string }> = [];
  for (const file of await markdownFiles(changeDir)) {
    // Unreadable files are reported by the checks that own them.
    const text = await fs.readFile(path.join(changeDir, file), 'utf-8').catch(() => '');
    for (const b of mermaidBlocks(text)) found.push({ file, ...b });
  }
  if (!found.length) return [];
  const parse = await loadParser();
  const issues: ValidationIssue[] = [];
  for (const b of found) {
    try {
      await parse(b.source);
    } catch (error) {
      const detail = String((error as Error)?.message ?? error).split('\n').map((l) => l.trim()).filter((l) => l && !/^-*\^$/.test(l)).join(' ');
      issues.push({ level: 'ERROR', path: `${b.file}:${b.line}`, message: `${MERMAID_ISSUE}: ${detail}` });
    }
  }
  return issues;
}
