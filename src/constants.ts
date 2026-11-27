/** Frontmatter discriminator for Muse Projects–managed artifacts. */
export const MSPRJ_ARCHETYPE = 'msprj_archetype';

/** Archetype value for a project note. */
export const MSPRJ_ARCHETYPE_PROJECT = 'project';

/** Suggested msprj_prj_status values (not enforced yet). */
export const MSPRJ_PRJ_STATUS_VALUES = [
	'proposal',
	'pipeline',
	'active',
	'on-hold',
	'complete',
	'cancelled',
] as const;

/** Suggested msprj_prj_billing_model values (not enforced yet). */
export const MSPRJ_PRJ_BILLING_MODEL_VALUES = [
	'tm',
	'fixed',
	'retainer',
] as const;

/** Archetype value for a task note. */
export const MSPRJ_ARCHETYPE_TASK = 'task';

/** Archetype value for an organization note. */
export const MSPRJ_ARCHETYPE_ORGANIZATION = 'organization';

/** Archetype value for a to-do note. */
export const MSPRJ_ARCHETYPE_TODO = 'todo';

/** Archetype value for a document root note. */
export const MSPRJ_ARCHETYPE_DOCUMENT = 'document';

/**
 * Subordinate document notes. The context menu offers this whole set.
 * A document kind does not limit which of them it may contain.
 */
export const MSPRJ_SUBORDINATE_ARCHETYPES = [
	'feature',
	'module',
	'requirement',
	'test-case',
	'question',
	'contract-term',
	'glossary-entry',
] as const;

export type SubordinateArchetypeId = (typeof MSPRJ_SUBORDINATE_ARCHETYPES)[number];

/**
 * Contact and resource notes. The context menu offers this whole set
 * when an organization or a project is in scope.
 * Neither has behavior of its own.
 */
export const MSPRJ_ORG_RESOURCE_ARCHETYPES = ['contact', 'resource'] as const;

export type OrgResourceArchetypeId = (typeof MSPRJ_ORG_RESOURCE_ARCHETYPES)[number];

/** A document subordinate or an organization/project resource note. */
export type ThinNoteArchetypeId = SubordinateArchetypeId | OrgResourceArchetypeId;

/**
 * Task status ids in menu order.
 * Click cycling and marks live in taskStatuses.ts. Values are not enforced on write.
 */
export const MSPRJ_TSK_STATUS_VALUES = [
	'backlog',
	'active',
	'blocked',
	'done',
	'cancelled',
] as const;

/** True if frontmatter archetype marks a project note. */
export function isProjectArchetype(value: unknown): boolean {
	return value === MSPRJ_ARCHETYPE_PROJECT;
}

/** True if frontmatter archetype marks a task note. */
export function isTaskArchetype(value: unknown): boolean {
	return value === MSPRJ_ARCHETYPE_TASK;
}

/** True if frontmatter archetype marks an organization note. */
export function isOrganizationArchetype(value: unknown): boolean {
	return value === MSPRJ_ARCHETYPE_ORGANIZATION;
}

/** True if frontmatter archetype marks a to-do note. */
export function isTodoArchetype(value: unknown): boolean {
	return value === MSPRJ_ARCHETYPE_TODO;
}

/** True if frontmatter archetype marks a document root. */
export function isDocumentArchetype(value: unknown): boolean {
	return value === MSPRJ_ARCHETYPE_DOCUMENT;
}

/** True if frontmatter archetype is one of the subordinate document notes. */
export function isSubordinateArchetype(value: unknown): value is SubordinateArchetypeId {
	return (
		typeof value === 'string' &&
		(MSPRJ_SUBORDINATE_ARCHETYPES as readonly string[]).includes(value)
	);
}

/** True if frontmatter archetype is a contact or a resource. */
export function isOrgResourceArchetype(value: unknown): value is OrgResourceArchetypeId {
	return (
		typeof value === 'string' &&
		(MSPRJ_ORG_RESOURCE_ARCHETYPES as readonly string[]).includes(value)
	);
}

/**
 * True for a note the plugin owns.
 * Organization, project, document, task, to-do, subordinate document notes,
 * and contact and resource notes.
 */
