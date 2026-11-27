/** Obsidian passes this `source` for a right-click in the file-tree sidebar. */
export const FILE_EXPLORER_CONTEXT_MENU = 'file-explorer-context-menu';

export interface ExplorerMenuItem {
	isFolder: boolean;
}

/**
 * True when the file-tree menu is for exactly one folder.
 * A multi-selection is not one destination.
 */
export function isSingleExplorerFolder(
	source: string,
	items: readonly ExplorerMenuItem[],
): boolean {
	return isSingleExplorerItem(source, items, true);
}

/** True when the file-tree menu is for exactly one file. A multi-selection is not one note. */
export function isSingleExplorerFile(
	source: string,
	items: readonly ExplorerMenuItem[],
): boolean {
	return isSingleExplorerItem(source, items, false);
}

function isSingleExplorerItem(
	source: string,
	items: readonly ExplorerMenuItem[],
	folder: boolean,
): boolean {
	return (
		source === FILE_EXPLORER_CONTEXT_MENU &&
		items.length === 1 &&
		items[0]!.isFolder === folder
	);
}

/** Vault-root paths from Obsidian are `"/"` or `""`. */
export function displayFolderPath(path: string): string {
	return path === '/' || path === '' ? '/' : path;
}
