import { VAULT_DEFAULT_TEMPLATE_STEM, normalizeTemplateStem } from './templateTokens';

/** Organization, project, and document layouts. Each layout root holds that archetype's note template. */
export type SkeletonOwner = 'organization' | 'project' | 'document';

/** Note template at the layout root. Create renames it to the chosen file name. */
export const SKELETON_TEMPLATE_NOTE: Record<SkeletonOwner, string> = {
	organization: '_org.md',
	project: '_prj.md',
	document: '_doc.md',
};

export function skeletonTemplateNoteName(owner: SkeletonOwner): string {
	return SKELETON_TEMPLATE_NOTE[owner];
}

/**
 * Managed-note paths that are not the layout's template note.
 * Paths are relative to the layout root. The template note is `_org.md`, `_prj.md`, or `_doc.md` at that root.
 */
export function straySkeletonManagedNotes(
	owner: SkeletonOwner,
	managedRelativePaths: readonly string[],
): string[] {
	const allowed = skeletonTemplateNoteName(owner);
	return managedRelativePaths.filter((path) => path !== allowed);
}

/**
 * How create chooses a skeleton.
 * `inherit` uses a stored folder name. `vault-default` is the folder `default`.
 * `named` is any other folder.
 */
export type SkeletonSelection =
	| { kind: 'inherit'; inheritedStem: string | null }
	| { kind: 'vault-default' }
	| { kind: 'named'; stem: string };

export class SkeletonChoiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SkeletonChoiceError';
	}
}

/**
 * Folder names a create form can offer.
 * `default` is the vault-default option, not a second row.
 * Order is the caller's.
 */
export function selectableSkeletonNames(names: readonly string[]): string[] {
	return names.filter((name) => name !== VAULT_DEFAULT_TEMPLATE_STEM);
}

/**
 * Folder to copy, or null for the empty layout.
 * The empty layout is the built-in skeleton: no `default` folder, and the choice is the vault default.
 * A named folder, including a stored `default`, must exist.
 */
export function planSkeletonCopy(
	owner: SkeletonOwner,
	selection: SkeletonSelection,
	folderNames: readonly string[],
): string | null {
	if (selection.kind === 'vault-default') {
		return folderNames.includes(VAULT_DEFAULT_TEMPLATE_STEM)
			? VAULT_DEFAULT_TEMPLATE_STEM
			: null;
	}

	const stem =
		selection.kind === 'named'
			? normalizeTemplateStem(selection.stem)
			: normalizeTemplateStem(selection.inheritedStem);
	if (!stem) {
		if (selection.kind === 'named') {
			throw new SkeletonChoiceError('Skeleton name is empty.');
		}
		return folderNames.includes(VAULT_DEFAULT_TEMPLATE_STEM)
			? VAULT_DEFAULT_TEMPLATE_STEM
			: null;
	}
	if (!folderNames.includes(stem)) {
		throw new SkeletonChoiceError(`Skeleton "${owner}/${stem}" was not found.`);
	}
	return stem;
}
