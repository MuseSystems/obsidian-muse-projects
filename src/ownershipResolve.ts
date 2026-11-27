import { App, TFile } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ORG_CODE,
	MSPRJ_OWNER,
	MSPRJ_PRJ_CODE,
	MSPRJ_PRJ_GENERAL_ADMIN,
	MSPRJ_PRJ_NAME,
	isProjectArchetype,
} from './constants';
import {
	derivedProjectOrgCode,
	derivedTaskFacts,
	rollupProjects,
	walkOwnerChain,
	type ChainNote,
	type DerivedTaskFacts,
	type OwnerWalk,
} from './ownership';
import { frontmatterLinkPath } from './wikilinks';

export function chainFromFile(app: App, file: TFile): OwnerWalk {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return walkOwnerChain(file.path, fm?.[MSPRJ_OWNER], (fromPath, ownerRaw) => {
		if (typeof ownerRaw !== 'string') return null;
		const path = frontmatterLinkPath(ownerRaw);
		if (!path) return null;
		const target = app.metadataCache.getFirstLinkpathDest(path, fromPath);
		if (!(target instanceof TFile)) return null;
		return noteSnapshot(target, app.metadataCache.getFileCache(target)?.frontmatter);
	});
}

/** Organization code above this note. Null when the chain is broken or has no organization. */
export function organizationCodeAbove(app: App, file: TFile): string | null {
	const walked = chainFromFile(app, file);
	if (!walked.ok) return null;
	return derivedProjectOrgCode(walked.ancestors);
}

/**
 * Facts to copy onto a task owned by this project.
 * The project itself is the nearest project. Null when that chain has no organization.
 */
export function taskFactsForOwnerProject(app: App, projectFile: TFile): DerivedTaskFacts | null {
	const walked = chainFromFile(app, projectFile);
	if (!walked.ok) return null;
	const self = noteSnapshot(projectFile, app.metadataCache.getFileCache(projectFile)?.frontmatter);
	return derivedTaskFacts([self, ...walked.ancestors]);
}

/** Nearest project ancestor. Null when the chain is broken or has no project. */
export function nearestProjectFile(app: App, file: TFile): TFile | null {
	const walked = chainFromFile(app, file);
	if (!walked.ok) return null;
	const project = walked.ancestors.find((note) => isProjectArchetype(note.archetype));
	if (!project) return null;
	const target = app.vault.getAbstractFileByPath(project.path);
	return target instanceof TFile ? target : null;
}

/** Ancestor projects above the task's own project, nearest parent first. */
export function rollupProjectsForTask(
	app: App,
	taskFile: TFile,
): { code: string; name: string }[] {
	const walked = chainFromFile(app, taskFile);
	if (!walked.ok) return [];
	return rollupProjects(walked.ancestors);
}

export function noteSnapshot(file: TFile, fm: Record<string, unknown> | undefined): ChainNote {
	return {
		path: file.path,
		archetype: fm?.[MSPRJ_ARCHETYPE],
		owner: fm?.[MSPRJ_OWNER],
		orgCode: fm?.[MSPRJ_ORG_CODE],
		projectCode: fm?.[MSPRJ_PRJ_CODE],
		projectName: fm?.[MSPRJ_PRJ_NAME],
		generalAdmin: fm?.[MSPRJ_PRJ_GENERAL_ADMIN],
	};
}
