import {
	App,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	TFile,
	TFolder,
} from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ARCHETYPE_PROJECT,
	MSPRJ_ID,
	isOrganizationArchetype,
	isProjectArchetype,
	MSPRJ_PRJ_AMOUNT_BUDGET,
	MSPRJ_PRJ_BILLABLE,
	MSPRJ_PRJ_BILLING_MODEL,
	MSPRJ_PRJ_CODE,
	MSPRJ_PRJ_COMPLETED,
	MSPRJ_PRJ_DAILY_SURFACE,
	MSPRJ_PRJ_GENERAL_ADMIN,
	MSPRJ_PRJ_HOURS_BUDGET,
	MSPRJ_PRJ_HOURS_ESTIMATED,
	MSPRJ_PRJ_NAME,
	MSPRJ_PRJ_NEXT_TASK_ID,
	MSPRJ_PRJ_OPENED,
	MSPRJ_ORG_CODE,
	MSPRJ_OWNER,
	MSPRJ_PRJ_ORG,
	MSPRJ_PRJ_PARENT,
	MSPRJ_PRJ_PROPOSED,
	MSPRJ_PRJ_SOW_REF,
	MSPRJ_PRJ_STARTED,
	MSPRJ_PRJ_STATUS,
	MSPRJ_PRJ_TARGET_END,
	MSPRJ_PRJ_TASK_TODO,
	MSPRJ_TODO,
	MSPRJ_PRJ_TODO_DIR,
	MSPRJ_PRJ_TPL_TASK,
} from './constants';
import { todayLocalISODate } from './dates';
import { ensureNoteHeadingTitle } from './noteTitle';
import {
	NoteTemplateError,
	renderNoteTemplate,
	readCoreTemplateFormats,
	assertTemplateFrontmatter,
	builtinNoteTemplate,
	formatTemplateNow,
	frontmatterField,
} from './noteTemplates';
import { derivedProjectOrgCode } from './ownership';
import { chainFromFile } from './ownershipResolve';
import { findOrganizationByCode } from './orgIndex';
import { findProjectByCode, isUnderTemplatesPath } from './projectIndex';
import { ensureMsprjPropertyTypes } from './propertyTypes';
import {
	ensureVaultFolder,
	placeSkeletonFolder,
	removePlacedSkeleton,
	skeletonDestinationPath,
	SkeletonPlaceError,
	type PlacedSkeleton,
} from './skeletons';
import {
	identifierCodeError,
	normalizeNoteFilename,
	normalizeOrganizationCode,
	normalizeProjectCode,
} from './slug';
import { applyTemplateTokens } from './templateTokens';
import { createdTodoDir } from './todoContext';
import { newObjectId } from './uuid';

export { MSPRJ_ARCHETYPE_PROJECT } from './constants';

export interface ProjectFrontmatterFields {
	project_name: string;
	project_code: string;
	/** Organization code. Must match the organization above `owner_path`. */
	project_org: string;
	/** Vault path of the immediate owner. An organization note, or a project note for a child. */
	owner_path: string;
	status?: string;
	next_task_id?: number;
	daily_surface?: boolean;
	/** Required; set only from an explicit New Project prompt. */
	billable: boolean;
	/** New tasks on this project are to-dos. Copied from the plugin setting unless the form changes it. */
	task_todo: boolean;
}

export interface ScaffoldOptions {
	/** Vault-relative templates root; excluded from code uniqueness scan. */
	projectTemplatesPath: string;
	/**
	 * Layout to copy. Null is the empty layout: no `project/default` folder.
	 * A layout supplies the project note as `_prj.md`. An empty layout uses the built-in note.
	 */
	skeleton: TFolder | null;
	/** Stored when this project overrides the organization's task note template. */
	taskTemplateStem: string | null;
	/** True when the owner is a project. Daily surface is written false. */
	child: boolean;
}

export class ScaffoldError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ScaffoldError';
	}
}

interface FolderRootScan {
	primaries: TFile[];
	/** Root markdown notes whose frontmatter did not parse. */
	unreadable: string[];
}

/**
 * Markdown files in the folder root with `msprj_archetype: project`.
 * Nested files are ignored. A note whose frontmatter does not parse is skipped.
 */
async function scanFolderRootNotes(app: App, folder: TFolder): Promise<FolderRootScan> {
	const primaries: TFile[] = [];
	const unreadable: string[] = [];

	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== 'md') {
			continue;
		}

		const content = await app.vault.read(child);
		const info = getFrontMatterInfo(content);
		if (!info.exists) {
			continue;
		}

		let fm: unknown;
		try {
			fm = parseYaml(info.frontmatter);
		} catch {
			unreadable.push(child.name);
			continue;
		}
		if (!fm || typeof fm !== 'object' || Array.isArray(fm)) {
			continue;
		}
		if (isProjectArchetype((fm as Record<string, unknown>)[MSPRJ_ARCHETYPE])) {
			primaries.push(child);
		}
	}

	return { primaries, unreadable };
}

