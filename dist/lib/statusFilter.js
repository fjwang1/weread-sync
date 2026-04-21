import { CliError } from './output.js';
export const DEFAULT_INCLUDE_STATUSES = ['reading', 'finished'];
const VALID_STATUSES = new Set(['reading', 'finished', 'other']);
export function parseIncludeStatuses(rawValue) {
    if (!rawValue) {
        return [...DEFAULT_INCLUDE_STATUSES];
    }
    const statuses = rawValue
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean);
    if (statuses.length === 0) {
        return [...DEFAULT_INCLUDE_STATUSES];
    }
    for (const status of statuses) {
        if (!VALID_STATUSES.has(status)) {
            throw new CliError(`Invalid reading status: ${status}. Use reading,finished,other`, 'INVALID_STATUS_FILTER');
        }
    }
    return [...new Set(statuses)];
}
export function classifyReadingStatus(progress, finishTime) {
    if (finishTime && finishTime > 0) {
        return 'finished';
    }
    if (progress !== null && progress > 0 && progress < 100) {
        return 'reading';
    }
    return 'other';
}
