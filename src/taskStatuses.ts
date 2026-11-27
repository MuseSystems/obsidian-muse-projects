import { MSPRJ_TSK_STATUS_VALUES } from './constants';

/** How the task control draws a status. The control does not branch on status ids. */
export type TaskStatusMark = 'open' | 'active' | 'blocked' | 'done' | 'cancelled';

export interface TaskStatusDef {
	id: (typeof MSPRJ_TSK_STATUS_VALUES)[number];
	/** A click on the mark advances through statuses with this set. */
	cycles: boolean;
	mark: TaskStatusMark;
	/** Title is struck through. */
	strike: boolean;
	/** Entering this status stamps `msprj_tsk_completed`. Leaving it clears that date. */
	terminal: boolean;
	/** Written onto the control as `--msprj-status-color`. */
	color: string;
}

/**
 * Fixed status list for the task control, in menu order.
 * A later setting replaces this array. Ids are the strings stored on `msprj_tsk_status`.
 */
export const TASK_STATUSES: readonly TaskStatusDef[] = [
	{
		id: 'backlog',
		cycles: true,
		mark: 'open',
		strike: false,
		terminal: false,
		color: 'var(--msprj-status-backlog)',
	},
	{
		id: 'active',
		cycles: true,
		mark: 'active',
		strike: false,
		terminal: false,
		color: 'var(--msprj-status-active)',
	},
	{
		id: 'blocked',
		cycles: false,
		mark: 'blocked',
		strike: false,
		terminal: false,
		color: 'var(--msprj-status-blocked)',
	},
	{
		id: 'done',
		cycles: true,
		mark: 'done',
		strike: true,
		terminal: true,
		color: 'var(--msprj-status-done)',
	},
	{
		id: 'cancelled',
		cycles: false,
		mark: 'cancelled',
		strike: true,
		terminal: true,
		color: 'var(--msprj-status-cancelled)',
	},
];

export interface TaskStatusPresentation {
	text: string;
	known: boolean;
	mark: TaskStatusMark | 'unknown';
	strike: boolean;
	/** Null when the value is not in the status list. */
	color: string | null;
}

/** First status a click moves to when the current value is outside the cycle. */
export function firstCycledStatus(): string {
	for (const status of TASK_STATUSES) {
		if (status.cycles) return status.id;
	}
	return TASK_STATUSES[0]?.id ?? 'backlog';
}

/** True for `done` and `cancelled`. Any other value, including empty, is open. */
export function isTerminalStatus(status: unknown): boolean {
	const text = typeof status === 'string' ? status.trim() : '';
	return TASK_STATUSES.some((item) => item.terminal && item.id === text);
}

export function taskStatusPresentation(status: unknown): TaskStatusPresentation {
	const text = typeof status === 'string' ? status.trim() : '';
	for (const item of TASK_STATUSES) {
		if (item.id === text) {
			return { text, known: true, mark: item.mark, strike: item.strike, color: item.color };
		}
	}
	return { text, known: false, mark: 'unknown', strike: false, color: null };
}

/**
 * Next status for a mark click.
 * A cycling status advances, wrapping to the first cycling status.
 * Any other value, including empty, enters the cycle at the start.
 */
export function nextCycledStatus(status: unknown): string {
	const cycling = TASK_STATUSES.filter((item) => item.cycles);
	const first = cycling[0]?.id ?? firstCycledStatus();
	const text = typeof status === 'string' ? status.trim() : '';
	const index = cycling.findIndex((item) => item.id === text);
	if (index < 0) return first;
	return cycling[(index + 1) % cycling.length]?.id ?? first;
}
