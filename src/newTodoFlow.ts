import { App, Modal, Notice, Setting, TFile, TFolder } from 'obsidian';
import { MSPRJ_ARCHETYPE, MSPRJ_ARCHETYPE_TODO, isManagedArchetype } from './constants';
import { CreateTodoError, createTodoNote } from './createTodo';
import { isCalendarDate, todayLocalISODate } from './dates';
import { entityScopeFromFile, entityScopeFromFolder } from './entityScope';
import { displayFolderPath } from './explorerFolder';
import { formActions, formTitle, mountForm } from './formModal';
import { folderByPath, folderDisplayPath, FolderPathSuggest, folderStoragePath } from './folderSuggest';
import type MuseProjectsPlugin from './main';
import {
	listNoteTemplateFiles,
	selectableTemplateStems,
	type TemplateSelection,
} from './noteTemplates';
import { isUnderTemplatesPath } from './projectIndex';
import { todoAggregateFolder, todoCreateSeed } from './todoContext';
import { ownerForNewTodo } from './todoNote';

export interface TodoFlowContext {
	owner: TFile | null;
	folder: TFolder | null;
}

class NewTodoFieldsModal extends Modal {
	private title = '';
	private scheduled = todayLocalISODate();
	/** Null until a folder is chosen. `""` is the vault root. */
	private folderPath: string | null;
	private templateStem = '';
	private readonly templateChoices: string[];

	constructor(
		app: App,
		private readonly templatesPath: string,
		private readonly owner: TFile | null,
		folder: TFolder | null,
		private readonly onSubmit: (fields: {
			title: string;
			scheduled: string | null;
			folder: TFolder;
			noteTemplate: TemplateSelection;
		}) => void,
	) {
		super(app);
		this.folderPath = folder ? folderStoragePath(folder) : null;
		this.templateChoices = selectableTemplateStems(
			listNoteTemplateFiles(app, templatesPath, MSPRJ_ARCHETYPE_TODO),
		);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.owner ? `New to-do (${this.owner.basename})` : 'New to-do');
		const { body, footer } = mountForm(this);

		formTitle(body, 'Title', (value) => {
			this.title = value;
		});

		new Setting(body)
			.setName('Scheduled')
			.addText((text) =>
				text
					.setPlaceholder('YYYY-MM-DD')
					.setValue(this.scheduled)
					.onChange((value) => {
						this.scheduled = value;
					}),
			);

		const folder = new Setting(body).setName('Folder');
		if (this.folderPath === null) {
			folder.setDesc('Required.');
		}
		folder.addText((text) => {
			text
				.setPlaceholder('Vault folder')
				.setValue(this.folderPath === null ? '' : displayFolderPath(this.folderPath))
				.onChange((value) => {
					const trimmed = value.trim();
					if (!trimmed) this.folderPath = null;
					else if (trimmed === '/') this.folderPath = '';
					else this.folderPath = trimmed;
				});
			new FolderPathSuggest(this.app, text.inputEl, (folder) => {
				this.folderPath = folderStoragePath(folder);
				text.setValue(folderDisplayPath(folder));
			});
		});

		if (this.templateChoices.length > 0) {
			new Setting(body).setName('Template').addDropdown((dropdown) => {
				dropdown.addOption('', 'Vault default');
				for (const stem of this.templateChoices) {
					dropdown.addOption(stem, stem);
				}
				dropdown.setValue(this.templateStem);
				dropdown.onChange((value) => {
					this.templateStem = value;
				});
			});
		}

