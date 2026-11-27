import {
	MSPRJ_ARCHETYPE_DOCUMENT,
	MSPRJ_ARCHETYPE_ORGANIZATION,
	MSPRJ_ARCHETYPE_PROJECT,
} from './constants';

/** Entity that associates a to-do. One to-do has one of these. */
export type TodoAggregateKind = 'organization' | 'project' | 'document';

/**
 * The entity a folder is, from the notes at its root.
 * A single document wins over a project, and a single project wins over an organization.
 * More than one document, or more than one project, names no entity.
 * The walk then continues toward the vault root.
 */
export function folderAggregateKind(counts: {
	documents: number;
	projects: number;
	organizations: number;
}): TodoAggregateKind | null {
	if (counts.documents === 1) return 'document';
	if (counts.documents > 1) return null;
	if (counts.projects === 1) return 'project';
	if (counts.projects > 1) return null;
	if (counts.organizations === 1) return 'organization';
	return null;
}

/** Document, project, or organization. Any other archetype is not an aggregate. */
export function aggregateKindForArchetype(archetype: unknown): TodoAggregateKind | null {
	if (archetype === MSPRJ_ARCHETYPE_DOCUMENT) return 'document';
	if (archetype === MSPRJ_ARCHETYPE_PROJECT) return 'project';
	if (archetype === MSPRJ_ARCHETYPE_ORGANIZATION) return 'organization';
	return null;
}

/**
 * Nearest entity, walking from the start folder toward the vault root.
 * The first non-null kind wins. A parent project does not take a sub-project's to-do,
 * and a project does not take a document's to-do.
 */
export function firstAggregate(kindsFromStart: readonly (TodoAggregateKind | null)[]): TodoAggregateKind | null {
	for (const kind of kindsFromStart) {
		if (kind) return kind;
	}
	return null;
}