export function isManagedArchetype(value: unknown): boolean {
	return (
		isOrganizationArchetype(value) ||
		isProjectArchetype(value) ||
		isDocumentArchetype(value) ||
		isTaskArchetype(value) ||
		isTodoArchetype(value) ||
		isSubordinateArchetype(value) ||
		isOrgResourceArchetype(value)
	);
}

/**
 * True when this note is an actionable to-do.
 * To-do notes default true. Project notes default false.
 * A new task copies the owning project's `msprj_prj_task_todo` (absent means false).
 * A task with this set is itself the to-do. The daily to-do lists read it.
 */
export const MSPRJ_TODO = 'msprj_todo';

/** UUID version 4 identity on organization, project, and task notes. */
export const MSPRJ_ID = 'msprj_id';

/** Wikilink to the immediate owner. Empty at the top of a chain and on an unowned to-do. */
export const MSPRJ_OWNER = 'msprj_owner';

export const MSPRJ_PRJ_NAME = 'msprj_prj_name';
export const MSPRJ_PRJ_CODE = 'msprj_prj_code';
/** Organization code copied from the organization above this project. Matches `msprj_org_code`. */
export const MSPRJ_PRJ_ORG = 'msprj_prj_org';
export const MSPRJ_ORG_NAME = 'msprj_org_name';
export const MSPRJ_ORG_CODE = 'msprj_org_code';
export const MSPRJ_ORG_BILLABLE = 'msprj_org_billable';
/**
 * `monday` (Monday–Sunday), `sunday` (Sunday–Saturday), or `saturday` (Saturday–Friday).
 * Organization reports use this. Aggregate reports use the plugin standard week start.
 */
export const MSPRJ_ORG_WEEK_START = 'msprj_org_week_start';
/**
 * `hours-minutes` (`1:30`) or `decimal-hours` (`1.50`, hundredths of an hour).
 * Organization reports use this. Aggregate reports use the plugin standard duration format.
 */
export const MSPRJ_ORG_DURATION_FORMAT = 'msprj_org_duration_format';
/**
 * `24-hour` (`14:30:05`) or `12-hour` (`2:30:05 PM`).
 * Organization reports use this for civil clock times. Aggregate reports use the plugin standard.
 * Durations use `msprj_org_duration_format`.
 */
export const MSPRJ_ORG_CLOCK_FORMAT = 'msprj_org_clock_format';
/**
 * Vault folder for to-dos created from this organization note.
 * A template value is a path inside the new folder, such as `todos`.
 * Create stores the vault path. Blank uses the note's folder.
 */
export const MSPRJ_ORG_TODO_DIR = 'msprj_org_todo_dir';
/**
 * Organization code a report note reports on, when the note itself is not an organization.
 * The block loads that organization note for week start, duration format, and clock format.
 */
export const MSPRJ_REPORT_ORG = 'msprj_report_org';
/**
 * Folder name of the default project skeleton.
 * Empty means `project/default`, or an empty layout when that folder is absent.
 * A stored `default` stays on that vault default.
 * That layout's `_prj.md` is the project note template.
 */
export const MSPRJ_ORG_SKEL_PROJECT = 'msprj_org_skel_project';
/** Filename stem of the default task note template. Empty means vault default. */
export const MSPRJ_ORG_TPL_TASK = 'msprj_org_tpl_task';
export const MSPRJ_PRJ_STATUS = 'msprj_prj_status';
export const MSPRJ_PRJ_NEXT_TASK_ID = 'msprj_prj_next_task_id';
/** Obsolete. Not an owner. Create removes it when a template still contains it. */
export const MSPRJ_PRJ_PARENT = 'msprj_prj_parent';
export const MSPRJ_PRJ_DAILY_SURFACE = 'msprj_prj_daily_surface';
/** Tasks on this project stay on the General Admin list. */
export const MSPRJ_PRJ_GENERAL_ADMIN = 'msprj_prj_general_admin';
/** Distinct from billing_model. Required on project create (no default). */
export const MSPRJ_PRJ_BILLABLE = 'msprj_prj_billable';
/**
 * When true, New Task writes `msprj_todo` true on tasks of this project.
 * New Project copies the plugin setting `taskTodoDefault`. Absent means false.
 * A later edit affects tasks created after the edit.
 */
