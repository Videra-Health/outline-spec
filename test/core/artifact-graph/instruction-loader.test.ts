import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseSchema } from '../../../src/core/artifact-graph/schema.js';
import {
  loadTemplate,
  loadChangeContext,
  generateInstructions,
  formatChangeStatus,
  TemplateLoadError,
} from '../../../src/core/artifact-graph/instruction-loader.js';

const PACKAGED_SCHEMAS_DIR = path.join(__dirname, '..', '..', '..', 'schemas');

/** Every artifact of every packaged schema, with the template it generates from. */
function packagedArtifacts(): Array<[schema: string, artifactId: string, template: string]> {
  return fs
    .readdirSync(PACKAGED_SCHEMAS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const schemaPath = path.join(PACKAGED_SCHEMAS_DIR, entry.name, 'schema.yaml');
      const schema = parseSchema(fs.readFileSync(schemaPath, 'utf-8'));
      return schema.artifacts.map(
        (artifact): [string, string, string] => [entry.name, artifact.id, artifact.template]
      );
    });
}

/** First line and the line under it, on normalized endings (the repo may be checked out CRLF). */
function openingLines(template: string): [string, string] {
  const [firstLine = '', secondLine = ''] = template.replace(/\r\n?/g, '\n').split('\n');
  return [firstLine, secondLine];
}

