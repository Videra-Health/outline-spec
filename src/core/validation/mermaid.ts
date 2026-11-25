/** Finds Mermaid blocks in Markdown that Mermaid can't parse: a change's files, or any files named on the command line. */
import { promises as fs } from 'fs';
import path from 'path';
import type { ValidationIssue } from './types.js';

export const MERMAID_ISSUE = 'Mermaid diagram does not parse';
export const MERMAID_FIX_HINT = 'Fix each Mermaid block so it parses; a name that is a Mermaid keyword (loop, end, alt, opt, note) is a common cause';

const OPEN = /^\s*(`{3,}|~{3,})(.*)$/;

/**
 * Each fenced mermaid block in `markdown`, with the 1-based line of its opening fence: the blocks the review page draws.
 * A block counts when its info string's first word is `mermaid`, and a fence inside another fenced block is that block's text.
 */
export function mermaidBlocks(markdown: string): Array<{ line: number; source: string }> {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Array<{ line: number; source: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]);
    if (!open) continue;
    const [, fence, info] = open;
    // A backtick fence's info string can't hold a backtick; such a line is inline code, not a fence.
    if (fence[0] === '`' && info.includes('`')) continue;
    const close = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) body.push(lines[j++]);
    if (info.trim().split(/\s+/)[0] === 'mermaid') blocks.push({ line: i + 1, source: body.join('\n') });
    i = j;
  }
  return blocks;
}

type Parse = (source: string) => Promise<unknown>;
let parser: Promise<Parse> | undefined;

// Mermaid's sanitizer needs a DOM, so it loads behind a jsdom window, once, and only when there are diagrams.
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

/** Mermaid's message on one line, without the caret line that points into the block. */
function parseMessage(error: unknown): string {
  return String((error as Error)?.message ?? error).split('\n').map((l) => l.trim()).filter((l) => l && !/^-*\^$/.test(l)).join(' ');
}

/** One error per Mermaid block in `text` that fails to parse, reported against `file`. */
export async function mermaidIssuesIn(file: string, text: string): Promise<ValidationIssue[]> {
  const blocks = mermaidBlocks(text);
  if (!blocks.length) return [];
  const parse = await loadParser();
  const issues: ValidationIssue[] = [];
  for (const b of blocks) {
    try {
      await parse(b.source);
    } catch (error) {
      const detail = parseMessage(error);
      issues.push({ level: 'ERROR', path: `${file}:${b.line}`, message: `${MERMAID_ISSUE}: ${detail}`, file, line: b.line, error: detail });
    }
  }
  return issues;
}

/** Markdown files under `dir`, relative to it and written with `/`, in name order. */
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
  const issues: ValidationIssue[] = [];
  for (const file of await markdownFiles(changeDir)) {
    // Unreadable files are reported by the checks that own them.
    const text = await fs.readFile(path.join(changeDir, ...file.split('/')), 'utf-8').catch(() => '');
    issues.push(...await mermaidIssuesIn(file, text));
  }
  return issues;
}

export interface MarkdownFileResult {
  /** The path as given. */
  file: string;
  issues: ValidationIssue[];
  durationMs: number;
}

/**
 * Checks each named Markdown file's Mermaid blocks, in the order given. Each path resolves against `cwd` and is reported as given;
 * a file that can't be read is one error naming it. When Mermaid itself can't load, this rejects.
 */
export async function checkMarkdownFiles(files: string[], cwd = process.cwd()): Promise<MarkdownFileResult[]> {
  const results: MarkdownFileResult[] = [];
  for (const file of files) {
    const start = Date.now();
    let text: string;
    try {
      text = await fs.readFile(path.resolve(cwd, file), 'utf-8');
    } catch (error) {
      const reason = (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'no such file' : parseMessage(error);
      results.push({ file, issues: [{ level: 'ERROR', path: file, message: `Cannot read ${file}: ${reason}`, file }], durationMs: Date.now() - start });
      continue;
    }
    results.push({ file, issues: await mermaidIssuesIn(file, text), durationMs: Date.now() - start });
  }
  return results;
}
