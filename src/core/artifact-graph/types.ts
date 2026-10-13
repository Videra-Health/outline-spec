import * as path from 'node:path';
import { z } from 'zod';

function relativePathSchema(fieldName: string) {
  return z
    .string()
    .min(1, { error: `${fieldName} is required` })
    .superRefine((value, ctx) => {
      const segments = value.split(/[\\/]+/u);
      const isDrivePath = /^[A-Za-z]:/u.test(value);
      const isAbsolute =
        path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || isDrivePath;
      const escapes = segments.includes('..');

      if (isAbsolute || escapes || value.includes('\0')) {
        ctx.addIssue({
          code: 'custom',
          message: `${fieldName} must be a relative path inside its allowed directory`,
        });
      }
    });
}

// Artifact definition schema
// Upper bound on artifacts in one schema. Keeps `validateNoCycles`' recursive
// DFS well inside the stack limit for any accepted input.
const MAX_ARTIFACTS = 1000;

export const ArtifactSchema = z.object({
  id: z.string().min(1, { error: 'Artifact ID is required' }),
  generates: relativePathSchema('generates field'),
  description: z.string(),
  template: relativePathSchema('template field'),
  instruction: z.string().optional(),
  requires: z.array(z.string()).default([]),
  // Missing optional artifacts don't block dependents or planning completion
  optional: z.boolean().optional(),
});

// Apply phase configuration for schema-aware apply instructions
export const ApplyPhaseSchema = z.object({
  // Artifact IDs that must exist before apply is available
  requires: z.array(z.string()).min(1, { error: 'At least one required artifact' }),
  // Path to file with checkboxes for progress (relative to change dir), or null if no tracking
  tracks: relativePathSchema('apply.tracks').nullable().optional(),
  // Custom guidance for the apply phase
  instruction: z.string().optional(),
});

// Computed views a review tab can show instead of change files
export const REVIEW_VIEWS = ['spec-changes'] as const;

export const ReviewTabSchema = z
  .object({
    title: z.string().min(1, { error: 'Review tab title is required' }),
    from: z.array(relativePathSchema('review tab file')).min(1).optional(),
    view: z.string().optional(),
  })
  .superRefine((tab, ctx) => {
    if ((tab.from === undefined) === (tab.view === undefined)) {
      ctx.addIssue({ code: 'custom', message: `Review tab '${tab.title}' needs exactly one of 'from' or 'view'` });
    } else if (tab.view !== undefined && !(REVIEW_VIEWS as readonly string[]).includes(tab.view)) {
      ctx.addIssue({
        code: 'custom',
        message: `Review tab '${tab.title}' has unknown view '${tab.view}' (views: ${REVIEW_VIEWS.join(', ')})`,
      });
    }
  });

export const ReviewBlockSchema = z.object({
  template: relativePathSchema('review.template').default('review.html'),
  tabs: z.array(ReviewTabSchema).min(1, { error: 'A review block needs at least one tab' }),
});

// Full schema YAML structure
export const SchemaYamlSchema = z.object({
  name: z.string().min(1, { error: 'Schema name is required' }),
  version: z.number().int().positive({ error: 'Version must be a positive integer' }),
  description: z.string().optional(),
  artifacts: z
    .array(ArtifactSchema)
    .min(1, { error: 'At least one artifact required' })
    // Bounded so a hostile schema cannot drive the cycle-detection DFS past the
    // V8 stack limit and crash with an uncaught RangeError instead of a
    // validation error.
    .max(MAX_ARTIFACTS, {
      error: `A schema may declare at most ${MAX_ARTIFACTS} artifacts`,
    }),
  // Optional apply phase configuration (for schema-aware apply instructions)
  apply: ApplyPhaseSchema.optional(),
  // Optional review page: its template and tabs
  review: ReviewBlockSchema.optional(),
});

// Derived TypeScript types
export type Artifact = z.infer<typeof ArtifactSchema>;
export type ReviewTab = z.infer<typeof ReviewTabSchema>;
export type ReviewBlock = z.infer<typeof ReviewBlockSchema>;
export type ApplyPhase = z.infer<typeof ApplyPhaseSchema>;
export type SchemaYaml = z.infer<typeof SchemaYamlSchema>;

// Runtime state types (not Zod - internal only)

// Slice 1: Simple completion tracking via filesystem
export type CompletedSet = Set<string>;

// Return type for blocked query
export interface BlockedArtifacts {
  [artifactId: string]: string[];
}