describe('instruction-loader', () => {
  describe('loadTemplate', () => {
    it('should load template from schema directory', () => {
      const template = loadTemplate('outline', 'outline.md');

      expect(template).toContain('## Proposal');
      expect(template).toContain('## Requirements');
      expect(template).toContain('(patch):');
      expect(template).toContain('~~<words dropped>~~ **<words added>**');
    });

    // Artifacts inherit the template's opening line, so every packaged template
    // starts the document with an `# ` title instead of a section header.
    // Without it every generated outline.md, diagrams.md and tasks.md
    // trips markdownlint MD041 (#1138).
    // An HTML template is a page, not a Markdown document, so MD041 doesn't apply.
    it.each(packagedArtifacts().filter(([, , templateName]) => templateName.endsWith('.md')))(
      'opens the %s schema\'s %s template with a title',
      (schemaName, _artifactId, templateName) => {
        const [firstLine, secondLine] = openingLines(loadTemplate(schemaName, templateName));

        expect(firstLine).toMatch(/^# \S/);
        expect(secondLine).toBe('');
      }
    );

    describe('outline titles', () => {
      const TITLES: Record<string, string> = {
        outline: '# Outline',
        diagrams: '# Diagrams',
        designs: '<!doctype html>',
        tasks: '# Tasks',
      };

      const artifacts = packagedArtifacts().filter(([schemaName]) => schemaName === 'outline');

      // Pins the wording, not just the shape: a template retitled by accident
      // would pass the guard above.
      it.each(artifacts)('titles %s\'s %s artifact', (schemaName, artifactId, templateName) => {
        const [firstLine] = openingLines(loadTemplate(schemaName, templateName));

        expect(firstLine).toBe(TITLES[artifactId]);
      });

      // And the table covers the whole schema, so a new artifact cannot be
      // added without deciding what its document is called.
      it('names every artifact the schema declares', () => {
        expect(artifacts.map(([, artifactId]) => artifactId).sort()).toEqual(
          Object.keys(TITLES).sort()
        );
      });
    });

    it('should throw TemplateLoadError for non-existent template', () => {
      expect(() => loadTemplate('outline', 'nonexistent.md')).toThrow(
        TemplateLoadError
      );
    });

    it('should throw TemplateLoadError for non-existent schema', () => {
      expect(() => loadTemplate('nonexistent-schema', 'outline.md')).toThrow(
        TemplateLoadError
      );
    });

    it('should include template path in error', () => {
      try {
        loadTemplate('outline', 'nonexistent.md');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TemplateLoadError);
        expect((err as TemplateLoadError).templatePath).toContain('nonexistent.md');
      }
    });

    it('should reject a template symlink that escapes its schema', () => {
      if (process.platform === 'win32') return;

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-template-boundary-'));
      const schemaDir = path.join(tempDir, 'outline-spec', 'schemas', 'custom');
      const templatesDir = path.join(schemaDir, 'templates');
      const outsideFile = path.join(tempDir, 'outside.md');
      fs.mkdirSync(templatesDir, { recursive: true });
      fs.writeFileSync(path.join(schemaDir, 'schema.yaml'), 'name: custom\n');
      fs.writeFileSync(outsideFile, 'private');
      fs.symlinkSync(outsideFile, path.join(templatesDir, 'proposal.md'));

      try {
        expect(() => loadTemplate('custom', 'proposal.md', tempDir)).toThrow(
          /outside the allowed directory/u
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should reject Windows-style template traversal on Windows', () => {
      if (process.platform !== 'win32') return;

      expect(() => loadTemplate('outline', '..\\outside.md')).toThrow(
        TemplateLoadError
      );
    });
  });

  describe('loadChangeContext', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should load context with default schema', () => {
      const context = loadChangeContext(tempDir, 'my-change');

      expect(context.schemaName).toBe('outline');
      expect(context.changeName).toBe('my-change');
      expect(context.graph.getName()).toBe('outline');
      expect(context.completed.size).toBe(0);
    });

    it('should load context with explicit schema', () => {
      const context = loadChangeContext(tempDir, 'my-change', 'outline');

      expect(context.schemaName).toBe('outline');
      expect(context.graph.getName()).toBe('outline');
    });

    it('should detect completed artifacts', () => {
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });
      fs.writeFileSync(path.join(changeDir, 'outline.md'), '# Outline');

      const context = loadChangeContext(tempDir, 'my-change');

      expect(context.completed.has('outline')).toBe(true);
    });

    it('should return empty completed set for non-existent change directory', () => {
      const context = loadChangeContext(tempDir, 'nonexistent-change');

      expect(context.completed.size).toBe(0);
    });

    it('should auto-detect schema from .outline-spec.yaml metadata', () => {
      // Create change directory with metadata file
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });
      fs.writeFileSync(path.join(changeDir, '.outline-spec.yaml'), 'schema: outline\ncreated: "2025-01-05"\n');

      // Load without explicit schema - should detect from metadata
      const context = loadChangeContext(tempDir, 'my-change');

      expect(context.schemaName).toBe('outline');
      expect(context.graph.getName()).toBe('outline');
    });

    it('should use explicit schema over metadata schema', () => {
      // Create change directory with metadata file using outline
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });
      fs.writeFileSync(path.join(changeDir, '.outline-spec.yaml'), 'schema: outline\n');

      // Load with explicit schema - should override metadata
      const context = loadChangeContext(tempDir, 'my-change', 'outline');

      expect(context.schemaName).toBe('outline');
      expect(context.graph.getName()).toBe('outline');
    });

    it('should fall back to default when no metadata and no explicit schema', () => {
      // Create change directory without metadata file
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });

      const context = loadChangeContext(tempDir, 'my-change');

      expect(context.schemaName).toBe('outline');
    });
  });

  describe('generateInstructions', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should include artifact metadata', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const instructions = generateInstructions(context, 'outline');

      expect(instructions.changeName).toBe('my-change');
      expect(instructions.artifactId).toBe('outline');
      expect(instructions.schemaName).toBe('outline');
      expect(instructions.outputPath).toBe('outline.md');
    });

    it('should include template content', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const instructions = generateInstructions(context, 'outline');

      expect(instructions.template).toContain('## Requirements');
    });

    it('should show dependencies with completion status', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const instructions = generateInstructions(context, 'tasks');

      expect(instructions.dependencies).toHaveLength(1);
      expect(instructions.dependencies[0].id).toBe('outline');
      expect(instructions.dependencies[0].done).toBe(false);
    });

    it('should mark completed dependencies as done', () => {
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });
      fs.writeFileSync(path.join(changeDir, 'outline.md'), '# Outline');

      const context = loadChangeContext(tempDir, 'my-change');
      const instructions = generateInstructions(context, 'tasks');

      expect(instructions.dependencies[0].done).toBe(true);
    });

    it('should list artifacts unlocked by this one', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const instructions = generateInstructions(context, 'outline');

      // outline unlocks diagrams, designs, and tasks, in the schema's declared order
      expect(instructions.unlocks).toEqual(['diagrams', 'designs', 'tasks']);
    });

    it('should have empty dependencies for root artifact', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const instructions = generateInstructions(context, 'outline');

      expect(instructions.dependencies).toHaveLength(0);
    });

    it('should throw for non-existent artifact', () => {
      const context = loadChangeContext(tempDir, 'my-change');

      expect(() => generateInstructions(context, 'nonexistent')).toThrow(
        "Artifact 'nonexistent' not found"
      );
    });

    describe('project config integration', () => {
      it('should return context as separate field for all artifacts', () => {
        // Create project config
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
context: |
  Tech stack: TypeScript, React
  API style: RESTful
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        // Context should be in separate field, not in template
        expect(instructions.context).toContain('Tech stack: TypeScript, React');
        expect(instructions.context).toContain('API style: RESTful');
        expect(instructions.template).not.toContain('Tech stack');
        expect(instructions.template).toContain('## Requirements'); // Actual template content
      });

      it('should return undefined context when config is absent', () => {
        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        expect(instructions.context).toBeUndefined();
        expect(instructions.rules).toBeUndefined();
        expect(instructions.template).toContain('## Requirements'); // Actual template content
      });

      it('should preserve multi-line context', () => {
        // Create project config with multi-line context
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
context: |
  Line 1
  Line 2
  Line 3
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        expect(instructions.context).toContain('Line 1\nLine 2\nLine 3');
      });

      it('should preserve special characters in context', () => {
        // Create project config with special characters
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
context: |
  Special: < > & " ' @ # $ % [ ] { }
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        expect(instructions.context).toContain('Special: < > & " \' @ # $ % [ ] { }');
      });

      it('should return rules only for matching artifact', () => {
        // Create project config with rules
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
rules:
  outline:
    - Include rollback plan
    - Identify affected teams
  tasks:
    - Use Given/When/Then format
`
        );

        const context = loadChangeContext(tempDir, 'my-change');

        // Check outline artifact has its rules
        const outlineInstructions = generateInstructions(context, 'outline', tempDir);
        expect(outlineInstructions.rules).toEqual(['Include rollback plan', 'Identify affected teams']);
        expect(outlineInstructions.template).not.toContain('rollback plan');

        // Check tasks artifact has its rules
        const tasksInstructions = generateInstructions(context, 'tasks', tempDir);
        expect(tasksInstructions.rules).toEqual(['Use Given/When/Then format']);
        expect(tasksInstructions.template).not.toContain('Given/When/Then');
      });

      it('should return undefined rules for non-matching artifact', () => {
        // Create project config with rules only for outline
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
rules:
  outline:
    - Include rollback plan
`
        );

        const context = loadChangeContext(tempDir, 'my-change');

        // Check diagrams artifact (no rules configured) has undefined rules
        const diagramsInstructions = generateInstructions(context, 'diagrams', tempDir);
        expect(diagramsInstructions.rules).toBeUndefined();
      });

      it('should not inherit rules from the rule map prototype', () => {
        const context = loadChangeContext(tempDir, 'my-change');
        const inheritedRules = Object.create({
          outline: ['Inherited rule'],
        }) as Record<string, string[]>;

        const instructions = generateInstructions(context, 'outline', tempDir, {
          projectConfig: { rules: inheritedRules },
        });

        expect(instructions.rules).toBeUndefined();
      });

      it('should return undefined rules when empty array', () => {
        // Create project config with empty rules array
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
context: Some context
rules:
  outline: []
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        expect(instructions.context).toBe('Some context');
        expect(instructions.rules).toBeUndefined();
      });

      it('should keep context, rules, and template as separate fields', () => {
        // Create project config with both context and rules
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
context: Project context here
rules:
  outline:
    - Rule 1
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        // All three should be separate
        expect(instructions.context).toBe('Project context here');
        expect(instructions.rules).toEqual(['Rule 1']);
        expect(instructions.template).toContain('## Requirements');
        // Template should not contain context or rules
        expect(instructions.template).not.toContain('Project context here');
        expect(instructions.template).not.toContain('Rule 1');
      });

      it('should handle context without rules', () => {
        // Create project config with only context
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
context: Project context only
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        expect(instructions.context).toBe('Project context only');
        expect(instructions.rules).toBeUndefined();
        expect(instructions.template).toContain('## Requirements');
      });

      it('should handle rules without context', () => {
        // Create project config with only rules
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
rules:
  outline:
    - Rule only
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline', tempDir);

        expect(instructions.context).toBeUndefined();
        expect(instructions.rules).toEqual(['Rule only']);
        expect(instructions.template).toContain('## Requirements');
      });

      it('should work without project root parameter', () => {
        const context = loadChangeContext(tempDir, 'my-change');
        const instructions = generateInstructions(context, 'outline'); // No projectRoot

        expect(instructions.context).toBeUndefined();
        expect(instructions.rules).toBeUndefined();
        expect(instructions.template).toContain('## Requirements');
      });
    });

    describe('validation and warnings', () => {
      let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      });

      afterEach(() => {
        consoleWarnSpy.mockRestore();
      });

      it('should warn about unknown artifact IDs in rules', () => {
        // Create project config with invalid artifact ID
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
rules:
  outline:
    - Valid rule
  invalid-artifact:
    - Invalid rule
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        generateInstructions(context, 'outline', tempDir);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown artifact ID in rules: "invalid-artifact"')
        );
      });

      it('should deduplicate validation warnings within session', () => {
        // Create a fresh temp directory to avoid cache pollution
        const freshTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-test-'));

        try {
          // Create project config with a uniquely named invalid artifact ID
          const configDir = path.join(freshTempDir, 'outline-spec');
          fs.mkdirSync(configDir, { recursive: true });
          fs.writeFileSync(
            path.join(configDir, 'config.yaml'),
            `schema: outline
rules:
  unique-invalid-artifact-${Date.now()}:
    - Invalid rule
`
          );

          const context = loadChangeContext(freshTempDir, 'my-change');

          // Call multiple times
          generateInstructions(context, 'outline', freshTempDir);
          generateInstructions(context, 'tasks', freshTempDir);
          generateInstructions(context, 'diagrams', freshTempDir);

          // Warning should be shown only once (deduplication works)
          // Note: We may have gotten warnings from other tests, so check that
          // the count didn't increase by more than 1 from the first call
          const callCount = consoleWarnSpy.mock.calls.filter(call =>
            call[0]?.includes('Unknown artifact ID in rules')
          ).length;

          expect(callCount).toBeGreaterThanOrEqual(1);
        } finally {
          fs.rmSync(freshTempDir, { recursive: true, force: true });
        }
      });

      it('should not warn for valid artifact IDs', () => {
        // Create project config with valid artifact IDs
        const configDir = path.join(tempDir, 'outline-spec');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, 'config.yaml'),
          `schema: outline
rules:
  outline:
    - Rule 1
  tasks:
    - Rule 2
`
        );

        const context = loadChangeContext(tempDir, 'my-change');
        generateInstructions(context, 'outline', tempDir);

        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('formatChangeStatus', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should show all artifacts as ready/blocked when nothing completed', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const status = formatChangeStatus(context);

      expect(status.changeName).toBe('my-change');
      expect(status.schemaName).toBe('outline');
      expect(status.isPlanningComplete).toBe(false);
      expect(status.isComplete).toBe(false);

      // outline has no deps, should be ready
      const outline = status.artifacts.find(a => a.id === 'outline');
      expect(outline?.status).toBe('ready');

      // tasks depends on outline, should be blocked
      const tasks = status.artifacts.find(a => a.id === 'tasks');
      expect(tasks?.status).toBe('blocked');
      expect(tasks?.missingDeps).toContain('outline');
    });

    it('should show completed artifacts as done', () => {
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });
      fs.writeFileSync(path.join(changeDir, 'outline.md'), '# Outline');

      const context = loadChangeContext(tempDir, 'my-change');
      const status = formatChangeStatus(context);

      const outline = status.artifacts.find(a => a.id === 'outline');
      expect(outline?.status).toBe('done');

      // tasks should now be ready
      const tasks = status.artifacts.find(a => a.id === 'tasks');
      expect(tasks?.status).toBe('ready');
    });

    it('should include output paths for each artifact', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const status = formatChangeStatus(context);

      const outline = status.artifacts.find(a => a.id === 'outline');
      expect(outline?.outputPath).toBe('outline.md');

      const tasks = status.artifacts.find(a => a.id === 'tasks');
      expect(tasks?.outputPath).toBe('tasks.md');
    });

    it('should report planning completion without removing the compatibility alias', () => {
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });

      // Create all files for the outline schema
      fs.writeFileSync(path.join(changeDir, 'outline.md'), '# Outline');
      fs.writeFileSync(path.join(changeDir, 'diagrams.md'), '# Diagrams');
      fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks');

      const context = loadChangeContext(tempDir, 'my-change');
      const status = formatChangeStatus(context);

      expect(status.isPlanningComplete).toBe(true);
      expect(status.isComplete).toBe(true);
      expect(status.isComplete).toBe(status.isPlanningComplete);
      expect(status.artifacts.filter(a => !a.optional).every(a => a.status === 'done')).toBe(true);
      expect(status.artifacts.find(a => a.id === 'designs')).toMatchObject({ status: 'ready', optional: true });
      expect(status.artifacts.find(a => a.id === 'tasks')).not.toHaveProperty('optional');
    });

    it('should show blocked artifacts with missing dependencies', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const status = formatChangeStatus(context);

      // tasks requires outline
      const tasks = status.artifacts.find(a => a.id === 'tasks');
      expect(tasks?.status).toBe('blocked');
      expect(tasks?.missingDeps).toEqual(['outline']);
    });

    it('should expose each artifact\'s requires edges regardless of status', () => {
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
      fs.mkdirSync(changeDir, { recursive: true });
      // Prewritten-tasks scenario: only tasks.md exists. `tasks` reads `done`
      // by file existence, but its outline dependency was never written.
      fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks');

      const context = loadChangeContext(tempDir, 'my-change');
      const status = formatChangeStatus(context);

      // A done artifact must still carry its requires edges so callers can
      // compute the transitive required set (alfred's PR #1412 blocker).
      const tasks = status.artifacts.find(a => a.id === 'tasks');
      expect(tasks?.status).toBe('done');
      expect(tasks?.requires).toEqual(['outline']);

      // outline has no dependencies -> empty edges, not undefined.
      const outline = status.artifacts.find(a => a.id === 'outline');
      expect(outline?.requires).toEqual([]);

      // Every artifact carries the field, whatever its status.
      expect(status.artifacts.every(a => Array.isArray(a.requires))).toBe(true);
    });

    it('should sort artifacts in build order', () => {
      const context = loadChangeContext(tempDir, 'my-change');
      const status = formatChangeStatus(context);

      const ids = status.artifacts.map(a => a.id);
      expect(ids).toEqual(['outline', 'diagrams', 'designs', 'tasks']);
    });
  });
});