/**
 * Markdown files in the folder root with `msprj_archetype: project`.
 * Nested files are ignored. Unparseable notes are skipped.
 */
export async function findPrimaryProjectNotes(app: App, folder: TFolder): Promise<TFile[]> {
	const { primaries } = await scanFolderRootNotes(app, folder);
	return primaries;
}

/**
 * Copy a project skeleton. The project note is that layout's `_prj.md`, renamed to the chosen file name.
 * An empty layout writes the built-in note. Any other managed note in the layout is a create error.
 */
export async function scaffoldProject(
	app: App,
	destinationFolder: TFolder,
	projectFolderName: string,
	noteFileName: string,
	fields: ProjectFrontmatterFields,
	options: ScaffoldOptions,
): Promise<TFile> {
	const folderName = projectFolderName.trim();
	if (!folderName) {
		throw new ScaffoldError('Project folder name is required.');
	}
	if (folderName.includes('/') || folderName.includes('\\')) {
		throw new ScaffoldError('Project folder name must not contain path separators.');
	}

	const projectName = fields.project_name.trim();
	if (!projectName) {
		throw new ScaffoldError('Project name is required.');
	}

	const code = normalizeProjectCode(fields.project_code);
	if (!code) {
		throw new ScaffoldError(`${MSPRJ_PRJ_CODE} is required.`);
	}
	const codeError = identifierCodeError(code);
	if (codeError) {
		throw new ScaffoldError(`${MSPRJ_PRJ_CODE}: ${codeError}`);
	}

	const duplicate = findProjectByCode(app, code, options.projectTemplatesPath);
	if (duplicate) {
		throw new ScaffoldError(
			`${MSPRJ_PRJ_CODE} "${code}" is already used by ${duplicate.path}.`,
		);
	}

	const orgCode = normalizeOrganizationCode(fields.project_org);
	if (!orgCode) {
		throw new ScaffoldError(`${MSPRJ_PRJ_ORG} is required.`);
	}
	const organization = findOrganizationByCode(app, orgCode, options.projectTemplatesPath);
	if (!organization) {
		throw new ScaffoldError(`No organization note has ${MSPRJ_ORG_CODE} "${orgCode}".`);
	}
	const ownerPath = normalizePath(fields.owner_path);
	const ownerFile = app.vault.getAbstractFileByPath(ownerPath);
	if (!(ownerFile instanceof TFile)) {
		throw new ScaffoldError('The owner note was not found.');
	}
	if (options.child) {
		const ownerFm = app.metadataCache.getFileCache(ownerFile)?.frontmatter;
		if (!isProjectArchetype(ownerFm?.[MSPRJ_ARCHETYPE])) {
			throw new ScaffoldError('A sub-project owner must be a project note.');
		}
		const walked = chainFromFile(app, ownerFile);
		const above = walked.ok ? derivedProjectOrgCode(walked.ancestors) : null;
		if (above !== organization.code) {
			throw new ScaffoldError('The parent project has no matching organization above it.');
		}
	} else if (!isOrganizationArchetype(app.metadataCache.getFileCache(ownerFile)?.frontmatter?.[MSPRJ_ARCHETYPE]) || ownerFile.path !== organization.file.path) {
		throw new ScaffoldError('A root project is owned by its organization note.');
	}
	const ownerLink = `[[${ownerFile.path}]]`;

	const filename = normalizeNoteFilename(noteFileName);
	if (!filename) {
		const raw = noteFileName.trim();
		throw new ScaffoldError(
			raw.includes('/') || raw.includes('\\')
				? 'Project note file name must not contain a path.'
				: 'Project note file name is required.',
		);
	}
	if (typeof fields.billable !== 'boolean') {
		throw new ScaffoldError(
			`${MSPRJ_PRJ_BILLABLE} is required (choose billable or non-billable).`,
		);
	}
	if (typeof fields.task_todo !== 'boolean') {
		throw new ScaffoldError(`${MSPRJ_PRJ_TASK_TODO} is required.`);
	}

	const now = new Date();
	const id = newObjectId();

	if (isUnderTemplatesPath(destinationFolder.path, options.projectTemplatesPath)) {
		throw new ScaffoldError('A project cannot be created inside the templates path.');
	}

	const destPath = skeletonDestinationPath(destinationFolder.path, folderName);
	let placed: PlacedSkeleton;
	try {
		placed = await placeSkeletonFolder(app, options.skeleton, destPath, filename, 'project');
	} catch (err) {
		if (err instanceof SkeletonPlaceError) {
			throw new ScaffoldError(err.message);
		}
		throw err;
	}

	try {
		return await finishProjectScaffold(
			app,
			placed,
			filename,
			id,
			projectName,
			code,
			organization.code,
			ownerLink,
			fields,
			options,
			now,
		);
	} catch (err) {
		const removed = await removePlacedSkeleton(app, placed.folder);
		if (!removed) {
			const message = err instanceof Error ? err.message : String(err);
			throw new ScaffoldError(`${message} The new folder was left at ${placed.folder.path}.`);
		}
		throw err;
	}
}

