import { isDocumentArchetype, isOrgResourceArchetype, isSubordinateArchetype } from './constants';

/** What a right-click inside a note can start. */
export type NoteCreateAction =
	| 'new-task'
	| 'new-project'
	| 'new-organization'
	| 'new-todo'
	| 'new-document'
	| 'new-org-resource'
	| 'new-subordinate';

/**
 * True when the subordinate set belongs on the menu.
 * The note is a document or a subordinate, or the nearest entity is a document.
 */
export function documentInScope(
	noteArchetype: unknown,
	aggregateKind: string | null,
): boolean {
	return (
		isDocumentArchetype(noteArchetype) ||
		isSubordinateArchetype(noteArchetype) ||
		aggregateKind === 'document'
	);
}

/**
 * True when Contact and Resource belong on the menu.
 * The note is a contact or a resource, or the nearest entity is an organization or a project.
 */
export function orgResourceInScope(
	noteArchetype: unknown,
	aggregateKind: string | null,
): boolean {
	return (
		isOrgResourceArchetype(noteArchetype) ||
		aggregateKind === 'organization' ||
		aggregateKind === 'project'
	);
}

/**
 * A folder is a project directory when its root holds exactly one project note.
 * It is an organization directory when it holds exactly one organization note and no project note.
 * A project wins. Any other count is an ordinary folder.
 */
export function directoryContextKind(direct: {
	projects: number;
	organizations: number;
}): 'project' | 'organization' | 'none' {
	if (direct.projects === 1) return 'project';
	if (direct.projects === 0 && direct.organizations === 1) return 'organization';
	return 'none';
}

/**
 * A project note can start a task or a sub-project. An organization note can start a child organization or a project.
 * Any live note can start a document and a to-do. An organization or a project in scope can start a contact or a resource.
 * A document in scope can start a subordinate.
 * A note under the templates tree is not a live object. A project wins over an organization if a note were ever both.
 */
export function noteCreateActions(note: {
	underTemplates: boolean;
	isProject: boolean;
	isOrganization: boolean;
	/** Nearest entity is a document, or the note itself is a document or a subordinate. */
	documentInScope: boolean;
	/** Nearest entity is an organization or a project, or the note itself is a contact or a resource. */
	orgResourceInScope: boolean;
}): NoteCreateAction[] {
	if (note.underTemplates) {
		return [];
	}
	const actions: NoteCreateAction[] = [];
	if (note.isProject) {
		actions.push('new-task', 'new-project');
	} else if (note.isOrganization) {
		actions.push('new-organization', 'new-project');
	}
	actions.push('new-document', 'new-todo');
	if (note.orgResourceInScope) {
		actions.push('new-org-resource');
	}
	if (note.documentInScope) {
		actions.push('new-subordinate');
	}
	return actions;
}
