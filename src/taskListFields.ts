import {
	MSPRJ_ARCHETYPE,
	MSPRJ_PRJ_GENERAL_ADMIN,
	MSPRJ_PRJ_ORG,
	MSPRJ_TSK_COMPLETED,
	isProjectArchetype,
} from './constants';
import { isTerminalStatus } from './taskStatuses';

/** Org code and General Admin flag copied from a project onto its tasks. */
export interface ProjectListFacts {
	org: string | null;
	generalAdmin: boolean;
}

export function statusText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

export function storedText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return text ? text : null;
}

/**
 * Calendar date stored on a date property.
 * A UTC-midnight Date keeps that UTC day, so a date-only value does not shift
 * west of UTC and get rewritten on the next pass.
 */
export function storedDate(value: unknown): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const utcMidnight =
			value.getUTCHours() === 0 &&
			value.getUTCMinutes() === 0 &&
			value.getUTCSeconds() === 0 &&
			value.getUTCMilliseconds() === 0;
		const year = utcMidnight ? value.getUTCFullYear() : value.getFullYear();
		const month = (utcMidnight ? value.getUTCMonth() : value.getMonth()) + 1;
		const day = utcMidnight ? value.getUTCDate() : value.getDate();
		return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}
	if (typeof value !== 'string') return null;
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
	return match?.[1] ?? null;
}

export function listFactsFromProject(
	fm: Record<string, unknown> | undefined,
): ProjectListFacts | null {
	if (!fm || !isProjectArchetype(fm[MSPRJ_ARCHETYPE])) return null;
	return {
		org: storedText(fm[MSPRJ_PRJ_ORG]),
		generalAdmin: fm[MSPRJ_PRJ_GENERAL_ADMIN] === true,
	};
}

/**
 * Date to write when status changes.
 * Undefined means the completion date stays as it is.
 * A terminal status stamps `today`. Leaving a terminal status clears it.
 * Moving from one terminal status to the other stamps `today` again.
 */
export function completionValueAfterStatusChange(
	previous: unknown,
	next: unknown,
	today: string,
): string | null | undefined {
	const prev = statusText(previous);
	const nextText = statusText(next);
	if (prev === nextText) return undefined;
	if (isTerminalStatus(nextText)) return today;
	if (isTerminalStatus(prev)) return null;
	return undefined;
}

export function completedDateNeedsWrite(
	current: unknown,
	desired: string | null | undefined,
): boolean {
	if (desired === undefined) return false;
	return storedDate(current) !== desired;
}

export function orgNeedsWrite(current: unknown, desired: string | null): boolean {
	return storedText(current) !== desired;
}

/** Missing is not an explicit false, so the first pass writes the checkbox. */
export function adminNeedsWrite(current: unknown, desired: boolean): boolean {
	return typeof current !== 'boolean' || current !== desired;
}

/** Fields list sync should write. Null means the cached note already matches. */
export interface TaskListWrite {
	completed?: string | null;
}

export function taskListWrites(args: {
	known: boolean;
	previous: string | undefined;
	liveStatus: string;
	completed: unknown;
	today: string;
}): TaskListWrite | null {
	const write: TaskListWrite = {};
	if (args.known && args.previous !== args.liveStatus) {
		const desired = completionValueAfterStatusChange(args.previous, args.liveStatus, args.today);
		if (desired !== undefined && completedDateNeedsWrite(args.completed, desired)) {
			write.completed = desired;
		}
	}
	if (write.completed === undefined) return null;
	return write;
}

export function applyTaskListWrite(fm: Record<string, unknown>, write: TaskListWrite): void {
	if (write.completed !== undefined) {
		fm[MSPRJ_TSK_COMPLETED] = write.completed;
	}
}
