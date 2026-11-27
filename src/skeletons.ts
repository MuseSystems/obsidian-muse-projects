import {
	App,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	TFile,
	TFolder,
} from 'obsidian';
import { MSPRJ_ARCHETYPE, isManagedArchetype } from './constants';
import {
	planSkeletonCopy,
	skeletonTemplateNoteName,
	straySkeletonManagedNotes,
	type SkeletonOwner,
	type SkeletonSelection,
	SkeletonChoiceError,
} from './skeletonPlan';

export type { SkeletonOwner, SkeletonSelection };
export { selectableSkeletonNames, SkeletonChoiceError } from './skeletonPlan';

export interface SkeletonFolder {
	/** Folder name; also the display name. */
	name: string;
	folder: TFolder;
}

export class SkeletonPlaceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SkeletonPlaceError';
	}
}

export interface PlacedSkeleton {
	folder: TFolder;
	/**
	 * The layout's note, already renamed to the chosen file name.
	 * Null when the layout was empty. The caller writes the built-in note.
	 */
	note: TFile | null;
}

/** Path of a new folder inside `parentPath`. Vault root is `''` or `/`. */
export function skeletonDestinationPath(parentPath: string, folderName: string): string {
	const parent = parentPath === '/' || parentPath === '' ? '' : parentPath;
	return normalizePath(parent ? `${parent}/${folderName}` : folderName);
}

/** `<templates path>/<owner>`, or empty when the templates path is empty. */
export function skeletonsRoot(templatesPath: string, owner: SkeletonOwner): string {
	const root = normalizePath(templatesPath.trim());
	if (!root) {
		return '';
	}
	return normalizePath(`${root}/${owner}`);
}

/**
 * Immediate child folders of `<templates path>/<owner>`.
 * Includes `default`. Returns [] when the path is empty, missing, or not a folder.
 * Files in that folder are ignored.
 */
export function discoverSkeletons(
	app: App,
	templatesPath: string,
	owner: SkeletonOwner,
): SkeletonFolder[] {
	const path = skeletonsRoot(templatesPath, owner);
	if (!path) {
		return [];
	}
	const abstract = app.vault.getAbstractFileByPath(path);
	if (!(abstract instanceof TFolder)) {
		return [];
	}
	const folders: SkeletonFolder[] = [];
	for (const child of abstract.children) {
		if (child instanceof TFolder) {
			folders.push({ name: child.name, folder: child });
		}
	}
	folders.sort((a, b) => a.name.localeCompare(b.name) || a.folder.path.localeCompare(b.folder.path));
	return folders;
}

/**
 * The folder create should copy, or null for an empty layout.
 * Throws when a named or stored skeleton is missing.
 */
export function resolveSkeletonFolder(
	app: App,
	templatesPath: string,
	owner: SkeletonOwner,
	selection: SkeletonSelection,
): TFolder | null {
	const folders = discoverSkeletons(app, templatesPath, owner);
	const name = planSkeletonCopy(
		owner,
		selection,
		folders.map((folder) => folder.name),
	);
	if (!name) {
		return null;
	}
	const found = folders.find((folder) => folder.name === name);
	if (!found) {
		throw new SkeletonChoiceError(`Skeleton "${owner}/${name}" was not found.`);
	}
	return found.folder;
}

/**
 * Copy `templateFolder` to `destPath`, or create an empty folder when there is no layout.
 * A layout must contain `_org.md`, `_prj.md`, or `_doc.md` at its root. That file is renamed to `noteFileName`.
 * Refuses a destination that already exists, a name clash with another file, a template note of the
 * wrong archetype, and any other managed note in the layout.
 */
export async function placeSkeletonFolder(
	app: App,
	templateFolder: TFolder | null,
	destPath: string,
	noteFileName: string,
	owner: SkeletonOwner,
): Promise<PlacedSkeleton> {
	if (app.vault.getAbstractFileByPath(destPath)) {
		throw new SkeletonPlaceError(`Destination already exists: ${destPath}`);
	}
	if (!templateFolder) {
		const folder = await app.vault.createFolder(destPath);
		return { folder, note: null };
	}
	await assertSkeletonTemplate(app, templateFolder, owner, noteFileName);
	const copied = await app.vault.copy(templateFolder, destPath);
	if (!(copied instanceof TFolder)) {
		throw new SkeletonPlaceError(`Expected a folder after copy at ${destPath}`);
	}
	try {
		const note = await adoptCopiedNote(app, copied, owner, noteFileName);
		return { folder: copied, note };
	} catch (err) {
		const removed = await removePlacedSkeleton(app, copied);
		if (!removed) {
			const message = err instanceof Error ? err.message : String(err);
			throw new SkeletonPlaceError(`${message} The new folder was left at ${copied.path}.`);
		}
		throw err;
	}
}

