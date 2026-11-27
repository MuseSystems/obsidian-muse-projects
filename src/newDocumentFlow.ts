import {
	App,
	DropdownComponent,
	FuzzySuggestModal,
	Modal,
	Notice,
	Setting,
	TextComponent,
	TFile,
	TFolder,
} from 'obsidian';
import { MSPRJ_ARCHETYPE, isManagedArchetype } from './constants';
import { CreateDocumentError, createDocumentNote } from './createDocument';
import { entityScopeFromFile } from './entityScope';
import { displayFolderPath } from './explorerFolder';
import { formActions, formContext, formSection, formTitle, mountForm } from './formModal';
import { isUnderTemplatesPath } from './projectIndex';
import {
	discoverSkeletons,
	resolveSkeletonFolder,
	selectableSkeletonNames,
	type SkeletonSelection,
} from './skeletons';
import { normalizeNoteFilename, suggestDocumentBasename, suggestFolderSlug } from './slug';

export interface NewDocumentContext {
	/** Skip the destination picker. The new document folder is created inside it. */
	destination?: TFolder;
	/** Note that owns the new document. Null leaves it unowned. */
	owner?: TFile | null;
}

/**
 * Destination and owner for New Document from a note.
 * A managed note owns the new document. An ordinary note uses the entity that contains it.
 * A note under the templates tree supplies neither.
 */
export function documentFlowContextFromNote(
	app: App,
	file: TFile,
	templatesPath: string,
): NewDocumentContext {
	if (isUnderTemplatesPath(file.path, templatesPath)) return {};
	const scope = entityScopeFromFile(app, file, templatesPath);
	const archetype = app.metadataCache.getFileCache(file)?.frontmatter?.[MSPRJ_ARCHETYPE];
	return {
		destination: file.parent ?? undefined,
		owner: isManagedArchetype(archetype) ? file : (scope?.file ?? null),
	};
}

/**
 * New Document. A passed destination skips the folder picker.
 * The skeleton is chosen on the form. Vault default is `document/default`, and that folder's `_doc.md` is the note.
 */
export async function runNewDocumentFlow(
	app: App,
	templatesPath: string,
	context: NewDocumentContext = {},
): Promise<void> {
	const openFields = (folder: TFolder) => {
		new NewDocumentFieldsModal(app, folder, templatesPath, context.owner ?? null).open();
	};
	if (context.destination) {
		openFields(context.destination);
		return;
	}
	new FolderSuggestModal(app, templatesPath, openFields).open();
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly templatesPath: string,
		private readonly onPick: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder('Choose destination folder…');
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllFolders(true)
			.filter((folder) => !isUnderTemplatesPath(folder.path, this.templatesPath));
	}

	getItemText(folder: TFolder): string {
		return folder.path === '/' || folder.path === '' ? '/' : folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onPick(folder);
	}
}

class NewDocumentFieldsModal extends Modal {
	private title = '';
	private folderName = '';
	private folderSlugTouched = false;
	private settingFolderName = false;
	private folderText: TextComponent | null = null;
	private noteFileName = '';
	private noteFileNameTouched = false;
	private settingNoteFileName = false;
	private noteFileNameText: TextComponent | null = null;
	private skeletonStem = '';
	private readonly skeletonChoices: string[];

	constructor(
		app: App,
		private readonly folder: TFolder,
		private readonly templatesPath: string,
		private readonly owner: TFile | null,
	) {
		super(app);
		this.skeletonChoices = selectableSkeletonNames(
			discoverSkeletons(app, templatesPath, 'document').map((skeleton) => skeleton.name),
		);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.owner ? `New document (${this.owner.basename})` : 'New document');
		const { body, footer } = mountForm(this);
		formContext(body, displayFolderPath(this.folder.path));

		formTitle(body, 'Title', (value) => {
			this.title = value;
			this.applySuggestedFolderName();
			this.applySuggestedNoteFileName();
		});

		formSection(body, 'File');
		new Setting(body)
			.setName('Folder')
			.addText((text) => {
				this.folderText = text;
				text.setPlaceholder('e.g. product-design').onChange((value) => {
					if (this.settingFolderName) return;
					this.folderSlugTouched = true;
					this.folderName = value;
				});
			});
		new Setting(body)
			.setName('Note file')
			.addText((text) => {
				this.noteFileNameText = text;
				text.setPlaceholder('e.g. _doc-product-design.md').onChange((value) => {
					if (this.settingNoteFileName) return;
					this.noteFileNameTouched = true;
					this.noteFileName = value;
				});
			});

		if (this.skeletonChoices.length > 0) {
			formSection(body, 'Templates');
			new Setting(body).setName('Skeleton').addDropdown((dropdown: DropdownComponent) => {
				dropdown.addOption('', 'Vault default');
				for (const stem of this.skeletonChoices) {
					dropdown.addOption(stem, stem);
				}
				dropdown.setValue('');
				dropdown.onChange((value) => {
					this.skeletonStem = value;
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

	private applySuggestedFolderName(): void {
		if (this.folderSlugTouched) return;
		this.folderName = suggestFolderSlug(this.title);
		this.settingFolderName = true;
		this.folderText?.setValue(this.folderName);
		this.settingFolderName = false;
	}

	private applySuggestedNoteFileName(): void {
		if (this.noteFileNameTouched) return;
		const base = suggestDocumentBasename(this.title);
		this.noteFileName = base ? `${base}.md` : '';
		this.settingNoteFileName = true;
		this.noteFileNameText?.setValue(this.noteFileName);
		this.settingNoteFileName = false;
	}

	private async submit(): Promise<void> {
		const title = this.title.trim();
		const folderName = this.folderName.trim();
		const noteFileRaw = this.noteFileNameText?.inputEl.value ?? this.noteFileName;
		const noteFileName = normalizeNoteFilename(noteFileRaw);
		if (!title) {
			new Notice('Document title is required.');
			return;
		}
		if (!suggestFolderSlug(title)) {
			new Notice('Document title needs a letter or digit for the file name.');
			return;
		}
		if (!folderName) {
			new Notice('Document folder name is required.');
			return;
		}
		if (folderName.includes('/') || folderName.includes('\\')) {
			new Notice('Document folder name must not contain path separators.');
			return;
		}
		if (!noteFileName) {
			const raw = noteFileRaw.trim();
			new Notice(
				raw.includes('/') || raw.includes('\\')
					? 'Document note file name must not contain a path.'
					: 'Document note file name is required.',
			);
			return;
		}
		const selection: SkeletonSelection = this.skeletonStem
			? { kind: 'named', stem: this.skeletonStem }
			: { kind: 'vault-default' };
		let skeleton: TFolder | null;
		try {
			skeleton = resolveSkeletonFolder(this.app, this.templatesPath, 'document', selection);
		} catch (err) {
			new Notice(err instanceof Error ? err.message : String(err));
			return;
		}
		try {
			const file = await createDocumentNote(
				this.app,
				this.folder,
				folderName,
				{ title, filename: noteFileName, owner: this.owner },
				this.templatesPath,
				skeleton,
			);
			this.close();
			new Notice(`Created document ${title}`);
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (err) {
			const message =
				err instanceof CreateDocumentError
					? err.message
					: err instanceof Error
						? err.message
						: String(err);
			new Notice(message);
			console.error('Muse Projects: New Document failed', err);
		}
	}
}
