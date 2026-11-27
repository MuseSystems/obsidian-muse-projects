import { Menu, TFile, TFolder, type TAbstractFile } from 'obsidian';
import { MSPRJ_ARCHETYPE } from './constants';
import { entityScopeFromFile, entityScopeFromFolder } from './entityScope';
import { isSingleExplorerFile, isSingleExplorerFolder } from './explorerFolder';
import type MuseProjectsPlugin from './main';
import { documentFlowContextFromNote, runNewDocumentFlow } from './newDocumentFlow';
import { promptNewOrganization } from './newOrganizationFlow';
import { runNewProjectFlow } from './newProjectFlow';
import {
	orgResourceFlowContextFromFolder,
	orgResourceFlowContextFromNote,
	runNewOrgResourceFlow,
} from './newOrgResourceFlow';
import {
	runNewSubordinateFlow,
	subordinateFlowContextFromFolder,
	subordinateFlowContextFromNote,
} from './newSubordinateFlow';
import { runNewTaskFlow } from './newTaskFlow';
import { runNewTodoFlow, todoFlowContextFromFolder, todoFlowContextFromNote } from './newTodoFlow';
import {
	directoryContextKind,
	documentInScope,
	noteCreateActions,
	orgResourceInScope,
} from './noteCreateAction';
import { directOrganizationNotes, organizationFromFile } from './orgIndex';
import { isUnderTemplatesPath } from './projectIndex';
import { directProjectNotes, projectNoteFromFile } from './projectResolve';
import { CONTEXT_MENU_SECTION, placeMenuSections, PRIMARY_MENU_SECTION } from './menuSections';
import { ORG_RESOURCES } from './orgResources';
import { SUBORDINATES } from './subordinates';

function addNewTaskItem(menu: Menu, onClick: () => void): void {
	menu.addItem((item) =>
		item
			.setSection(CONTEXT_MENU_SECTION)
			.setTitle('New Task')
			.setIcon('lucide-square-check')
			.onClick(onClick),
	);
}

function addNewTodoItem(menu: Menu, onClick: () => void): void {
	menu.addItem((item) =>
		item
			.setSection(CONTEXT_MENU_SECTION)
			.setTitle('New To-Do')
			.setIcon('lucide-list-todo')
			.onClick(onClick),
	);
}

function addNewOrganizationItem(menu: Menu, onClick: () => void): void {
	menu.addItem((item) =>
		item
			.setSection(PRIMARY_MENU_SECTION)
			.setTitle('New Organization')
			.setIcon('lucide-building-2')
			.onClick(onClick),
	);
}

function addNewProjectItem(menu: Menu, onClick: () => void): void {
	menu.addItem((item) =>
		item
			.setSection(PRIMARY_MENU_SECTION)
			.setTitle('New Project')
			.setIcon('lucide-folder-plus')
			.onClick(onClick),
	);
}

function addNewDocumentItem(menu: Menu, onClick: () => void): void {
	menu.addItem((item) =>
		item
			.setSection(PRIMARY_MENU_SECTION)
			.setTitle('New Document')
			.setIcon('lucide-file-text')
			.onClick(onClick),
	);
}

function addOrgResourceItems(
	menu: Menu,
	plugin: MuseProjectsPlugin,
	context: { owner: TFile | null; folder: TFolder | null },
): void {
	for (const kind of ORG_RESOURCES) {
		menu.addItem((item) =>
			item
				.setSection(CONTEXT_MENU_SECTION)
				.setTitle(`New ${kind.label}`)
				.setIcon(kind.icon)
				.onClick(() => {
					void runNewOrgResourceFlow(plugin, kind.id, context);
				}),
		);
	}
}

function addSubordinateItems(
	menu: Menu,
	plugin: MuseProjectsPlugin,
	context: { owner: TFile | null; folder: TFolder | null },
): void {
	for (const kind of SUBORDINATES) {
		menu.addItem((item) =>
			item
				.setSection(CONTEXT_MENU_SECTION)
				.setTitle(`New ${kind.label}`)
				.setIcon(kind.icon)
				.onClick(() => {
					void runNewSubordinateFlow(plugin, kind.id, context);
				}),
		);
	}
}

/**
 * File-tree right-click on one folder: New Organization, New Project, and New Document
 * create inside that folder. New Organization is owned by the nearest organization
 * at or above that folder. New Task appears when that folder's root holds one project note.
 * New To-Do uses the innermost organization, project, or document. Contact and Resource
 * appear when that entity is an organization or a project. The subordinate notes
 * appear when that entity is a document. The templates tree offers no to-do, document,
 * contact, resource, or subordinate.
 * Organization, Project, and Document are one section. Task, to-do, contact, resource,
 * and subordinate creates are the section under it, and that section is omitted when
 * none of them apply. Clock in, clock out, and edit time are a section above those
 * two when the note menu adds them.
 * A right-click on one note offers the creates for that note.
 */
export function registerFolderContextMenu(plugin: MuseProjectsPlugin): void {
	const addItems = (menu: Menu, files: TAbstractFile[], source: string) => {
		const described = files.map((file) => ({ isFolder: file instanceof TFolder }));
		if (isSingleExplorerFolder(source, described)) {
			const folder = files[0];
			if (folder instanceof TFolder) {
				addFolderItems(plugin, menu, folder);
			}
			return;
		}
		if (!isSingleExplorerFile(source, described)) {
			return;
		}
		const file = files[0];
		if (file instanceof TFile) {
			addNoteItems(plugin, menu, file);
		}
	};

	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file, source) => {
			addItems(menu, [file], source);
		}),
	);
	plugin.registerEvent(
		plugin.app.workspace.on('files-menu', (menu, files, source) => {
			addItems(menu, files, source);
		}),
	);
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, _editor, info) => {
			addNoteItems(plugin, menu, info.file);
		}),
	);
}