async function finishProjectScaffold(
	app: App,
	placed: PlacedSkeleton,
	filename: string,
	id: string,
	projectName: string,
	code: string,
	orgCode: string,
	ownerLink: string,
	fields: ProjectFrontmatterFields,
	options: ScaffoldOptions,
	now: Date,
): Promise<TFile> {
	const formats = readCoreTemplateFormats(app);
	const tokenFields = projectTokenFields(
		id,
		projectName,
		code,
		orgCode,
		ownerLink,
		!options.child,
		fields.billable === true,
		fields.task_todo,
		now,
	);
	await applyStockMarkdownTokens(app, placed.folder, {
		now,
		dateFormat: formats.dateFormat,
		timeFormat: formats.timeFormat,
		fields: tokenFields,
	});
	const primary = await materializeProjectNote(app, placed, filename, tokenFields, now, formats);
	const todoDir = createdTodoDir(
		placed.folder.path,
		frontmatterField(await app.vault.read(primary), MSPRJ_PRJ_TODO_DIR),
		MSPRJ_PRJ_TODO_DIR,
	);
	if (todoDir.kind === 'invalid') throw new ScaffoldError(todoDir.message);
	if (todoDir.kind === 'folder') {
		try {
			await ensureVaultFolder(app, todoDir.vaultPath);
		} catch (err) {
			if (err instanceof SkeletonPlaceError) throw new ScaffoldError(err.message);
			throw err;
		}
	}

	await app.fileManager.processFrontMatter(primary, (fm) => {
		fm[MSPRJ_ARCHETYPE] = MSPRJ_ARCHETYPE_PROJECT;
		fm[MSPRJ_ID] = id;
		fm[MSPRJ_PRJ_NAME] = projectName;
		fm[MSPRJ_PRJ_CODE] = code;
		fm[MSPRJ_OWNER] = ownerLink;
		fm[MSPRJ_PRJ_ORG] = orgCode;
		fm[MSPRJ_PRJ_BILLABLE] = fields.billable;
		fm[MSPRJ_PRJ_TASK_TODO] = fields.task_todo;

		if (typeof fm[MSPRJ_PRJ_STATUS] !== 'string' || !fm[MSPRJ_PRJ_STATUS].trim()) {
			fm[MSPRJ_PRJ_STATUS] = fields.status?.trim() || 'active';
		}
		const rawNext = fm[MSPRJ_PRJ_NEXT_TASK_ID];
		const templateNext =
			typeof fields.next_task_id === 'number' ? fields.next_task_id : undefined;
		if (!(typeof rawNext === 'number' && Number.isInteger(rawNext) && rawNext >= 1)) {
			fm[MSPRJ_PRJ_NEXT_TASK_ID] = templateNext ?? 1;
		}
		delete fm[MSPRJ_PRJ_PARENT];
		if (options.child) {
			fm[MSPRJ_PRJ_DAILY_SURFACE] = false;
		} else if (fm[MSPRJ_PRJ_DAILY_SURFACE] === undefined) {
			fm[MSPRJ_PRJ_DAILY_SURFACE] =
				typeof fields.daily_surface === 'boolean' ? fields.daily_surface : true;
		}
		if (typeof fm[MSPRJ_PRJ_GENERAL_ADMIN] !== 'boolean') {
			fm[MSPRJ_PRJ_GENERAL_ADMIN] = false;
		}
		if (fm[MSPRJ_PRJ_OPENED] === undefined) {
			fm[MSPRJ_PRJ_OPENED] = todayLocalISODate(now);
		}
		if (fm[MSPRJ_PRJ_PROPOSED] === undefined) fm[MSPRJ_PRJ_PROPOSED] = null;
		if (fm[MSPRJ_PRJ_STARTED] === undefined) fm[MSPRJ_PRJ_STARTED] = null;
		if (fm[MSPRJ_PRJ_TARGET_END] === undefined) fm[MSPRJ_PRJ_TARGET_END] = null;
		if (fm[MSPRJ_PRJ_COMPLETED] === undefined) fm[MSPRJ_PRJ_COMPLETED] = null;
		if (fm[MSPRJ_PRJ_SOW_REF] === undefined) fm[MSPRJ_PRJ_SOW_REF] = null;
		if (fm[MSPRJ_PRJ_BILLING_MODEL] === undefined) fm[MSPRJ_PRJ_BILLING_MODEL] = null;
		if (fm[MSPRJ_PRJ_HOURS_ESTIMATED] === undefined) fm[MSPRJ_PRJ_HOURS_ESTIMATED] = null;
		if (fm[MSPRJ_PRJ_HOURS_BUDGET] === undefined) fm[MSPRJ_PRJ_HOURS_BUDGET] = null;
		if (fm[MSPRJ_PRJ_AMOUNT_BUDGET] === undefined) fm[MSPRJ_PRJ_AMOUNT_BUDGET] = null;
		if (typeof fm[MSPRJ_TODO] !== 'boolean') fm[MSPRJ_TODO] = false;
		fm[MSPRJ_PRJ_TODO_DIR] = todoDir.kind === 'folder' ? todoDir.vaultPath : null;

		if (options.taskTemplateStem) {
			fm[MSPRJ_PRJ_TPL_TASK] = options.taskTemplateStem;
		} else {
			delete fm[MSPRJ_PRJ_TPL_TASK];
		}
	});

	await ensureNoteHeadingTitle(app, primary, projectName);
	await ensureMsprjPropertyTypes(app);
	return primary;
}

