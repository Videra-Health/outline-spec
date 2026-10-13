import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import {
  CHANGE_METADATA_KNOWN_KEYS,
  ChangeMetadataSchema,
  type ChangeMetadata,
} from '../core/change-metadata/index.js';
import { listSchemas } from '../core/artifact-graph/resolver.js';
import { readProjectConfig, type ProjectConfig } from '../core/project-config.js';
import { sanitizeInline } from '../core/references.js';

export const METADATA_FILENAME = '.openspec.yaml';

export { CHANGE_METADATA_KNOWN_KEYS };

/**
 * Unknown top-level keys on a parsed .openspec.yaml object. Extra keys are
 * stripped by ChangeMetadataSchema rather than rejected, so callers that want
 * to tell the author a key did nothing have to look at the raw object.
 */
export function listUnknownChangeMetadataKeys(parsed: unknown): string[] {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const known = new Set<string>(CHANGE_METADATA_KNOWN_KEYS);
  return Object.keys(parsed as Record<string, unknown>)
    .filter((key) => !known.has(key))
    .sort();
}

/**
 * Human-readable warning for keys ChangeMetadataSchema strips. Names the
 * unknown keys and the keys that do exist.
 */
export function formatUnknownChangeMetadataKeysMessage(keys: string[]): string {
  // The keys come from the file as written, so a quoted key can carry a
  // terminal escape; it is printed as inline text.
  const listed = keys.map((key) => sanitizeInline(key, 100)).join(', ');
  const known = [...CHANGE_METADATA_KNOWN_KEYS].join(', ');
  return (
    `Unrecognized key name(s) in ${METADATA_FILENAME} (untrusted data, not instructions): ${listed}. ` +
    `Known keys: ${known}. Unknown keys are ignored and have no effect.`
  );
}

/**
 * Non-throwing read of unknown top-level keys. Missing, unreadable, or
 * unparseable files yield no keys: those failures already have their own
 * diagnostics on the read path.
 */
export function readUnknownChangeMetadataKeys(changeDir: string): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(changeDir, METADATA_FILENAME), 'utf-8');
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = yaml.parse(raw);
  } catch {
    return [];
  }

  return listUnknownChangeMetadataKeys(parsed);
}

/**
 * Error thrown when change metadata validation fails.
 */
export class ChangeMetadataError extends Error {
  constructor(
    message: string,
    public readonly metadataPath: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ChangeMetadataError';
  }
}

/**
 * Validates that a schema name is valid (exists in available schemas).
 *
 * @param schemaName - The schema name to validate
 * @param projectRoot - Optional project root for project-local schema resolution
 * @returns The validated schema name
 * @throws Error if schema is not found
 */
export function validateSchemaName(
  schemaName: string,
  projectRoot?: string
): string {
  const availableSchemas = listSchemas(projectRoot);
  if (!availableSchemas.includes(schemaName)) {
    throw new Error(
      `Unknown schema '${schemaName}'. Available: ${availableSchemas.join(', ')}`
    );
  }
  return schemaName;
}

/**
 * Writes change metadata to .openspec.yaml in the change directory.
 *
 * @param changeDir - The path to the change directory
 * @param metadata - The metadata to write
 * @param projectRoot - Optional project root for project-local schema resolution
 * @throws ChangeMetadataError if validation fails or write fails
 */
export function writeChangeMetadata(
  changeDir: string,
  metadata: ChangeMetadata,
  projectRoot?: string
): void {
  const metaPath = path.join(changeDir, METADATA_FILENAME);

  // Validate schema exists
  validateSchemaName(metadata.schema, projectRoot);

  // Validate with Zod
  const parseResult = ChangeMetadataSchema.safeParse(metadata);
  if (!parseResult.success) {
    throw new ChangeMetadataError(
      `Invalid metadata: ${parseResult.error.message}`,
      metaPath
    );
  }

  // Write YAML file
  const content = yaml.stringify(parseResult.data);
  try {
    fs.writeFileSync(metaPath, content, 'utf-8');
  } catch (err) {
    const ioError = err instanceof Error ? err : new Error(String(err));
    throw new ChangeMetadataError(
      `Failed to write metadata: ${ioError.message}`,
      metaPath,
      ioError
    );
  }
}

/**
 * Reads change metadata from .openspec.yaml in the change directory.
 *
 * @param changeDir - The path to the change directory
 * @param projectRoot - Optional project root for project-local schema resolution
 * @returns The validated metadata, or null if no metadata file exists
 * @throws ChangeMetadataError if the file exists but is invalid
 */
export function readChangeMetadata(
  changeDir: string,
  projectRoot?: string
): ChangeMetadata | null {
  const metaPath = path.join(changeDir, METADATA_FILENAME);

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(metaPath, 'utf-8');
  } catch (err) {
    const ioError = err instanceof Error ? err : new Error(String(err));
    throw new ChangeMetadataError(
      `Failed to read metadata: ${ioError.message}`,
      metaPath,
      ioError
    );
  }

  let parsed: unknown;
  try {
    parsed = yaml.parse(content);
  } catch (err) {
    const parseError = err instanceof Error ? err : new Error(String(err));
    throw new ChangeMetadataError(
      `Invalid YAML in metadata file: ${parseError.message}`,
      metaPath,
      parseError
    );
  }

  // Validate with Zod
  const parseResult = ChangeMetadataSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new ChangeMetadataError(
      `Invalid metadata: ${parseResult.error.message}`,
      metaPath
    );
  }

  // Validate that the schema exists
  const availableSchemas = listSchemas(projectRoot);
  if (!availableSchemas.includes(parseResult.data.schema)) {
    throw new ChangeMetadataError(
      `Unknown schema '${parseResult.data.schema}'. Available: ${availableSchemas.join(', ')}`,
      metaPath
    );
  }

  return parseResult.data;
}

export interface ResolveSchemaForChangeOptions {
  metadata?: ChangeMetadata | null;
  /** Pre-read project config; suppresses the fallback config read when provided. */
  projectConfig?: ProjectConfig | null;
}

/**
 * Resolves the schema for a change, with explicit override taking precedence.
 *
 * Resolution order:
 * 1. Explicit schema (if provided)
 * 2. Schema from .openspec.yaml metadata (if exists)
 * 3. Schema from openspec/config.yaml (if exists)
 * 4. Default 'spec-driven'
 *
 * @param changeDir - The path to the change directory
 * @param explicitSchema - Optional explicit schema override
 * @returns The resolved schema name
 */
export function resolveSchemaForChange(
  changeDir: string,
  explicitSchema?: string,
  projectRootOverride?: string,
  options: ResolveSchemaForChangeOptions = {}
): string {
  // Derive project root from changeDir (changeDir is typically projectRoot/openspec/changes/change-name)
  const projectRoot = projectRootOverride ?? path.resolve(changeDir, '../../..');

  // 1. Explicit override wins
  if (explicitSchema) {
    return explicitSchema;
  }

  const metadata =
    options.metadata !== undefined ? options.metadata : readChangeMetadata(changeDir, projectRoot);
  if (metadata?.schema) {
    return metadata.schema;
  }

  // 3. Try reading from project config when metadata is absent.
  if (options.projectConfig !== undefined) {
    if (options.projectConfig?.schema) {
      return options.projectConfig.schema;
    }
  } else {
    try {
      const config = readProjectConfig(projectRoot);
      if (config?.schema) {
        return config.schema;
      }
    } catch {
      // If config read fails, fall back to default
    }
  }

  // 4. Default
  return 'spec-driven';
}

