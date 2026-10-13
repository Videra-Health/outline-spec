import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveSchema } from '../../../src/core/artifact-graph/resolver.js';
import { ArtifactGraph } from '../../../src/core/artifact-graph/graph.js';
import { detectCompleted } from '../../../src/core/artifact-graph/state.js';
import { parseSchema } from '../../../src/core/artifact-graph/schema.js';
import type { BlockedArtifacts } from '../../../src/core/artifact-graph/types.js';

// A schema with a multi-file glob artifact; the built-in outline schema has none.
function globSchema() {
  return parseSchema(`name: glob-test
version: 1
artifacts:
  - id: outline
    generates: outline.md
    description: Outline
    template: outline.md
  - id: notes
    generates: "notes/**/*.md"
    description: Notes
    template: notes.md
    requires: [outline]
`);
}

/**
 * Normalize BlockedArtifacts for comparison by sorting dependency arrays.
 * The order of unmet dependencies is not guaranteed, so we sort for stable assertions.
 */
function normalizeBlocked(blocked: BlockedArtifacts): BlockedArtifacts {
  const normalized: BlockedArtifacts = {};
  for (const [key, deps] of Object.entries(blocked)) {
    normalized[key] = [...deps].sort();
  }
  return normalized;
}

describe('artifact-graph workflow integration', () => {
  let tempDir: string;

  beforeEach(() => {
    // Use a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-workflow-test-'));
  });

  afterEach(() => {
    // Clean up temp directory after each test
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('outline workflow', () => {
    it('should progress through complete workflow', () => {
      const schema = resolveSchema('outline');
      const graph = ArtifactGraph.fromSchema(schema);

      expect(graph.getName()).toBe('outline');
      expect(graph.getAllArtifacts()).toHaveLength(3);

      // Nothing complete: only outline is ready
      let completed = detectCompleted(graph, tempDir);
      expect(completed.size).toBe(0);
      expect(graph.getNextArtifacts(completed)).toEqual(['outline']);
      expect(graph.isComplete(completed)).toBe(false);
      expect(normalizeBlocked(graph.getBlocked(completed))).toEqual({
        design: ['outline'],
        tasks: ['outline'],
      });

      // outline.md unlocks design and tasks
      fs.writeFileSync(path.join(tempDir, 'outline.md'), '## Proposal\n\nInitial content.');
      completed = detectCompleted(graph, tempDir);
      expect(completed).toEqual(new Set(['outline']));
      expect(graph.getNextArtifacts(completed)).toEqual(['design', 'tasks']);
      expect(graph.getBlocked(completed)).toEqual({});

      fs.writeFileSync(path.join(tempDir, 'tasks.md'), '## 1. Work\n\n- [ ] 1.1 Implement feature');
      completed = detectCompleted(graph, tempDir);
      expect(completed).toEqual(new Set(['outline', 'tasks']));
      expect(graph.getNextArtifacts(completed)).toEqual(['design']);

      fs.writeFileSync(path.join(tempDir, 'design.md'), '# Design');
      completed = detectCompleted(graph, tempDir);
      expect(completed).toEqual(new Set(['outline', 'design', 'tasks']));
      expect(graph.getNextArtifacts(completed)).toEqual([]);
      expect(graph.isComplete(completed)).toBe(true);
    });

    it('should handle out-of-order file creation', () => {
      const schema = resolveSchema('outline');
      const graph = ArtifactGraph.fromSchema(schema);

      fs.writeFileSync(path.join(tempDir, 'design.md'), '# Design');
      let completed = detectCompleted(graph, tempDir);
      // Completion is filesystem-based, so design counts even before outline
      expect(completed).toEqual(new Set(['design']));
      expect(graph.getNextArtifacts(completed)).toEqual(['outline']);

      fs.writeFileSync(path.join(tempDir, 'outline.md'), '## Proposal');
      completed = detectCompleted(graph, tempDir);
      expect(completed).toEqual(new Set(['outline', 'design']));
      expect(graph.getNextArtifacts(completed)).toEqual(['tasks']);
    });

    it('should handle multiple files in a glob artifact', () => {
      const graph = ArtifactGraph.fromSchema(globSchema());
      fs.writeFileSync(path.join(tempDir, 'outline.md'), '## Proposal');
      const notesDir = path.join(tempDir, 'notes');
      fs.mkdirSync(notesDir, { recursive: true });
      fs.writeFileSync(path.join(notesDir, 'auth.md'), '# Auth');
      fs.writeFileSync(path.join(notesDir, 'api.md'), '# API');

      const completed = detectCompleted(graph, tempDir);
      expect(completed.has('notes')).toBe(true);
    });
  });

  describe('build order consistency', () => {
    it('should follow the declared outline -> design -> tasks sequence', () => {
      // design and tasks are siblings (both require only outline); ties break by declaration order.
      const schema = resolveSchema('outline');
      const graph = ArtifactGraph.fromSchema(schema);

      expect(graph.getBuildOrder()).toEqual(['outline', 'design', 'tasks']);
      expect(graph.getNextArtifacts(new Set(['outline']))).toEqual(['design', 'tasks']);
    });

    it('should return consistent build order across multiple calls', () => {
      const schema = resolveSchema('outline');
      const graph = ArtifactGraph.fromSchema(schema);

      const order1 = graph.getBuildOrder();
      const order2 = graph.getBuildOrder();
      const order3 = graph.getBuildOrder();

      expect(order1).toEqual(order2);
      expect(order2).toEqual(order3);
    });
  });

  describe('empty and edge cases', () => {
    it('should handle empty change directory gracefully', () => {
      const schema = resolveSchema('outline');
      const graph = ArtifactGraph.fromSchema(schema);

      // Directory exists but is empty
      const completed = detectCompleted(graph, tempDir);
      expect(completed.size).toBe(0);
      expect(graph.getNextArtifacts(completed)).toEqual(['outline']);
    });

    it('should handle non-existent change directory', () => {
      const schema = resolveSchema('outline');
      const graph = ArtifactGraph.fromSchema(schema);

      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      const completed = detectCompleted(graph, nonExistentDir);
      expect(completed.size).toBe(0);
    });

    it('should not count non-matching files in glob directories', () => {
      const graph = ArtifactGraph.fromSchema(globSchema());

      const notesDir = path.join(tempDir, 'notes');
      fs.mkdirSync(notesDir, { recursive: true });
      fs.writeFileSync(path.join(notesDir, 'notes.txt'), 'not a markdown file');
      fs.writeFileSync(path.join(notesDir, 'data.json'), '{}');

      const completed = detectCompleted(graph, tempDir);
      expect(completed.has('notes')).toBe(false);
    });
  });
});
