import {
	MSPRJ_ARCHETYPE_DOCUMENT,
	MSPRJ_ARCHETYPE_ORGANIZATION,
	MSPRJ_ARCHETYPE_PROJECT,
	MSPRJ_ARCHETYPE_TASK,
	MSPRJ_ARCHETYPE_TODO,
	MSPRJ_DOC_TODO_DIR,
	MSPRJ_ORG_CODE,
	MSPRJ_ORG_TODO_DIR,
	MSPRJ_PRJ_CODE,
	MSPRJ_PRJ_TODO_DIR,
	MSPRJ_TDO_CODE,
	MSPRJ_TSK_CODE,
	isManagedArchetype,
	isTodoArchetype,
} from './constants';

/** Where New To-Do files the note, and which note owns it. */
export interface TodoCreateSeed {
	/** Path of the owning note. Null when the to-do is unowned. */
	ownerPath: string | null;
	/** Folder to prefill. Null when the command has no folder to offer. */
	folderPath: string | null;
}

/**
 * Owner path and the fallback folder when no organization, project, or document contains the note.
 * The aggregate's to-do directory replaces that folder when one does. See `todoAggregateFolder`.
 * A to-do context is not itself the owner.
 */
export function todoCreateSeed(input: {
	context: 'archetype' | 'note' | 'folder' | 'none';
	path: string;
	parentPath: string | null;
}): TodoCreateSeed {
	if (input.context === 'none') {
		return { ownerPath: null, folderPath: null };
	}
	if (input.context === 'folder') {
		return { ownerPath: null, folderPath: input.path };
	}
	if (input.context === 'archetype') {
		return { ownerPath: input.path, folderPath: input.parentPath };
	}
	return { ownerPath: null, folderPath: input.parentPath };
}

/**
 * Code of the owning artifact for the to-do name.
 * Each archetype contributes its own `msprj_<prefix>_code` value.
 * A copied code such as `msprj_tsk_project_code` is not that artifact's code.
 */
export function artifactCodeForTodoOwner(
	archetype: unknown,
	values: Record<string, unknown> | null,
): string | null {
	if (!values) return null;
	const known = ownCodeKey(archetype);
	if (known) return codeText(values[known]);
	const keys = Object.keys(values)
		.filter((key) => /^msprj_[a-z0-9]+_code$/.test(key))
		.sort();
	if (keys.length !== 1) return null;
	const key = keys[0];
	return key ? codeText(values[key]) : null;
}

function ownCodeKey(archetype: unknown): string | null {
	switch (archetype) {
		case MSPRJ_ARCHETYPE_ORGANIZATION:
			return MSPRJ_ORG_CODE;
		case MSPRJ_ARCHETYPE_PROJECT:
			return MSPRJ_PRJ_CODE;
		case MSPRJ_ARCHETYPE_TASK:
			return MSPRJ_TSK_CODE;
		case MSPRJ_ARCHETYPE_TODO:
			return MSPRJ_TDO_CODE;
		default:
			return null;
	}
}

function codeText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return text ? text : null;
}

/**
 * Vault path an organization, project, or document names for its to-dos.
 * Null for any other archetype, and when the value is missing or blank.
 * The caller uses the entity folder when this path is not an existing folder.
 */
export function designatedTodoDir(
	archetype: unknown,
	values: Record<string, unknown> | null,
): string | null {
	if (!values) return null;
	const key = todoDirKey(archetype);
	if (!key) return null;
	return codeText(values[key]);
}

export type CreatedTodoDir =
	| { kind: 'none' }
	| { kind: 'folder'; vaultPath: string }
	| { kind: 'invalid'; message: string };

/**
 * To-do directory from an organization, project, or document template.
 * The template value is a path inside the new folder, such as `todos`.
 * Create stores `vaultPath` on the note. Blank means no directory.
 */
export function createdTodoDir(
	parentPath: string,
	raw: unknown,
	field: string,
): CreatedTodoDir {
	if (raw === null || raw === undefined) return { kind: 'none' };
	if (typeof raw !== 'string') return invalidTodoDir(field);
	const text = raw.trim();
	if (!text) return { kind: 'none' };
	if (text.startsWith('/') || text.startsWith('\\')) return invalidTodoDir(field);
	const segments = text
		.split(/[/\\]+/)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0 && segment !== '.');
	if (segments.length === 0 || segments.some((segment) => segment === '..')) {
		return invalidTodoDir(field);
	}
	const relative = segments.join('/');
	const parent = parentPath === '/' ? '' : parentPath.replace(/^\/+|\/+$/g, '');
	return { kind: 'folder', vaultPath: parent ? `${parent}/${relative}` : relative };
}

function invalidTodoDir(field: string): CreatedTodoDir {
	return {
		kind: 'invalid',
		message: `${field} must be a folder inside the new folder, such as todos.`,
	};
}

/**
 * Folder prefill once the containing entity is known.
 * No entity keeps the context folder. The designation wins only when that path exists.
 */
export function todoAggregateFolder(input: {
	contextFolder: string | null;
	entityFolder: string | null;
	designated: string | null;
	designatedExists: boolean;
}): string | null {
	if (input.entityFolder === null) return input.contextFolder;
	return todoFolderPrefill(input.entityFolder, input.designated, input.designatedExists);
}

/**
 * Folder prefill. The designation wins only when that path is an existing folder.
 */
export function todoFolderPrefill(
	noteFolder: string | null,
	designated: string | null,
	designatedExists: boolean,
): string | null {
	if (designated !== null && designatedExists) return designated;
	return noteFolder;
}

function todoDirKey(archetype: unknown): string | null {
	switch (archetype) {
		case MSPRJ_ARCHETYPE_ORGANIZATION:
			return MSPRJ_ORG_TODO_DIR;
		case MSPRJ_ARCHETYPE_PROJECT:
			return MSPRJ_PRJ_TODO_DIR;
		case MSPRJ_ARCHETYPE_DOCUMENT:
			return MSPRJ_DOC_TODO_DIR;
		default:
			return null;
	}
}

/**
 * Who a new to-do is owned by, given the note the command started from.
 * A to-do is not an owner. The new to-do takes that to-do's owner instead.
 */
export function todoOwnerFromContext(archetype: unknown): 'context' | 'context-owner' | 'none' {
	if (isTodoArchetype(archetype)) return 'context-owner';
	if (isManagedArchetype(archetype)) return 'context';
	return 'none';
}
