import { CliError } from './output.js';

export const DEFAULT_INCLUDE_STATUSES = ['reading', 'finished'];

export type ReadingStatus = 'reading' | 'finished' | 'other';

const VALID_STATUSES = new Set<ReadingStatus>(['reading', 'finished', 'other']);

export function parseIncludeStatuses(rawValue?: string): ReadingStatus[] {
  if (!rawValue) {
    return [...DEFAULT_INCLUDE_STATUSES] as ReadingStatus[];
  }

  const statuses = rawValue
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean) as ReadingStatus[];

  if (statuses.length === 0) {
    return [...DEFAULT_INCLUDE_STATUSES] as ReadingStatus[];
  }

  for (const status of statuses) {
    if (!VALID_STATUSES.has(status)) {
      throw new CliError(
        `Invalid reading status: ${status}. Use reading,finished,other`,
        'INVALID_STATUS_FILTER'
      );
    }
  }

  return [...new Set(statuses)];
}

export function classifyReadingStatus(progress: number | null, finishTime: number | null): ReadingStatus {
  if (finishTime && finishTime > 0) {
    return 'finished';
  }

  if (progress !== null && progress > 0 && progress < 100) {
    return 'reading';
  }

  return 'other';
}
