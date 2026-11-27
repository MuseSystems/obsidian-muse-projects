import {
	App,
	getFrontMatterInfo,
	moment,
	normalizePath,
	parseYaml,
	TFile,
	TFolder,
} from 'obsidian';
import {
	MSPRJ_ARCHETYPE_DOCUMENT,
	MSPRJ_ARCHETYPE_ORGANIZATION,
	MSPRJ_ARCHETYPE_PROJECT,
	MSPRJ_ARCHETYPE_TASK,
	MSPRJ_ARCHETYPE_TODO,
	MSPRJ_ORG_SKEL_PROJECT,
	MSPRJ_ORG_TPL_TASK,
	MSPRJ_PRJ_ORG,
	MSPRJ_PRJ_TPL_TASK,
	isOrgResourceArchetype,
	isSubordinateArchetype,
	type OrgResourceArchetypeId,
	type SubordinateArchetypeId,
} from './constants';
import { findOrganizationByCode } from './orgIndex';
import { organizationReportBlocks } from './timeReport';
import {
	applyTemplateTokens,
	normalizeTemplateStem,
	VAULT_DEFAULT_TEMPLATE_STEM,
} from './templateTokens';

export type NoteArchetype =
	| typeof MSPRJ_ARCHETYPE_ORGANIZATION
	| typeof MSPRJ_ARCHETYPE_PROJECT
	| typeof MSPRJ_ARCHETYPE_TASK
	| typeof MSPRJ_ARCHETYPE_TODO
	| typeof MSPRJ_ARCHETYPE_DOCUMENT
	| SubordinateArchetypeId
	| OrgResourceArchetypeId;

/** How create chooses a note template. `inherit` walks the owner chain. */
export type TemplateSelection =
	| { kind: 'inherit'; inheritedStem: string | null }
	| { kind: 'vault-default' }
	| { kind: 'named'; stem: string };

export interface NoteTemplateFile {
	stem: string;
	file: TFile;
}

export class NoteTemplateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NoteTemplateError';
	}
}

const CORE_DATE_FORMAT = 'YYYY-MM-DD';
const CORE_TIME_FORMAT = 'HH:mm';

const BUILTIN_ORGANIZATION = `---
msprj_archetype: organization
msprj_id: "{{msprj_id}}"
msprj_owner:
msprj_org_name: "{{msprj_org_name}}"
msprj_org_code: "{{msprj_org_code}}"
msprj_org_billable: {{msprj_org_billable}}
msprj_org_week_start: "{{msprj_org_week_start}}"
msprj_org_duration_format: "{{msprj_org_duration_format}}"
msprj_org_clock_format: "{{msprj_org_clock_format}}"
msprj_org_todo_dir: todos
---

# {{msprj_org_code}} - {{msprj_org_name}}

${organizationReportBlocks()}
`;

const BUILTIN_PROJECT = `---
msprj_archetype: project
msprj_id: "{{msprj_id}}"
msprj_prj_name: "{{msprj_prj_name}}"
msprj_prj_code: "{{msprj_prj_code}}"
msprj_owner: "{{msprj_owner}}"
msprj_prj_org: "{{msprj_prj_org}}"
msprj_prj_status: active
msprj_prj_next_task_id: 1
msprj_prj_daily_surface: {{msprj_prj_daily_surface}}
msprj_prj_general_admin: false
msprj_prj_billable: {{msprj_prj_billable}}
msprj_prj_task_todo: {{msprj_prj_task_todo}}
msprj_todo: false
msprj_prj_todo_dir: todos
msprj_prj_opened: "{{date:YYYY-MM-DD}}"
msprj_prj_proposed:
msprj_prj_started:
msprj_prj_target_end:
msprj_prj_completed:
msprj_prj_sow_ref:
msprj_prj_billing_model:
msprj_prj_hours_estimated:
msprj_prj_hours_budget:
msprj_prj_amount_budget:
---

# {{msprj_prj_name}}
`;

const BUILTIN_TASK = `---
msprj_archetype: task
msprj_id: "{{msprj_id}}"
msprj_tsk_title: "{{msprj_tsk_title}}"
msprj_tsk_code: "{{msprj_tsk_code}}"
msprj_owner: "{{msprj_owner}}"
msprj_tsk_project_code: "{{msprj_tsk_project_code}}"
msprj_tsk_org: "{{msprj_tsk_org}}"
msprj_tsk_general_admin: {{msprj_tsk_general_admin}}
msprj_tsk_status: backlog
msprj_todo: {{msprj_todo}}
msprj_tsk_scheduled: "{{msprj_tsk_scheduled}}"
msprj_tsk_due:
msprj_tsk_completed:
msprj_tsk_billable: {{msprj_tsk_billable}}
msprj_tsk_blocked_by: []
msprj_tsk_time_entries: []
---

# {{msprj_tsk_code}} - {{msprj_tsk_title}}
`;