export const MSPRJ_PRJ_TASK_TODO = 'msprj_prj_task_todo';
/** Filename stem of this project's task note template. Empty inherits the organization. */
export const MSPRJ_PRJ_TPL_TASK = 'msprj_prj_tpl_task';
/**
 * Vault folder for to-dos created from this project note.
 * A template value is a path inside the new folder, such as `todos`.
 * Create stores the vault path. Blank uses the note's folder.
 * A sub-project uses its own value.
 */
export const MSPRJ_PRJ_TODO_DIR = 'msprj_prj_todo_dir';

/** Lifecycle / SOW dates (YYYY-MM-DD). */
export const MSPRJ_PRJ_OPENED = 'msprj_prj_opened';
export const MSPRJ_PRJ_PROPOSED = 'msprj_prj_proposed';
export const MSPRJ_PRJ_STARTED = 'msprj_prj_started';
export const MSPRJ_PRJ_TARGET_END = 'msprj_prj_target_end';
export const MSPRJ_PRJ_COMPLETED = 'msprj_prj_completed';

/** Commercial / KPI (Bases-friendly scalars). */
export const MSPRJ_PRJ_SOW_REF = 'msprj_prj_sow_ref';
export const MSPRJ_PRJ_BILLING_MODEL = 'msprj_prj_billing_model';
export const MSPRJ_PRJ_HOURS_ESTIMATED = 'msprj_prj_hours_estimated';
export const MSPRJ_PRJ_HOURS_BUDGET = 'msprj_prj_hours_budget';
export const MSPRJ_PRJ_AMOUNT_BUDGET = 'msprj_prj_amount_budget';

export const MSPRJ_TSK_TITLE = 'msprj_tsk_title';
export const MSPRJ_TSK_CODE = 'msprj_tsk_code';
/** Project code copied from the nearest project above this task. */
export const MSPRJ_TSK_PROJECT_CODE = 'msprj_tsk_project_code';
/** Organization code copied from the organization above that project. */
export const MSPRJ_TSK_ORG = 'msprj_tsk_org';
/** Copied from that project's `msprj_prj_general_admin`. */
export const MSPRJ_TSK_GENERAL_ADMIN = 'msprj_tsk_general_admin';
export const MSPRJ_TSK_STATUS = 'msprj_tsk_status';
/** Local calendar date the task last entered `done` or `cancelled`. Null otherwise. */
export const MSPRJ_TSK_COMPLETED = 'msprj_tsk_completed';
export const MSPRJ_TSK_SCHEDULED = 'msprj_tsk_scheduled';
export const MSPRJ_TSK_DUE = 'msprj_tsk_due';
export const MSPRJ_TSK_BILLABLE = 'msprj_tsk_billable';
/** List of task refs that block this task. */
export const MSPRJ_TSK_BLOCKED_BY = 'msprj_tsk_blocked_by';
/** Clock intervals. Untyped object list; the plugin is the writer. */
export const MSPRJ_TSK_TIME_ENTRIES = 'msprj_tsk_time_entries';

export const MSPRJ_TDO_TITLE = 'msprj_tdo_title';
export const MSPRJ_TDO_STATUS = 'msprj_tdo_status';
/** Local calendar date the to-do last entered `done` or `cancelled`. Null otherwise. */
export const MSPRJ_TDO_COMPLETED = 'msprj_tdo_completed';
export const MSPRJ_TDO_SCHEDULED = 'msprj_tdo_scheduled';
export const MSPRJ_TDO_DUE = 'msprj_tdo_due';
/** List of task or to-do refs that block this to-do. */
export const MSPRJ_TDO_BLOCKED_BY = 'msprj_tdo_blocked_by';

/** Zero-pad width for sequential task ids in codes (`ENG-001`). */
export const MSPRJ_TASK_ID_PAD = 3;

/** Zero-pad width for the global to-do number. */
export const MSPRJ_TODO_ID_PAD = 5;

/** Stable to-do label, `todo-00042` or `todo-00042-eng-012-001`. */
export const MSPRJ_TDO_CODE = 'msprj_tdo_code';

/** Display title on a document root, a subordinate document note, a contact, and a resource. */
export const MSPRJ_TITLE = 'msprj_title';

/**
 * Vault folder for to-dos associated with this document.
 * A template value is a path inside the new folder, such as `todos`.
 * Create stores the vault path. Blank uses the document folder.
 * An inner document uses its own value.
 */
export const MSPRJ_DOC_TODO_DIR = 'msprj_doc_todo_dir';