async function assertSkeletonTemplate(
	app: App,
	templateFolder: TFolder,
	owner: SkeletonOwner,
	noteFileName: string,
): Promise<void> {
	const templateName = skeletonTemplateNoteName(owner);
	const label = `${owner}/${templateFolder.name}`;
	const template = templateFolder.children.find(
		(child) => child instanceof TFile && child.name === templateName,
	);
	if (!(template instanceof TFile)) {
		throw new SkeletonPlaceError(
			`Skeleton "${label}" has no ${templateName}. That file is the note template.`,
		);
	}
	const clash = templateFolder.children.find(
		(child) => child.name === noteFileName && child.name !== templateName,
	);
	if (clash) {
		throw new SkeletonPlaceError(
			`Skeleton "${label}" already contains "${noteFileName}". Choose a different note file name.`,
		);
	}
	const archetype = await readArchetype(app, template);
	if (archetype.kind === 'invalid') {
		throw new SkeletonPlaceError(
			`Skeleton "${label}" note ${templateName} frontmatter did not parse: ${archetype.message}`,
		);
	}
	if (archetype.kind === 'value' && archetype.value !== owner) {
		throw new SkeletonPlaceError(
			`Skeleton "${label}" note ${templateName} has ${MSPRJ_ARCHETYPE} ${String(archetype.value)}. It must be ${owner}.`,
		);
	}
	const managed = await findManagedArchetypeNotes(app, templateFolder);
	const templatePath = normalizePath(template.path);
	const stray = straySkeletonManagedNotes(
		owner,
		managed
			.filter((path) => normalizePath(path) !== templatePath)
			.map((path) => relativeToFolder(templateFolder.path, path)),
	);
	if (stray.length > 0) {
		throw new SkeletonPlaceError(
			`Skeleton "${label}" contains a managed note besides ${templateName} (${stray.join(', ')}).`,
		);
	}
}

async function adoptCopiedNote(
	app: App,
	folder: TFolder,
	owner: SkeletonOwner,
	noteFileName: string,
): Promise<TFile> {
	const templateName = skeletonTemplateNoteName(owner);
	const fromPath = normalizePath(`${folder.path}/${templateName}`);
	const toPath = normalizePath(`${folder.path}/${noteFileName}`);
	const current = app.vault.getAbstractFileByPath(fromPath);
	if (!(current instanceof TFile)) {
		throw new SkeletonPlaceError(`Skeleton copy at ${folder.path} is missing ${templateName}.`);
	}
	if (fromPath !== toPath) {
		await app.vault.rename(current, toPath);
	}
	const note = app.vault.getAbstractFileByPath(toPath);
	if (!(note instanceof TFile)) {
		throw new SkeletonPlaceError(`Expected the note at ${toPath}.`);
	}
	return note;
}

type ArchetypeRead =
	| { kind: 'absent' }
	| { kind: 'value'; value: unknown }
	| { kind: 'invalid'; message: string };

async function readArchetype(app: App, file: TFile): Promise<ArchetypeRead> {
	const content = await app.vault.read(file);
	const info = getFrontMatterInfo(content);
	if (!info.exists) {
		return { kind: 'absent' };
	}
	let parsed: unknown;
	try {
		parsed = parseYaml(info.frontmatter);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { kind: 'invalid', message };
	}
	if (parsed === null || parsed === undefined) {
		return { kind: 'absent' };
	}
	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { kind: 'invalid', message: 'Note template frontmatter must be a map.' };
	}
	const value = (parsed as Record<string, unknown>)[MSPRJ_ARCHETYPE];
	if (value === undefined || value === null || value === '') {
		return { kind: 'absent' };
	}
	return { kind: 'value', value };
}

function relativeToFolder(folderPath: string, filePath: string): string {
	const root = normalizePath(folderPath);
	const path = normalizePath(filePath);
	const prefix = `${root}/`;
	return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Create `vaultPath` and any missing parent. An existing folder is kept.
 * A file at that path is an error.
 */
export async function ensureVaultFolder(app: App, vaultPath: string): Promise<void> {
	const parts = normalizePath(vaultPath).split('/').filter((part) => part.length > 0);
	let acc = '';
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		const path = normalizePath(acc);
		const current = app.vault.getAbstractFileByPath(path);
		if (current instanceof TFolder) continue;
		if (current) {
			throw new SkeletonPlaceError(`To-do directory is a file: ${path}`);
		}
		await app.vault.createFolder(path);
	}
}

/** Delete a folder created for a new organization or project. False when the delete fails. */
export async function removePlacedSkeleton(app: App, folder: TFolder): Promise<boolean> {
	try {
		await app.vault.delete(folder, true);
		return true;
	} catch (err) {
		console.error('Muse Projects: skeleton rollback failed', err);
		return false;
	}
}

async function findManagedArchetypeNotes(app: App, folder: TFolder): Promise<string[]> {
	const found: string[] = [];
	const walk = async (current: TFolder): Promise<void> => {
		for (const child of current.children) {
			if (child instanceof TFolder) {
				await walk(child);
				continue;
			}
			if (!(child instanceof TFile) || child.extension !== 'md') {
				continue;
			}
			const content = await app.vault.read(child);
			const info = getFrontMatterInfo(content);
			if (!info.exists) {
				continue;
			}
			let parsed: unknown;
			try {
				parsed = parseYaml(info.frontmatter);
			} catch {
				continue;
			}
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				continue;
			}
			if (isManagedArchetype((parsed as Record<string, unknown>)[MSPRJ_ARCHETYPE])) {
				found.push(child.path);
			}
		}
	};
	await walk(folder);
	return found;
}
