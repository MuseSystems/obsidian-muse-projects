export type TaskCardPillKind = 'code' | 'project' | 'scheduled' | 'due' | 'billable' | 'status';

export interface TaskCardFacts {
	code: string;
	project: string;
	scheduled: string;
	due: string;
	billable: boolean;
}

export interface TaskCardPill {
	kind: TaskCardPillKind;
	text: string;
}

/** Second line of the task card. Empty dates and a false billable flag are omitted. */
export function taskCardPills(task: TaskCardFacts, statusText: string, known: boolean): TaskCardPill[] {
	const pills: TaskCardPill[] = [];
	if (task.code) pills.push({ kind: 'code', text: task.code });
	if (task.project && task.project !== task.code) pills.push({ kind: 'project', text: task.project });
	if (task.scheduled) pills.push({ kind: 'scheduled', text: `scheduled ${task.scheduled}` });
	if (task.due) pills.push({ kind: 'due', text: `due ${task.due}` });
	if (task.billable) pills.push({ kind: 'billable', text: 'billable' });
	if (!known) pills.push({ kind: 'status', text: statusText || '(empty)' });
	return pills;
}