const BUILTIN_TODO = `---
msprj_archetype: todo
msprj_id: "{{msprj_id}}"
msprj_tdo_title: "{{msprj_tdo_title}}"
msprj_tdo_code: "{{msprj_tdo_code}}"
msprj_owner: "{{msprj_owner}}"
msprj_tdo_status: backlog
msprj_todo: true
msprj_tdo_scheduled: "{{msprj_tdo_scheduled}}"
msprj_tdo_due:
msprj_tdo_completed:
msprj_tdo_blocked_by: []
---

# {{msprj_tdo_code}} - {{msprj_tdo_title}}
`;

const BUILTIN_DOCUMENT = `---
msprj_archetype: document
msprj_id: "{{msprj_id}}"
msprj_title: "{{msprj_title}}"
msprj_owner: "{{msprj_owner}}"
msprj_doc_todo_dir: todos
---

# {{msprj_title}}
`;

function builtinSubordinate(archetype: SubordinateArchetypeId): string {
	return `---
msprj_archetype: ${archetype}
msprj_id: "{{msprj_id}}"
msprj_title: "{{msprj_title}}"
msprj_owner: "{{msprj_owner}}"
---

# {{msprj_title}}
`;
}

function builtinOrgResource(archetype: OrgResourceArchetypeId): string {
	const sections =
		archetype === 'contact' ? '\n## Role\n\n## Reach\n' : '\n## Where\n\n## Notes\n';
	return `---
msprj_archetype: ${archetype}
msprj_id: "{{msprj_id}}"
msprj_title: "{{msprj_title}}"
msprj_owner: "{{msprj_owner}}"
---

# {{msprj_title}}
${sections}`;
}

export function builtinNoteTemplate(archetype: NoteArchetype): string {
	if (isSubordinateArchetype(archetype)) return builtinSubordinate(archetype);
	if (isOrgResourceArchetype(archetype)) return builtinOrgResource(archetype);
	switch (archetype) {
		case MSPRJ_ARCHETYPE_ORGANIZATION:
			return BUILTIN_ORGANIZATION;
		case MSPRJ_ARCHETYPE_PROJECT:
			return BUILTIN_PROJECT;
		case MSPRJ_ARCHETYPE_TASK:
			return BUILTIN_TASK;
		case MSPRJ_ARCHETYPE_TODO:
			return BUILTIN_TODO;
		case MSPRJ_ARCHETYPE_DOCUMENT:
			return BUILTIN_DOCUMENT;
		default: {
			const exhaustive: never = archetype;
			return exhaustive;
		}
	}
}

/** Date and time formats from the core Templates plugin, when those settings exist. */
export function readCoreTemplateFormats(app: App): { dateFormat: string; timeFormat: string } {
	const plugin = (
		app as unknown as {
			internalPlugins?: {
				getPluginById?: (id: string) => {
					instance?: { options?: { dateFormat?: string; timeFormat?: string } };
				} | null;
			};
		}
	).internalPlugins?.getPluginById?.('templates');
	const options = plugin?.instance?.options;
	return {
		dateFormat: options?.dateFormat?.trim() || CORE_DATE_FORMAT,
		timeFormat: options?.timeFormat?.trim() || CORE_TIME_FORMAT,
	};
}

export function formatTemplateNow(now: Date, format: string): string {
	return moment(now).format(format);
}

export function renderNoteTemplate(
	raw: string,
	args: {
		title: string;
		now: Date;
		dateFormat: string;
		timeFormat: string;
		fields: Record<string, string>;
	},
): string {
	const rendered = applyTemplateTokens(raw, {
		title: args.title,
		dateFormat: args.dateFormat,
		timeFormat: args.timeFormat,
		formatNow: (format) => formatTemplateNow(args.now, format),
		fields: args.fields,
	});
	return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

/** One frontmatter field. Undefined when the note has no map, or the key is absent. */
export function frontmatterField(content: string, key: string): unknown {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return undefined;
	let parsed: unknown;
	try {
		parsed = parseYaml(info.frontmatter);
	} catch {
		return undefined;
	}
	if (parsed === null || parsed === undefined) return undefined;
	if (typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
	return (parsed as Record<string, unknown>)[key];
}

/** Throw when the rendered template has frontmatter that will not parse. */
export function assertTemplateFrontmatter(content: string): void {
	const info = getFrontMatterInfo(content);
	if (!info.exists) {
		return;
	}
	let parsed: unknown;
	try {
		parsed = parseYaml(info.frontmatter);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new NoteTemplateError(`Note template frontmatter did not parse: ${message}`);
	}
	if (parsed === null || parsed === undefined) {
		return;
	}
	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NoteTemplateError('Note template frontmatter must be a map.');
	}
}

function archetypeFolder(
	app: App,
	templatesPath: string,
	archetype: NoteArchetype,
): TFolder | null {
	const root = normalizePath(templatesPath.trim());
	if (!root) {
		return null;
	}
	const folder = app.vault.getAbstractFileByPath(normalizePath(`${root}/${archetype}`));
	return folder instanceof TFolder ? folder : null;
}

/** Markdown note templates directly inside `<templates path>/<archetype>/`. */
export function listNoteTemplateFiles(
	app: App,
	templatesPath: string,
	archetype: NoteArchetype,
): NoteTemplateFile[] {
	const folder = archetypeFolder(app, templatesPath, archetype);
	if (!folder) {
		return [];
	}
	const files: NoteTemplateFile[] = [];
	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== 'md') {
			continue;
		}
		files.push({ stem: child.basename, file: child });
	}
	files.sort((a, b) => a.stem.localeCompare(b.stem) || a.file.path.localeCompare(b.file.path));
	return files;
}

