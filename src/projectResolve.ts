import { App, TFile, TFolder } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_PRJ_BILLABLE,
	MSPRJ_PRJ_CODE,
	MSPRJ_PRJ_NAME,
	MSPRJ_PRJ_TASK_TODO,
	isProjectArchetype,
	isTaskArchetype,
} from './constants';
import { taskTodoEnabled } from './taskTodo';
import { nearestProjectFile } from './ownershipResolve';
import { findPrimaryProjectNotes } from './scaffold';
import { normalizeProjectCode } from './slug';
import { isUnderTemplatesPath, listProjectNotes } from './projectIndex';

export interface ResolvedProject {
	file: TFile;
	code: string;
	name: string;
	/** Null if the project note has no boolean msprj_prj_billable yet. */
	billable: boolean | null;
	/** True only when `msprj_prj_task_todo` is boolean true. Absent means off. */
	taskTodo: boolean;
}

function readProjectMeta(app: App, file: TFile): ResolvedProject | null {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm || !isProjectArchetype(fm[MSPRJ_ARCHETYPE])) {
		return null;
	}
	const codeRaw = fm[MSPRJ_PRJ_CODE];
	if (typeof codeRaw !== 'string' || !normalizeProjectCode(codeRaw)) {
		return null;
	}
	const code = normalizeProjectCode(codeRaw);
	const nameRaw = fm[MSPRJ_PRJ_NAME];
	const name =
		typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : file.basename;
	const billableRaw = fm[MSPRJ_PRJ_BILLABLE];
	const billable = typeof billableRaw === 'boolean' ? billableRaw : null;
	const taskTodo = taskTodoEnabled(fm[MSPRJ_PRJ_TASK_TODO]);
	return { file, code, name, billable, taskTodo };
}

async function primaryInFolder(
	app: App,
	folder: TFolder | null,
): Promise<ResolvedProject | null> {
	if (!folder) {
		return null;
	}
	const primaries = await findPrimaryProjectNotes(app, folder);
	if (primaries.length !== 1) {
		return null;
	}
	return readProjectMeta(app, primaries[0]!);
}

/** The file itself when it is a project note outside the templates tree. */
export function projectNoteFromFile(
	app: App,
	file: TFile,
	projectTemplatesPath: string,
): ResolvedProject | null {
	if (file.extension !== 'md') {
		return null;
	}
	if (isUnderTemplatesPath(file.path, projectTemplatesPath)) {
		return null;
	}
	return readProjectMeta(app, file);
}

/**
 * Project notes directly in this folder, from the metadata cache.
 * Nested notes are ignored. The templates tree is not a project.
 */
export function directProjectNotes(
	app: App,
	folder: TFolder,
	projectTemplatesPath: string,
): ResolvedProject[] {
	if (isUnderTemplatesPath(folder.path, projectTemplatesPath)) {
		return [];
	}
	const found: ResolvedProject[] = [];
	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== 'md') {
			continue;
		}
		if (isUnderTemplatesPath(child.path, projectTemplatesPath)) {
			continue;
		}
		const meta = readProjectMeta(app, child);
		if (meta) {
			found.push(meta);
		}
	}
	return found;
}

/**
 * Sole project note in this folder's root, from the metadata cache.
 * Nested notes are ignored. None, or more than one, returns null.
 * The templates tree is not a project.
 */
export function soleProjectInFolder(
	app: App,
	folder: TFolder,
	projectTemplatesPath: string,
): ResolvedProject | null {
	const found = directProjectNotes(app, folder, projectTemplatesPath);
	return found.length === 1 ? found[0]! : null;
}

/**
 * Nearest project note in this folder or a parent folder.
 * A folder with more than one project note does not name a project.
 * The templates tree is not inside a project.
 */
export function nearestProjectInFolder(
	app: App,
	folder: TFolder,
	projectTemplatesPath: string,
): ResolvedProject | null {
	let current: TFolder | null = folder;
	while (current) {
		if (isUnderTemplatesPath(current.path, projectTemplatesPath)) return null;
		const found = soleProjectInFolder(app, current, projectTemplatesPath);
		if (found) return found;
		current = current.parent;
	}
	return null;
}

/**
 * Resolve owning project from the active file, if possible.
 * - Project details note → that project
 * - Task note → linked project, else sole primary in the same folder
 * - Other note in a project folder → sole primary in that folder
 */
export async function resolveProjectFromFile(
	app: App,
	file: TFile | null,
	projectTemplatesPath: string,
): Promise<ResolvedProject | null> {
	if (!file) {
		return null;
	}
	if (isUnderTemplatesPath(file.path, projectTemplatesPath)) {
		return null;
	}

	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (isProjectArchetype(fm?.[MSPRJ_ARCHETYPE])) {
		return readProjectMeta(app, file);
	}

	if (fm && isTaskArchetype(fm[MSPRJ_ARCHETYPE])) {
		const owner = nearestProjectFile(app, file);
		if (owner) {
			const resolved = readProjectMeta(app, owner);
			if (resolved) return resolved;
		}
		return primaryInFolder(app, file.parent);
	}

	return primaryInFolder(app, file.parent);
}

/** All projects available for New Task picker (excludes template tree). */
export function listResolvableProjects(
	app: App,
	projectTemplatesPath: string,
): ResolvedProject[] {
	const result: ResolvedProject[] = [];
	for (const file of listProjectNotes(app, projectTemplatesPath)) {
		const meta = readProjectMeta(app, file);
		if (meta) {
			result.push(meta);
		}
	}
	result.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
	return result;
}
