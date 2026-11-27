import {
	MSPRJ_ARCHETYPE_ORGANIZATION,
	MSPRJ_ARCHETYPE_PROJECT,
} from './constants';
import { normalizeOrganizationCode } from './slug';
import { frontmatterLinkPath } from './wikilinks';

/** One note on an owner chain. `owner` is that note's raw `msprj_owner` value. */
export interface ChainNote {
	path: string;
	archetype: unknown;
	owner: unknown;
	orgCode: unknown;
	projectCode: unknown;
	projectName: unknown;
	generalAdmin: unknown;
}

export type OwnerWalk =
	| { ok: true; ancestors: ChainNote[] }
	| { ok: false; reason: 'dangling' | 'cycle' };

/** Derived copies on a task. Null when the chain has no project with an organization above it. */
export interface DerivedTaskFacts {
	projectCode: string | null;
	orgCode: string;
	generalAdmin: boolean;
}

/** Null, or a string with nothing in it, is the top of a chain. */
export function isEmptyOwner(raw: unknown): boolean {
	if (raw == null) return true;
	if (typeof raw !== 'string') return false;
	return raw.trim() === '';
}

/**
 * Ancestors of a note, immediate owner first.
 * `resolve` loads the note named by a non-empty owner value. Null is a dangling link.
 */
export function walkOwnerChain(
	startPath: string,
	startOwner: unknown,
	resolve: (fromPath: string, ownerRaw: unknown) => ChainNote | null,
): OwnerWalk {
	const seen = new Set<string>([startPath]);
	const ancestors: ChainNote[] = [];
	let fromPath = startPath;
	let raw = startOwner;
	for (;;) {
		if (isEmptyOwner(raw)) return { ok: true, ancestors };
		if (typeof raw !== 'string' || !frontmatterLinkPath(raw)) {
			return { ok: false, reason: 'dangling' };
		}
		const note = resolve(fromPath, raw);
		if (!note?.path) return { ok: false, reason: 'dangling' };
		if (seen.has(note.path)) return { ok: false, reason: 'cycle' };
		seen.add(note.path);
		ancestors.push(note);
		fromPath = note.path;
		raw = note.owner;
	}
}

/** Organization code of the nearest organization ancestor. Null when the chain has none. */
export function derivedProjectOrgCode(ancestors: readonly ChainNote[]): string | null {
	for (const note of ancestors) {
		if (note.archetype !== MSPRJ_ARCHETYPE_ORGANIZATION) continue;
		return organizationCode(note);
	}
	return null;
}

/**
 * Task copies from the nearest project ancestor and the organization above that project.
 * Null when either is missing, or the organization has no code.
 */
export function derivedTaskFacts(ancestors: readonly ChainNote[]): DerivedTaskFacts | null {
	const projectAt = ancestors.findIndex((note) => note.archetype === MSPRJ_ARCHETYPE_PROJECT);
	if (projectAt < 0) return null;
	const project = ancestors[projectAt];
	if (!project) return null;
	const orgCode = derivedProjectOrgCode(ancestors.slice(projectAt + 1));
	if (!orgCode) return null;
	return {
		projectCode: textOrNull(project.projectCode),
		orgCode,
		generalAdmin: project.generalAdmin === true,
	};
}

/** Projects above the nearest project ancestor. The nearest project is the task's own project. */
export function rollupProjects(
	ancestors: readonly ChainNote[],
): { code: string; name: string }[] {
	const projectAt = ancestors.findIndex((note) => note.archetype === MSPRJ_ARCHETYPE_PROJECT);
	if (projectAt < 0) return [];
	const labels: { code: string; name: string }[] = [];
	for (const note of ancestors.slice(projectAt + 1)) {
		if (note.archetype !== MSPRJ_ARCHETYPE_PROJECT) continue;
		labels.push({
			code: textOrNull(note.projectCode) ?? '',
			name: textOrNull(note.projectName) ?? '',
		});
	}
	return labels;
}

function organizationCode(note: ChainNote): string | null {
	if (typeof note.orgCode !== 'string') return null;
	const code = normalizeOrganizationCode(note.orgCode);
	return code || null;
}

function textOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return text ? text : null;
}
