import { App, Notice, TFile, TFolder } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	isManagedArchetype,
	type OrgResourceArchetypeId,
} from './constants';
import { CreateSubordinateError, createThinNote } from './createSubordinate';
import { entityScopeFromFile, entityScopeFromFolder } from './entityScope';
import type MuseProjectsPlugin from './main';
import { orgResourceInScope } from './noteCreateAction';
import { orgResourceKind } from './orgResources';
import { isUnderTemplatesPath } from './projectIndex';
import { promptThinNote } from './thinNoteForm';

export interface OrgResourceFlowContext {
	owner: TFile | null;
	folder: TFolder | null;
}

/**
 * New contact or resource. A passed context wins.
 * Without one, the active note is used when an organization or a project is in scope.
 */
export async function runNewOrgResourceFlow(
	plugin: MuseProjectsPlugin,
	archetype: OrgResourceArchetypeId,
	context?: OrgResourceFlowContext,
): Promise<void> {
	const { app } = plugin;
	const templatesPath = plugin.settings.projectTemplatesPath.trim();
	const kind = orgResourceKind(archetype);
	const seed = context ?? contextFromActiveFile(app, templatesPath);
	if (!seed) {
		new Notice(
			`Open a note inside an organization or project before creating a ${kind.label.toLowerCase()}.`,
		);
		return;
	}
	promptThinNote(app, templatesPath, kind, seed, (fields) => {
		void (async () => {
			try {
				const file = await createThinNote(
					app,
					{
						archetype,
						label: kind.label,
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
 * Owner and folder for a contact or resource created from a note.
 * The clicked managed note owns it. An ordinary note is owned by the organization or project.
 * Null when neither is in scope.
 */
export function orgResourceFlowContextFromNote(
	app: App,
	file: TFile,
	templatesPath: string,
): OrgResourceFlowContext | null {
	if (isUnderTemplatesPath(file.path, templatesPath)) return null;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? null;
	const archetype = fm?.[MSPRJ_ARCHETYPE];
	const scope = entityScopeFromFile(app, file, templatesPath);
	if (!orgResourceInScope(archetype, scope?.kind ?? null)) return null;
	return {
		owner: isManagedArchetype(archetype) ? file : (scope?.file ?? null),
		folder: file.parent,
	};
}

/**
 * Owner and folder for a contact or resource created from a folder.
 * The nearest organization or project owns it. Null when that entity is neither.
 */
export function orgResourceFlowContextFromFolder(
	app: App,
	folder: TFolder,
	templatesPath: string,
): OrgResourceFlowContext | null {
	if (isUnderTemplatesPath(folder.path, templatesPath)) return null;
	const scope = entityScopeFromFolder(app, folder, templatesPath);
	if (scope?.kind !== 'organization' && scope?.kind !== 'project') return null;
	return { owner: scope.file, folder };
}

function contextFromActiveFile(app: App, templatesPath: string): OrgResourceFlowContext | null {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') return null;
	return orgResourceFlowContextFromNote(app, file, templatesPath);
}
