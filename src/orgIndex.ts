import { App, TFile, TFolder } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ORG_BILLABLE,
	MSPRJ_ORG_CODE,
	MSPRJ_ORG_NAME,
	MSPRJ_ORG_CLOCK_FORMAT,
	MSPRJ_ORG_DURATION_FORMAT,
	MSPRJ_ORG_WEEK_START,
	isOrganizationArchetype,
} from './constants';
import { parseClockFormat, type ClockFormat } from './clockFormat';
import { parseDurationFormat, type DurationFormat } from './durationFormat';
import { parseWeekStart, type WeekStart } from './weekStart';
import { isUnderTemplatesPath } from './projectIndex';
import { normalizeOrganizationCode } from './slug';

export interface OrganizationNote {
	file: TFile;
	code: string;
	name: string;
	billable: boolean | null;
	/** Null when the note has no recognized `msprj_org_week_start`. */
	weekStart: WeekStart | null;
	/** Null when the note has no recognized `msprj_org_duration_format`. */
	durationFormat: DurationFormat | null;
	/** Null when the note has no recognized `msprj_org_clock_format`. */
	clockFormat: ClockFormat | null;
}

/** The file itself when it is an organization note outside the templates tree. */
export function organizationFromFile(
	app: App,
	file: TFile,
	templatesPath: string,
): OrganizationNote | null {
	if (file.extension !== 'md') {
		return null;
	}
	if (isUnderTemplatesPath(file.path, templatesPath)) {
		return null;
	}
	return readOrganization(file, app.metadataCache.getFileCache(file)?.frontmatter);
}

/** A usable organization note has an archetype and a non-empty code. */
export function readOrganization(
	file: TFile,
	fm: object | null | undefined,
): OrganizationNote | null {
	if (!fm) {
		return null;
	}
	const record = fm as Record<string, unknown>;
	if (!isOrganizationArchetype(record[MSPRJ_ARCHETYPE])) {
		return null;
	}
	const codeRaw = record[MSPRJ_ORG_CODE];
	if (typeof codeRaw !== 'string') {
		return null;
	}
	const code = normalizeOrganizationCode(codeRaw);
	if (!code) {
		return null;
	}
	const nameRaw = record[MSPRJ_ORG_NAME];
	const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : code;
	const billableRaw = record[MSPRJ_ORG_BILLABLE];
	const billable = typeof billableRaw === 'boolean' ? billableRaw : null;
	const weekStart = parseWeekStart(record[MSPRJ_ORG_WEEK_START]);
	const durationFormat = parseDurationFormat(record[MSPRJ_ORG_DURATION_FORMAT]);
	const clockFormat = parseClockFormat(record[MSPRJ_ORG_CLOCK_FORMAT]);
	return { file, code, name, billable, weekStart, durationFormat, clockFormat };
}

/**
 * Nearest organization note in this folder or a parent folder.
 * A folder with more than one organization note does not name an organization.
 * The templates tree is not inside an organization.
 */
export function nearestOrganizationInFolder(
	app: App,
	folder: TFolder,
	templatesPath: string,
): OrganizationNote | null {
	let current: TFolder | null = folder;
	while (current) {
		if (isUnderTemplatesPath(current.path, templatesPath)) return null;
		const found = directOrganizationNotes(app, current, templatesPath);
		if (found.length === 1) return found[0]!;
		current = current.parent;
	}
	return null;
}

/**
 * Organization notes directly in this folder, from the metadata cache.
 * Nested notes are ignored. The templates tree is not an organization.
 */
export function directOrganizationNotes(
	app: App,
	folder: TFolder,
	templatesPath: string,
): OrganizationNote[] {
	if (isUnderTemplatesPath(folder.path, templatesPath)) {
		return [];
	}
	const found: OrganizationNote[] = [];
	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== 'md') {
			continue;
		}
		const org = readOrganization(child, app.metadataCache.getFileCache(child)?.frontmatter);
		if (org) {
			found.push(org);
		}
	}
	return found;
}

/** Organization notes outside the templates tree, sorted by code. */
export function listOrganizations(app: App, templatesPath: string): OrganizationNote[] {
	const notes: OrganizationNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (isUnderTemplatesPath(file.path, templatesPath)) {
			continue;
		}
		const org = readOrganization(file, app.metadataCache.getFileCache(file)?.frontmatter);
		if (org) {
			notes.push(org);
		}
	}
	notes.sort((a, b) => a.code.localeCompare(b.code) || a.file.path.localeCompare(b.file.path));
	return notes;
}

/** First organization note with this code, after normalization. Skips the templates tree. */
export function findOrganizationByCode(
	app: App,
	code: string,
	templatesPath: string,
): OrganizationNote | null {
	const target = normalizeOrganizationCode(code);
	if (!target) {
		return null;
	}
	for (const org of listOrganizations(app, templatesPath)) {
		if (org.code === target) {
			return org;
		}
	}
	return null;
}
