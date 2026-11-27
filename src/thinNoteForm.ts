import { App, Modal, Notice, Setting, TFile, TFolder } from 'obsidian';
import type { ThinNoteArchetypeId } from './constants';
import { displayFolderPath } from './explorerFolder';
import { formActions, formTitle, mountForm } from './formModal';
import { folderByPath, folderDisplayPath, FolderPathSuggest, folderStoragePath } from './folderSuggest';
import {
	listNoteTemplateFiles,
	selectableTemplateStems,
	type TemplateSelection,
} from './noteTemplates';

export interface ThinNoteDraft {
	title: string;
	folder: TFolder;
	noteTemplate: TemplateSelection;
}

/**
 * Title, folder, and optional named template for a contact, resource, or subordinate note.
 * The folder starts at the note or folder the command started from.
 */
export function promptThinNote(
	app: App,
	templatesPath: string,
	kind: { id: ThinNoteArchetypeId; label: string },
	seed: { owner: TFile | null; folder: TFolder | null },
	onSubmit: (fields: ThinNoteDraft) => void,
): void {
	new ThinNoteFieldsModal(app, templatesPath, kind, seed.owner, seed.folder, onSubmit).open();
}

class ThinNoteFieldsModal extends Modal {
	private title = '';
	private folderPath: string | null;
	private templateStem = '';
	private readonly templateChoices: string[];

	constructor(
		app: App,
		private readonly templatesPath: string,
		private readonly kind: { id: ThinNoteArchetypeId; label: string },
		private readonly owner: TFile | null,
		folder: TFolder | null,
		private readonly onSubmit: (fields: ThinNoteDraft) => void,
	) {
		super(app);
		this.folderPath = folder ? folderStoragePath(folder) : null;
		this.templateChoices = selectableTemplateStems(
			listNoteTemplateFiles(app, templatesPath, kind.id),
		);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		const label = this.kind.label.toLowerCase();
		this.setTitle(this.owner ? `New ${label} (${this.owner.basename})` : `New ${label}`);
		const { body, footer } = mountForm(this);

		formTitle(body, 'Title', (value) => {
			this.title = value;
		});

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
			new Notice(`${this.kind.label} title is required.`);
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
		this.onSubmit({ title, folder, noteTemplate });
	}
}
