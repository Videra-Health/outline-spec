import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

describe('spec command', () => {
  const projectRoot = process.cwd();
  const testDir = path.join(projectRoot, 'test-spec-command-tmp');
  const specsDir = path.join(testDir, 'openspec', 'specs');
  const openspecBin = path.join(projectRoot, 'bin', 'openspec.js');
  
  
  beforeEach(async () => {
    await fs.mkdir(specsDir, { recursive: true });
    
    const testSpec = `# auth
This is a test specification for the authentication system.

1. User Authentication: The system provides secure user authentication.
  a. Valid credentials sign the user in.
    i. The session lasts one day.
2. Password Reset: The system lets users reset their password.
  a. A reset link goes to the registered email.
`;

    await fs.mkdir(path.join(specsDir, 'auth'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'auth', 'spec.md'), testSpec);

    const testSpec2 = `# payment
This specification defines the payment processing system.

1. Process Payments: The system processes credit card payments securely.
`;

    await fs.mkdir(path.join(specsDir, 'payment'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'payment', 'spec.md'), testSpec2);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('spec show', () => {
    it('should display spec in text format', async () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, 'spec', 'show', 'auth'], {
          encoding: 'utf-8'
        });
        
        // Raw passthrough should match spec.md content
        const raw = await fs.readFile(path.join(specsDir, 'auth', 'spec.md'), 'utf-8');
        expect(output.trim()).toBe(raw.trim());
      } finally {
        process.chdir(originalCwd);
      }
    });

    const run = (args: string[]): string => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        return execFileSync('node', [openspecBin, ...args], { encoding: 'utf-8' });
      } finally {
        process.chdir(originalCwd);
      }
    };

    it('should output spec as JSON with --json flag', () => {
      const json = JSON.parse(run(['spec', 'show', 'auth', '--json']));
      expect(json.name).toBe('auth');
      expect(json.purpose).toContain('test specification');
      expect(json.items).toHaveLength(2);
    });

    it('names each requirement in show --json', () => {
      const json = JSON.parse(run(['show', 'auth', '--type', 'spec', '--json']));
      expect(json.items.map((r: any) => r.text.split(': ')[0])).toEqual(['User Authentication', 'Password Reset']);
      expect(json.items[0].children[0]).toMatchObject({ label: 'a', text: 'Valid credentials sign the user in.' });
    });

    it('shows one requirement by name with --item', () => {
      expect(run(['spec', 'show', 'auth', '--item', 'Password Reset']).trim()).toBe(
        '2. Password Reset: The system lets users reset their password.\n  a. A reset link goes to the registered email.'
      );
    });

    it('shows one item by label path with --item (JSON)', () => {
      const json = JSON.parse(run(['spec', 'show', 'auth', '--json', '--item', '2.a']));
      expect(json).toMatchObject({ name: 'auth', item: '2.a', node: { label: 'a', text: 'A reset link goes to the registered email.' } });
    });

    it('shows a nested item by requirement name and labels with --item', () => {
      expect(run(['spec', 'show', 'auth', '--item', 'User Authentication.a.i']).trim()).toBe('i. The session lasts one day.');
    });

    it('reports an unknown --item and exits non-zero', () => {
      let error: any;
      try {
        run(['spec', 'show', 'auth', '--item', 'Missing']);
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.status).not.toBe(0);
      expect(error.stderr.toString()).toContain('No requirement or label "Missing" in auth');
    });
  });

  describe('spec list', () => {
    it('should list all available specs (IDs only by default)', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, 'spec', 'list'], {
          encoding: 'utf-8'
        });
        
        expect(output).toContain('auth');
        expect(output).toContain('payment');
        // Default should not include counts or teasers
        expect(output).not.toMatch(/Requirements:\s*\d+/);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should output spec list as JSON with --json flag', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, 'spec', 'list', '--json'], {
          encoding: 'utf-8'
        });
        
        const json = JSON.parse(output);
        expect(json).toHaveLength(2);
        expect(json.find((s: any) => s.id === 'auth')).toBeDefined();
        expect(json.find((s: any) => s.id === 'payment')).toBeDefined();
        expect(json[0].requirementCount).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('spec validate', () => {
    it('should validate a valid spec', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, 'spec', 'validate', 'auth'], {
          encoding: 'utf-8'
        });
        
        expect(output).toContain("Specification 'auth' is valid");
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should output validation report as JSON with --json flag', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, 'spec', 'validate', 'auth', '--json'], {
          encoding: 'utf-8'
        });
        
        const json = JSON.parse(output);
        expect(json.valid).toBeDefined();
        expect(json.issues).toBeDefined();
        expect(json.summary).toBeDefined();
        expect(json.summary.errors).toBeDefined();
        expect(json.summary.warnings).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should validate with strict mode', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, 'spec', 'validate', 'auth', '--strict', '--json'], {
          encoding: 'utf-8'
        });
        
        const json = JSON.parse(output);
        expect(json.valid).toBeDefined();
        // In strict mode, warnings also affect validity
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should detect invalid spec structure', async () => {
      // No purpose line and a requirement without "Name: sentence".
      const invalidSpec = `# invalid

1. No sentence here
`;

      await fs.mkdir(path.join(specsDir, 'invalid'), { recursive: true });
      await fs.writeFile(path.join(specsDir, 'invalid', 'spec.md'), invalidSpec);

      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        
        // This should exit with non-zero code
        let exitCode = 0;
        try {
          execFileSync('node', [openspecBin, 'spec', 'validate', 'invalid'], {
            encoding: 'utf-8'
          });
        } catch (error: any) {
          exitCode = error.status;
        }
        
        expect(exitCode).not.toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('error handling', () => {
    it('should handle non-existent spec gracefully', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        
        let error: any;
        try {
          execFileSync('node', [openspecBin, 'spec', 'show', 'nonexistent'], {
            encoding: 'utf-8'
          });
        } catch (e) {
          error = e;
        }
        
        expect(error).toBeDefined();
        expect(error.status).not.toBe(0);
        expect(error.stderr.toString()).toContain('not found');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle missing specs directory gracefully', async () => {
      await fs.rm(specsDir, { recursive: true, force: true });
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, 'spec', 'list'], { encoding: 'utf-8' });
        expect(output.trim()).toBe('No items found');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should honor --no-color (no ANSI escapes)', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        const output = execFileSync('node', [openspecBin, '--no-color', 'spec', 'list', '--long'], { encoding: 'utf-8' });
        // Basic ANSI escape pattern
        const hasAnsi = /\u001b\[[0-9;]*m/.test(output);
        expect(hasAnsi).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});