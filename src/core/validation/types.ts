export type ValidationLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  level: ValidationLevel;
  path: string;
  message: string;
  line?: number;
  column?: number;
  /** The Markdown file a Mermaid issue is in. */
  file?: string;
  /** Mermaid's parse message on one line. */
  error?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}