async function materializeProjectNote(
	app: App,
	placed: PlacedSkeleton,
	filename: string,
	tokenFields: Record<string, string>,
	now: Date,
	formats: { dateFormat: string; timeFormat: string },
): Promise<TFile> {
	if (placed.note) {
		try {
			assertTemplateFrontmatter(await app.vault.read(placed.note));
		} catch (err) {
			if (err instanceof NoteTemplateError) {
				throw new ScaffoldError(err.message);
			}
			throw err;
		}
		return placed.note;
	}
	let rendered: string;
	try {
		rendered = renderNoteTemplate(builtinNoteTemplate(MSPRJ_ARCHETYPE_PROJECT), {
			title: filename.slice(0, -3),
			now,
			dateFormat: formats.dateFormat,
			timeFormat: formats.timeFormat,
			fields: tokenFields,
		});
		assertTemplateFrontmatter(rendered);
	} catch (err) {
		if (err instanceof NoteTemplateError) {
			throw new ScaffoldError(err.message);
		}
		throw err;
	}
	const notePath = normalizePath(`${placed.folder.path}/${filename}`);
	if (app.vault.getAbstractFileByPath(notePath)) {
		throw new ScaffoldError(`Project note file already exists: ${notePath}`);
	}
	return app.vault.create(notePath, rendered);
}

function projectTokenFields(
	id: string,
	projectName: string,
	code: string,
	orgCode: string,
	ownerLink: string,
	dailySurface: boolean,
	billable: boolean,
	taskTodo: boolean,
	now: Date,
): Record<string, string> {
	return {
		[MSPRJ_ARCHETYPE]: MSPRJ_ARCHETYPE_PROJECT,
		[MSPRJ_ID]: id,
		[MSPRJ_PRJ_NAME]: projectName,
		[MSPRJ_PRJ_CODE]: code,
		[MSPRJ_OWNER]: ownerLink,
		[MSPRJ_PRJ_ORG]: orgCode,
		[MSPRJ_PRJ_DAILY_SURFACE]: dailySurface ? 'true' : 'false',
		[MSPRJ_PRJ_BILLABLE]: billable ? 'true' : 'false',
		[MSPRJ_PRJ_TASK_TODO]: taskTodo ? 'true' : 'false',
		[MSPRJ_PRJ_OPENED]: todayLocalISODate(now),
		[MSPRJ_PRJ_NEXT_TASK_ID]: '1',
	};
}

export async function applyStockMarkdownTokens(
	app: App,
	folder: TFolder,
	ctx: {
		now: Date;
		dateFormat: string;
		timeFormat: string;
		fields: Record<string, string>;
	},
): Promise<void> {
	const files: TFile[] = [];
	const walk = (current: TFolder): void => {
		for (const child of current.children) {
			if (child instanceof TFolder) {
				walk(child);
				continue;
			}
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			}
		}
	};
	walk(folder);
	for (const file of files) {
		const current = await app.vault.read(file);
		const next = applyTemplateTokens(current, {
			title: file.basename,
			dateFormat: ctx.dateFormat,
			timeFormat: ctx.timeFormat,
			formatNow: (format) => formatTemplateNow(ctx.now, format),
			fields: ctx.fields,
		});
		if (next !== current) {
			await app.vault.modify(file, next);
		}
	}
}