/** Named templates a create form can offer. `default` is the vault-default option, not a second row. */
export function selectableTemplateStems(files: NoteTemplateFile[]): string[] {
	return files
		.map((file) => file.stem)
		.filter((stem) => stem !== VAULT_DEFAULT_TEMPLATE_STEM);
}

function findNoteTemplateFile(
	app: App,
	templatesPath: string,
	archetype: NoteArchetype,
	stem: string,
): TFile | null {
	const folder = archetypeFolder(app, templatesPath, archetype);
	if (!folder) {
		return null;
	}
	const file = app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${stem}.md`));
	return file instanceof TFile ? file : null;
}

async function readDefaultOrBuiltin(
	app: App,
	templatesPath: string,
	archetype: NoteArchetype,
): Promise<string> {
	const file = findNoteTemplateFile(
		app,
		templatesPath,
		archetype,
		VAULT_DEFAULT_TEMPLATE_STEM,
	);
	if (file) {
		return app.vault.read(file);
	}
	return builtinNoteTemplate(archetype);
}

/** Raw note template text for this create. Does not substitute tokens. */
export async function readNoteTemplate(
	app: App,
	templatesPath: string,
	archetype: NoteArchetype,
	selection: TemplateSelection,
): Promise<string> {
	if (selection.kind === 'named') {
		const stem = normalizeTemplateStem(selection.stem);
		if (!stem) {
			throw new NoteTemplateError('Note template name is empty.');
		}
		const file = findNoteTemplateFile(app, templatesPath, archetype, stem);
		if (!file) {
			throw new NoteTemplateError(`Note template "${archetype}/${stem}" was not found.`);
		}
		return app.vault.read(file);
	}
	if (selection.kind === 'inherit') {
		const stem = normalizeTemplateStem(selection.inheritedStem);
		if (stem) {
			const file = findNoteTemplateFile(app, templatesPath, archetype, stem);
			if (!file) {
				throw new NoteTemplateError(`Note template "${archetype}/${stem}" was not found.`);
			}
			return app.vault.read(file);
		}
	}
	return readDefaultOrBuiltin(app, templatesPath, archetype);
}

export function organizationTemplateStem(
	app: App,
	orgFile: TFile,
	key: typeof MSPRJ_ORG_TPL_TASK | typeof MSPRJ_ORG_SKEL_PROJECT,
): string | null {
	const raw = app.metadataCache.getFileCache(orgFile)?.frontmatter?.[key];
	return normalizeTemplateStem(raw);
}

/** Project override, otherwise the owning organization's task template. */
export function inheritedTaskTemplateStem(
	app: App,
	projectFile: TFile,
	templatesPath: string,
): string | null {
	const fm = app.metadataCache.getFileCache(projectFile)?.frontmatter;
	const own = normalizeTemplateStem(fm?.[MSPRJ_PRJ_TPL_TASK]);
	if (own) {
		return own;
	}
	const orgCode = fm?.[MSPRJ_PRJ_ORG];
	if (typeof orgCode !== 'string' || !orgCode.trim()) {
		return null;
	}
	const org = findOrganizationByCode(app, orgCode, templatesPath);
	if (!org) {
		return null;
	}
	return organizationTemplateStem(app, org.file, MSPRJ_ORG_TPL_TASK);
}

export async function renderArchetypeTemplate(
	app: App,
	templatesPath: string,
	archetype: NoteArchetype,
	selection: TemplateSelection,
	title: string,
	fields: Record<string, string>,
	now: Date = new Date(),
): Promise<string> {
	const raw = await readNoteTemplate(app, templatesPath, archetype, selection);
	const formats = readCoreTemplateFormats(app);
	const rendered = renderNoteTemplate(raw, {
		title,
		now,
		dateFormat: formats.dateFormat,
		timeFormat: formats.timeFormat,
		fields,
	});
	assertTemplateFrontmatter(rendered);
	return rendered;
}