		formActions(this, footer, () => {
			void this.submit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const title = this.title.trim();
		if (!title) {
			new Notice('To-do title is required.');
			return;
		}
		const scheduledRaw = this.scheduled.trim();
		let scheduled: string | null = scheduledRaw || null;
		if (scheduled && !isCalendarDate(scheduled)) {
			new Notice('Scheduled date must be a real YYYY-MM-DD date or empty.');
			return;
		}
		if (this.folderPath === null) {
			new Notice('Folder is required.');
			return;
		}
		const folder = folderByPath(this.app, this.folderPath);
		if (!folder) {
			new Notice('Choose a folder in the vault.');
			return;
		}
		const noteTemplate: TemplateSelection = this.templateStem
			? { kind: 'named', stem: this.templateStem }
			: { kind: 'vault-default' };
		this.close();
		this.onSubmit({ title, scheduled, folder, noteTemplate });
	}
}

function activeMarkdownFile(app: App): TFile | null {
	const file = app.workspace.getActiveFile();
	return file instanceof TFile && file.extension === 'md' ? file : null;
}

/**
 * New To-Do. A passed context wins. Otherwise the active note supplies an
 * archetype owner or, for an ordinary note, only a folder.
 */
export async function runNewTodoFlow(
	plugin: MuseProjectsPlugin,
	context?: TodoFlowContext,
): Promise<void> {
	const { app } = plugin;
	const templatesPath = plugin.settings.projectTemplatesPath.trim();
	const seed = context ?? contextFromActiveFile(app, templatesPath);
	new NewTodoFieldsModal(app, templatesPath, seed.owner, seed.folder, async (fields) => {
		try {
			const file = await createTodoNote(
				app,
				{
					title: fields.title,
					scheduled: fields.scheduled,
					owner: seed.owner,
					folder: fields.folder,
					noteTemplate: fields.noteTemplate,
					allocateNumber: async () => {
						const number = plugin.settings.nextTodoId;
						plugin.settings.nextTodoId = number + 1;
						await plugin.saveSettings();
						return number;
					},
				},
				templatesPath,
			);
			new Notice(`Created to-do ${file.basename}`);
			await app.workspace.getLeaf(false).openFile(file);
		} catch (err) {
			const message =
				err instanceof CreateTodoError
					? err.message
					: err instanceof Error
						? err.message
						: String(err);
			new Notice(message);
			console.error('Muse Projects: New To-Do failed', err);
		}
	}).open();
}

function contextFromActiveFile(app: App, templatesPath: string): TodoFlowContext {
	const file = activeMarkdownFile(app);
	if (!file || isUnderTemplatesPath(file.path, templatesPath)) {
		return { owner: null, folder: null };
	}
	return todoFlowContextFromNote(app, file, templatesPath);
}

/**
 * Context for New To-Do from a note.
 * The file lands in the to-do directory of the innermost organization, project, or document.
 * A managed note owns it. An ordinary note is owned by that entity. A to-do does not own the new note.
 */
export function todoFlowContextFromNote(
	app: App,
	file: TFile,
	templatesPath: string,
): TodoFlowContext {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? null;
	const archetype = fm?.[MSPRJ_ARCHETYPE];
	const managed = isManagedArchetype(archetype);
	const seed = todoCreateSeed({
		context: managed ? 'archetype' : 'note',
		path: file.path,
		parentPath: file.parent?.path ?? null,
	});
	const scope = entityScopeFromFile(app, file, templatesPath);
	const folderPath = todoAggregateFolder({
		contextFolder: seed.folderPath,
		entityFolder: scope ? scope.folder.path : null,
		designated: scope?.todoDir ?? null,
		designatedExists: folderByPath(app, scope?.todoDir ?? null) !== null,
	});
	return {
		owner: managed ? ownerForNewTodo(app, file) : (scope?.file ?? null),
		folder: folderByPath(app, folderPath),
	};
}

/**
 * Context for New To-Do from a folder.
 * The innermost organization, project, or document owns it and supplies the folder.
 * A folder outside those three stays unowned and files there.
 */
export function todoFlowContextFromFolder(
	app: App,
	folder: TFolder,
	templatesPath: string,
): TodoFlowContext {
	if (isUnderTemplatesPath(folder.path, templatesPath)) {
		return { owner: null, folder: null };
	}
	const scope = entityScopeFromFolder(app, folder, templatesPath);
	if (!scope) return { owner: null, folder };
	const folderPath = todoAggregateFolder({
		contextFolder: folder.path,
		entityFolder: scope.folder.path,
		designated: scope.todoDir,
		designatedExists: folderByPath(app, scope.todoDir) !== null,
	});
	return { owner: scope.file, folder: folderByPath(app, folderPath) };
}