function addFolderItems(plugin: MuseProjectsPlugin, menu: Menu, folder: TFolder): void {
	placeMenuSections(menu);
	addNewOrganizationItem(menu, () => {
		void promptNewOrganization(plugin.app, {
			folder,
			openNote: true,
			templatesPath: plugin.settings.projectTemplatesPath,
			weekStart: plugin.settings.weekStart,
			durationFormat: plugin.settings.durationFormat,
			clockFormat: plugin.settings.clockFormat,
		});
	});
	const templatesPath = plugin.settings.projectTemplatesPath;
	const projects = directProjectNotes(plugin.app, folder, templatesPath);
	const organizations = directOrganizationNotes(plugin.app, folder, templatesPath);
	const kind = directoryContextKind({
		projects: projects.length,
		organizations: organizations.length,
	});
	addNewProjectItem(menu, () => {
		void runNewProjectFlow(plugin, {
			destination: folder,
			...(kind === 'organization' ? { organizationCode: organizations[0]!.code } : {}),
		});
	});
	if (!isUnderTemplatesPath(folder.path, templatesPath)) {
		const scope = entityScopeFromFolder(plugin.app, folder, templatesPath);
		addNewDocumentItem(menu, () => {
			void runNewDocumentFlow(plugin.app, templatesPath, {
				destination: folder,
				owner: scope?.file ?? null,
			});
		});
	}

	if (kind === 'project') {
		const project = projects[0]!;
		addNewTaskItem(menu, () => {
			void runNewTaskFlow(plugin, project);
		});
	}
	if (!isUnderTemplatesPath(folder.path, templatesPath)) {
		addNewTodoItem(menu, () => {
			void runNewTodoFlow(plugin, todoFlowContextFromFolder(plugin.app, folder, templatesPath));
		});
		const resource = orgResourceFlowContextFromFolder(plugin.app, folder, templatesPath);
		if (resource) addOrgResourceItems(menu, plugin, resource);
		const subordinate = subordinateFlowContextFromFolder(plugin.app, folder, templatesPath);
		if (subordinate) addSubordinateItems(menu, plugin, subordinate);
	}
}

/**
 * Right-click inside a note. A project note starts a task or a sub-project.
 * An organization note starts a child organization owned by that note, and a
 * project with that organization filled in. Both still ask for the destination.
 * A live note starts a document in its folder and a to-do. The to-do files in
 * the innermost organization, project, or document. An organization or a project
 * in scope also offers Contact and Resource. A document in scope also offers the
 * subordinate notes. The clicked managed note owns the contact, resource, or subordinate.
 */
function addNoteItems(plugin: MuseProjectsPlugin, menu: Menu, file: TFile | null): void {
	if (!(file instanceof TFile) || file.extension !== 'md') {
		return;
	}
	const templatesPath = plugin.settings.projectTemplatesPath;
	const underTemplates = isUnderTemplatesPath(file.path, templatesPath);
	const project = underTemplates ? null : projectNoteFromFile(plugin.app, file, templatesPath);
	const organization = underTemplates
		? null
		: organizationFromFile(plugin.app, file, templatesPath);
	const scope = underTemplates ? null : entityScopeFromFile(plugin.app, file, templatesPath);
	const archetype = underTemplates
		? null
		: plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[MSPRJ_ARCHETYPE];
	const inDocument = documentInScope(archetype, scope?.kind ?? null);
	const inOrgResource = orgResourceInScope(archetype, scope?.kind ?? null);
	const actions = noteCreateActions({
		underTemplates,
		isProject: project !== null,
		isOrganization: organization !== null,
		documentInScope: inDocument,
		orgResourceInScope: inOrgResource,
	});
	if (actions.length === 0) {
		return;
	}
	placeMenuSections(menu);
	if (actions.includes('new-task') && project) {
		addNewTaskItem(menu, () => {
			void runNewTaskFlow(plugin, project);
		});
	}
	if (actions.includes('new-organization') && organization) {
		addNewOrganizationItem(menu, () => {
			void promptNewOrganization(plugin.app, {
				ownerFile: organization.file,
				openNote: true,
				templatesPath,
				weekStart: plugin.settings.weekStart,
				durationFormat: plugin.settings.durationFormat,
				clockFormat: plugin.settings.clockFormat,
			});
		});
	}
	if (actions.includes('new-project') && project) {
		addNewProjectItem(menu, () => {
			void runNewProjectFlow(plugin, { ownerFile: project.file });
		});
	}
	if (actions.includes('new-project') && organization && !project) {
		addNewProjectItem(menu, () => {
			void runNewProjectFlow(plugin, { organizationCode: organization.code });
		});
	}
	if (actions.includes('new-document')) {
		addNewDocumentItem(menu, () => {
			void runNewDocumentFlow(
				plugin.app,
				templatesPath,
				documentFlowContextFromNote(plugin.app, file, templatesPath),
			);
		});
	}
	if (actions.includes('new-todo')) {
		addNewTodoItem(menu, () => {
			void runNewTodoFlow(plugin, todoFlowContextFromNote(plugin.app, file, templatesPath));
		});
	}
	if (actions.includes('new-org-resource')) {
		const resource = orgResourceFlowContextFromNote(plugin.app, file, templatesPath);
		if (resource) addOrgResourceItems(menu, plugin, resource);
	}
	if (actions.includes('new-subordinate')) {
		const subordinate = subordinateFlowContextFromNote(plugin.app, file, templatesPath);
		if (subordinate) addSubordinateItems(menu, plugin, subordinate);
	}
}
