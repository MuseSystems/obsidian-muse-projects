import { Notice, Plugin, TFile } from 'obsidian';
import { MSPRJ_ARCHETYPE, MSPRJ_ID, isManagedArchetype } from './constants';
import { planObjectIds, type ObjectIdRow } from './objectIdPlan';
import { isUnderTemplatesPath } from './projectIndex';
import { canonicalObjectId, newObjectId } from './uuid';

/**
 * Store `msprj_id` as a lowercase UUID version 4.
 * A missing or non-UUID value is replaced. A duplicate id is left on every copy and reported,
 * so two devices do not assign different ids to different copies.
 * Notes under the templates path are skipped so a template id is not copied onto every new note.
 */
export async function ensureObjectIds(app: Plugin['app'], projectTemplatesPath: string): Promise<void> {
	const files = new Map<string, TFile>();
	const rows: ObjectIdRow[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (isUnderTemplatesPath(file.path, projectTemplatesPath)) {
			continue;
		}
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || !isManagedArchetype(fm[MSPRJ_ARCHETYPE])) {
			continue;
		}
		const id = canonicalObjectId(fm[MSPRJ_ID]);
		rows.push({
			path: file.path,
			id,
			canonical: id !== null && fm[MSPRJ_ID] === id,
		});
		files.set(file.path, file);
	}

	const plan = planObjectIds(rows);
	if (plan.duplicates.length > 0) {
		const message = duplicateMessage(plan.duplicates);
		new Notice(message);
		console.warn(`Muse Projects: ${message}`);
	}

	for (const item of plan.canonicalize) {
		const file = files.get(item.path);
		if (!file) {
			continue;
		}
		try {
			await app.fileManager.processFrontMatter(file, (fm) => {
				if (!isManagedArchetype(fm[MSPRJ_ARCHETYPE])) {
					return;
				}
				if (canonicalObjectId(fm[MSPRJ_ID]) !== item.id) {
					return;
				}
				fm[MSPRJ_ID] = item.id;
			});
		} catch (err) {
			console.error('Muse Projects: object id canonicalize failed', item.path, err);
		}
	}

	const reserved = new Set<string>();
	for (const row of rows) {
		if (row.id) {
			reserved.add(row.id);
		}
	}
	for (const path of plan.assign) {
		const file = files.get(path);
		if (!file) {
			continue;
		}
		try {
			await app.fileManager.processFrontMatter(file, (fm) => {
				if (!isManagedArchetype(fm[MSPRJ_ARCHETYPE])) {
					return;
				}
				const existing = canonicalObjectId(fm[MSPRJ_ID]);
				if (existing) {
					fm[MSPRJ_ID] = existing;
					return;
				}
				let id = newObjectId();
				while (reserved.has(id)) {
					id = newObjectId();
				}
				reserved.add(id);
				fm[MSPRJ_ID] = id;
			});
		} catch (err) {
			console.error('Muse Projects: object id assign failed', path, err);
		}
	}
}

function duplicateMessage(groups: { id: string; paths: string[] }[]): string {
	const shown = groups
		.slice(0, 3)
		.map((group) => `${group.id} (${group.paths.join(', ')})`)
		.join('; ');
	const more = groups.length > 3 ? ` (+${groups.length - 3} more)` : '';
	return `Duplicate msprj_id left unchanged: ${shown}${more}.`;
}

/** Run once the metadata cache can see frontmatter. A later `resolved` does not scan again. */
export function scheduleEnsureObjectIds(plugin: Plugin, projectTemplatesPath: () => string): void {
	plugin.app.workspace.onLayoutReady(() => {
		let done = false;
		let listening = true;
		const stop = () => {
			if (!listening) {
				return;
			}
			listening = false;
			plugin.app.metadataCache.offref(ref);
		};
		const run = () => {
			if (done) {
				return;
			}
			done = true;
			stop();
			void ensureObjectIds(plugin.app, projectTemplatesPath()).catch((err) => {
				console.error('Muse Projects: object id repair failed', err);
			});
		};
		const ref = plugin.app.metadataCache.on('resolved', run);
		plugin.register(stop);
		const files = plugin.app.vault.getMarkdownFiles();
		if (files.every((file) => plugin.app.metadataCache.getFileCache(file) !== null)) {
			run();
		}
	});
}
