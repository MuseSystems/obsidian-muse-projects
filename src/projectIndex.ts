import { App, normalizePath, TFile } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_PRJ_CODE,
	isProjectArchetype,
} from './constants';
import { normalizeProjectCode } from './slug';

function isUnderPath(filePath: string, rootPath: string): boolean {
	const root = normalizePath(rootPath.trim());
	if (!root || root === '/' || root === '.') {
		return false;
	}
	const path = normalizePath(filePath);
	return path === root || path.startsWith(`${root}/`);
}

export function isUnderTemplatesPath(
	filePath: string,
	projectTemplatesPath: string,
): boolean {
	return isUnderPath(filePath, projectTemplatesPath);
}

/** All project notes outside the templates root (metadataCache). */
export function listProjectNotes(
	app: App,
	projectTemplatesPath: string,
): TFile[] {
	const result: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (isUnderPath(file.path, projectTemplatesPath)) {
			continue;
		}
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm && isProjectArchetype(fm[MSPRJ_ARCHETYPE])) {
			result.push(file);
		}
	}
	return result;
}

/**
 * Find an existing project note with the given msprj_prj_code (normalized).
 * Uses metadataCache only. Excludes notes under the templates root.
 */
export function findProjectByCode(
	app: App,
	code: string,
	projectTemplatesPath: string,
): TFile | null {
	const target = normalizeProjectCode(code);
	if (!target) {
		return null;
	}

	for (const file of listProjectNotes(app, projectTemplatesPath)) {
		const existing =
			app.metadataCache.getFileCache(file)?.frontmatter?.[MSPRJ_PRJ_CODE];
		if (typeof existing !== 'string') {
			continue;
		}
		if (normalizeProjectCode(existing) === target) {
			return file;
		}
	}

	return null;
}
