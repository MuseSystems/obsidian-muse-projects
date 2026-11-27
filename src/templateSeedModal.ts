import { Modal, Notice, Setting, type App } from 'obsidian';
import { FolderPathSuggest, folderStoragePath } from './folderSuggest';
import { normalizeVaultRelativePath } from './templateSeedPlan';

/** Folder to install into, or null when the operator skips install. */
export function promptTemplateInstallFolder(app: App): Promise<string | null> {
	return new Promise((resolve) => {
		new TemplateInstallModal(app, resolve).open();
	});
}

class TemplateInstallModal extends Modal {
	private settled = false;
	private folder = '_project-templates';

	constructor(
		app: App,
		private readonly resolve: (folder: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Install starting templates');
		this.contentEl.createEl('p', {
			text: 'Choose a folder for a starting set of templates. Files already in that folder stay. Not now keeps the built-in notes. You can install templates later from settings.',
		});

		new Setting(this.contentEl).setName('Folder').addText((text) => {
			text.setPlaceholder('_project-templates').setValue(this.folder);
			text.onChange((value) => {
				this.folder = value;
			});
			new FolderPathSuggest(this.app, text.inputEl, (chosen) => {
				this.folder = folderStoragePath(chosen);
				text.setValue(this.folder);
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Not now').onClick(() => this.finish(null)))
			.addButton((button) => button.setButtonText('Install').setCta().onClick(() => this.install()));
	}

	onClose(): void {
		if (!this.settled) {
			this.settled = true;
			this.resolve(null);
		}
	}

	private install(): void {
		const root = normalizeVaultRelativePath(this.folder);
		if (!root) {
			new Notice('Choose a folder inside the vault.');
			return;
		}
		this.finish(root);
	}

	private finish(result: string | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(result);
		this.close();
	}
}
