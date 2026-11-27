import { App, TFile, TFolder } from 'obsidian';
import { MSPRJ_ARCHETYPE, isDocumentArchetype } from './constants';
import { directOrganizationNotes } from './orgIndex';
import { isUnderTemplatesPath } from './projectIndex';
import { directProjectNotes } from './projectResolve';
import {
	aggregateKindForArchetype,
	folderAggregateKind,
	type TodoAggregateKind,
} from './todoScope';
import { designatedTodoDir } from './todoContext';

/** Innermost organization, project, or document that contains a note or folder. */
export interface EntityScope {
	kind: TodoAggregateKind;
	folder: TFolder;
	file: TFile;
	/** Vault path from the entity note. Null when the note names no folder. */
	todoDir: string | null;
}

/**
 * Aggregate for a clicked note.
 * A document, project, or organization note is itself the aggregate.
 * Any other note walks from its folder toward the vault root.
 */
export function entityScopeFromFile(
	app: App,
	file: TFile,
	templatesPath: string,
): EntityScope | null {
	if (file.extension !== 'md') return null;
	if (isUnderTemplatesPath(file.path, templatesPath)) return null;
	const self = scopeFromAggregateNote(app, file);
	if (self) return self;
	return file.parent ? entityScopeFromFolder(app, file.parent, templatesPath) : null;
}

/**
 * Aggregate for a folder. The folder itself counts, then each parent.
 * The templates tree is not inside an entity.
 */
export function entityScopeFromFolder(
	app: App,
	start: TFolder,
	templatesPath: string,
): EntityScope | null {
	let current: TFolder | null = start;
	while (current) {
		if (isUnderTemplatesPath(current.path, templatesPath)) return null;
		const found = aggregateInFolder(app, current, templatesPath);
		if (found) return found;
		current = current.parent;
	}
	return null;
}

function scopeFromAggregateNote(app: App, file: TFile): EntityScope | null {
	const folder = file.parent;
	if (!folder) return null;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? null;
	const kind = aggregateKindForArchetype(fm?.[MSPRJ_ARCHETYPE]);
	if (!kind) return null;
	return {
		kind,
		folder,
		file,
		todoDir: designatedTodoDir(fm?.[MSPRJ_ARCHETYPE], fm),
	};
}

function aggregateInFolder(
	app: App,
	folder: TFolder,
	templatesPath: string,
): EntityScope | null {
	const documents = directDocumentNotes(app, folder, templatesPath);
	const projects = directProjectNotes(app, folder, templatesPath);
	const organizations = directOrganizationNotes(app, folder, templatesPath);
	const kind = folderAggregateKind({
		documents: documents.length,
		projects: projects.length,
		organizations: organizations.length,
	});
	if (kind === 'document') return scopeFromAggregateNote(app, documents[0]!);
	if (kind === 'project') return scopeFromAggregateNote(app, projects[0]!.file);
	if (kind === 'organization') return scopeFromAggregateNote(app, organizations[0]!.file);
	return null;
}

/** Document root notes directly in this folder. Nested notes are ignored. */
export function directDocumentNotes(
	app: App,
	folder: TFolder,
	templatesPath: string,
): TFile[] {
	if (isUnderTemplatesPath(folder.path, templatesPath)) return [];
	const found: TFile[] = [];
	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== 'md') continue;
		if (isUnderTemplatesPath(child.path, templatesPath)) continue;
		const fm = app.metadataCache.getFileCache(child)?.frontmatter;
		if (isDocumentArchetype(fm?.[MSPRJ_ARCHETYPE])) found.push(child);
	}
	return found;
}
