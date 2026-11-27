import { App, Notice, TFile, TFolder } from 'obsidian';
import { MSPRJ_ARCHETYPE, isManagedArchetype, type SubordinateArchetypeId } from './constants';
import { CreateSubordinateError, createSubordinateNote } from './createSubordinate';
import { entityScopeFromFile, entityScopeFromFolder } from './entityScope';
import type MuseProjectsPlugin from './main';
import { documentInScope } from './noteCreateAction';
import { isUnderTemplatesPath } from './projectIndex';
import { subordinateKind } from './subordinates';
import { promptThinNote } from './thinNoteForm';

export interface SubordinateFlowContext {
	owner: TFile | null;
	folder: TFolder | null;
}

/**
 * New subordinate note. A passed context wins.
 * Without one, the active note is used when a document is in scope.
 */
export async function runNewSubordinateFlow(
	plugin: MuseProjectsPlugin,
	archetype: SubordinateArchetypeId,
	context?: SubordinateFlowContext,
): Promise<void> {
	const { app } = plugin;
	const templatesPath = plugin.settings.projectTemplatesPath.trim();
	const kind = subordinateKind(archetype);
	const seed = context ?? contextFromActiveFile(app, templatesPath);
	if (!seed) {
		new Notice(`Open a note inside a document before creating a ${kind.label.toLowerCase()}.`);
		return;
	}
	promptThinNote(app, templatesPath, kind, seed, (fields) => {
		void (async () => {
			try {
				const file = await createSubordinateNote(
					app,
					{
						archetype,
						title: fields.title,
						owner: seed.owner,
						folder: fields.folder,
						noteTemplate: fields.noteTemplate,
					},
					templatesPath,
				);
				new Notice(`Created ${kind.label.toLowerCase()} ${file.basename}`);
				await app.workspace.getLeaf(false).openFile(file);
			} catch (err) {
				const message =
					err instanceof CreateSubordinateError
						? err.message
						: err instanceof Error
							? err.message
							: String(err);
				new Notice(message);
				console.error(`Muse Projects: New ${kind.label} failed`, err);
			}
		})();
	});
}

/**
 * Owner and folder for a subordinate created from a note.
 * The clicked managed note owns it. An ordinary note inside a document is owned by that document.
 * Null when no document is in scope.
 */
export function subordinateFlowContextFromNote(
	app: App,
	file: TFile,
	templatesPath: string,
): SubordinateFlowContext | null {
	if (isUnderTemplatesPath(file.path, templatesPath)) return null;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? null;
	const archetype = fm?.[MSPRJ_ARCHETYPE];
	const scope = entityScopeFromFile(app, file, templatesPath);
	if (!documentInScope(archetype, scope?.kind ?? null)) return null;
	return {
		owner: isManagedArchetype(archetype) ? file : (scope?.file ?? null),
		folder: file.parent,
	};
}

/**
 * Owner and folder for a subordinate created from a folder.
 * The folder's document owns it. Null when the nearest entity is not a document.
 */
export function subordinateFlowContextFromFolder(
	app: App,
	folder: TFolder,
	templatesPath: string,
): SubordinateFlowContext | null {
	if (isUnderTemplatesPath(folder.path, templatesPath)) return null;
	const scope = entityScopeFromFolder(app, folder, templatesPath);
	if (scope?.kind !== 'document') return null;
	return { owner: scope.file, folder };
}

function contextFromActiveFile(app: App, templatesPath: string): SubordinateFlowContext | null {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') return null;
	return subordinateFlowContextFromNote(app, file, templatesPath);
}
