/**
 * True only for boolean true.
 * The plugin setting and a project's `msprj_prj_task_todo` both use this.
 * Missing, false, and any other stored value are off.
 */
export function taskTodoEnabled(value: unknown): boolean {
	return value === true;
}
