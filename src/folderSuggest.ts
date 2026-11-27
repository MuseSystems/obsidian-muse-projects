import { AbstractInputSuggest, App, normalizePath, TFolder } from 'obsidian';

/** Folder at a vault path. `""` and `"/"` are the vault root. Null when the path is not a folder. */
export function folderByPath(app: App, path: string | null): TFolder | null {
	if (path === null) return null;
	if (path === '' || path === '/') return app.vault.getRoot();
	const folder = app.vault.getAbstractFileByPath(normalizePath(path));
	return folder instanceof TFolder ? folder : null;
}

export function folderDisplayPath(folder: TFolder): string {
	return folder.path === '/' || folder.path === '' ? '/' : folder.path;
}

/** Vault-relative path for settings storage (`""` for vault root). */
export function folderStoragePath(folder: TFolder): string {
	return folder.path === '/' || folder.path === '' ? '' : folder.path;
}

export class FolderPathSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly onPick?: (folder: TFolder) => void,
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase().trim();
		const folders = this.app.vault.getAllFolders(true);
		if (!q || q === '/') {
			return folders;
		}
		return folders.filter((folder) =>
			folderDisplayPath(folder).toLowerCase().includes(q),
		);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folderDisplayPath(folder));
	}

	selectSuggestion(folder: TFolder): void {
		const path = folderStoragePath(folder);
		this.setValue(path);
		this.onPick?.(folder);
		this.close();
	}
}
