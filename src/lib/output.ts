export class CliError extends Error {
  code?: string;
  details?: unknown;

  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.details = details;
  }
}

export function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function printText(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function handleFatalError(error: unknown): never {
  if (error instanceof CliError) {
    printJson({
      ok: false,
      error: {
        code: error.code ?? 'UNKNOWN_ERROR',
        message: error.message,
        details: error.details
      }
    });
    process.exit(1);
  }

  const message = error instanceof Error ? error.message : String(error);
  printJson({
    ok: false,
    error: {
      code: 'UNEXPECTED_ERROR',
      message
    }
  });
  process.exit(1);
}
