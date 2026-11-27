import { Plugin, TFile } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_TDO_COMPLETED,
	MSPRJ_TDO_STATUS,
	MSPRJ_TSK_COMPLETED,
	MSPRJ_TSK_STATUS,
	isTaskArchetype,
	isTodoArchetype,
} from './constants';
import { todayLocalISODate } from './dates';
import { isUnderTemplatesPath } from './projectIndex';
import {
	applyTaskListWrite,
	completedDateNeedsWrite,
	completionValueAfterStatusChange,
	statusText,
	taskListWrites,
} from './taskListFields';

/**
 * Stamp completion dates when a task or to-do changes status.
 * Derived owner fields are written at create and by Repair references.
 * The baseline status of every task and to-do is recorded once the metadata cache is ready.
 * A later change is a transition. The first sight of a note created after that
 * records its status and does not invent a completion date.
 */
export function startTaskListSync(plugin: Plugin, templatesPath: () => string): void {
	const statusByPath = new Map<string, string>();
	const pending = new Set<string>();
	const tail = new Map<string, Promise<void>>();
	let ready = false;

	const forget = (path: string) => {
		statusByPath.delete(path);
		pending.delete(path);
	};

	plugin.registerEvent(
		plugin.app.metadataCache.on('changed', (file) => {
			if (!(file instanceof TFile)) return;
			if (!ready) {
				pending.add(file.path);
				return;
			}
			onFile(file);
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			const status = statusByPath.get(oldPath);
			if (status !== undefined) {
				statusByPath.set(file.path, status);
				statusByPath.delete(oldPath);
			}
			if (pending.delete(oldPath)) pending.add(file.path);
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on('delete', (file) => {
			forget(file.path);
		}),
	);

	plugin.app.workspace.onLayoutReady(() => {
		let started = false;
		let listening = true;
		const stop = () => {
			if (!listening) return;
			listening = false;
			plugin.app.metadataCache.offref(ref);
		};
		const run = () => {
			if (started) return;
			started = true;
			stop();
			snapshot();
			ready = true;
			const queued = [...pending];
			pending.clear();
			for (const path of queued) {
				const file = plugin.app.vault.getFileByPath(path);
				if (file instanceof TFile) onFile(file);
			}
			for (const file of plugin.app.vault.getMarkdownFiles()) {
				if (isTaskFile(file)) poke(file);
			}
		};
		const ref = plugin.app.metadataCache.on('resolved', run);
		plugin.register(stop);
		if (plugin.app.vault.getMarkdownFiles().every((file) => plugin.app.metadataCache.getFileCache(file))) {
			run();
		}
	});

	function snapshot(): void {
		for (const file of plugin.app.vault.getMarkdownFiles()) {
			if (isTaskFile(file)) {
				const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
				statusByPath.set(file.path, statusText(fm?.[MSPRJ_TSK_STATUS]));
			} else if (isTodoFile(file)) {
				const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
				statusByPath.set(file.path, statusText(fm?.[MSPRJ_TDO_STATUS]));
			}
		}
	}

	function onFile(file: TFile): void {
		if (isUnderTemplatesPath(file.path, templatesPath())) return;
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (isTaskArchetype(fm?.[MSPRJ_ARCHETYPE]) || isTodoArchetype(fm?.[MSPRJ_ARCHETYPE])) {
			poke(file);
		}
	}

	function isTaskFile(file: TFile): boolean {
		if (file.extension !== 'md') return false;
		if (isUnderTemplatesPath(file.path, templatesPath())) return false;
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		return isTaskArchetype(fm?.[MSPRJ_ARCHETYPE]);
	}

	function isTodoFile(file: TFile): boolean {
		if (file.extension !== 'md') return false;
		if (isUnderTemplatesPath(file.path, templatesPath())) return false;
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		return isTodoArchetype(fm?.[MSPRJ_ARCHETYPE]);
	}

	function poke(file: TFile): void {
		const previous = tail.get(file.path) ?? Promise.resolve();
		const next = previous.then(
			() => reconcile(file),
			() => reconcile(file),
		);
		tail.set(file.path, next);
		void next.finally(() => {
			if (tail.get(file.path) === next) tail.delete(file.path);
		});
	}

	async function reconcile(file: TFile): Promise<void> {
		if (isTodoFile(file)) {
			await reconcileTodo(file);
			return;
		}
		if (!isTaskFile(file)) return;
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) return;
		const cacheStatus = statusText(fm[MSPRJ_TSK_STATUS]);
		const preview = taskListWrites({
			known: statusByPath.has(file.path),
			previous: statusByPath.get(file.path),
			liveStatus: cacheStatus,
			completed: fm[MSPRJ_TSK_COMPLETED],
			today: todayLocalISODate(),
		});
		if (!preview) {
			statusByPath.set(file.path, cacheStatus);
			return;
		}
		let appliedStatus: string | null = null;
		try {
			await plugin.app.fileManager.processFrontMatter(file, (live) => {
				if (!isTaskArchetype(live[MSPRJ_ARCHETYPE])) return;
				const liveStatus = statusText(live[MSPRJ_TSK_STATUS]);
				const write = taskListWrites({
					known: statusByPath.has(file.path),
					previous: statusByPath.get(file.path),
					liveStatus,
					completed: live[MSPRJ_TSK_COMPLETED],
					today: todayLocalISODate(),
				});
				appliedStatus = liveStatus;
				if (write) applyTaskListWrite(live, write);
			});
			if (appliedStatus !== null) statusByPath.set(file.path, appliedStatus);
		} catch (err) {
			console.error('Muse Projects: task list sync failed', file.path, err);
		}
	}

	async function reconcileTodo(file: TFile): Promise<void> {
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) return;
		const cacheStatus = statusText(fm[MSPRJ_TDO_STATUS]);
		const desired = completionWrite(
			file.path,
			cacheStatus,
			fm[MSPRJ_TDO_COMPLETED],
		);
		if (desired === undefined) {
			statusByPath.set(file.path, cacheStatus);
			return;
		}
		let appliedStatus: string | null = null;
		try {
			await plugin.app.fileManager.processFrontMatter(file, (live) => {
				if (!isTodoArchetype(live[MSPRJ_ARCHETYPE])) return;
				const liveStatus = statusText(live[MSPRJ_TDO_STATUS]);
				const write = completionWrite(file.path, liveStatus, live[MSPRJ_TDO_COMPLETED]);
				appliedStatus = liveStatus;
				if (write !== undefined) live[MSPRJ_TDO_COMPLETED] = write;
			});
			if (appliedStatus !== null) statusByPath.set(file.path, appliedStatus);
		} catch (err) {
			console.error('Muse Projects: to-do list sync failed', file.path, err);
		}
	}

	function completionWrite(
		path: string,
		liveStatus: string,
		completed: unknown,
	): string | null | undefined {
		if (!statusByPath.has(path) || statusByPath.get(path) === liveStatus) return undefined;
		const desired = completionValueAfterStatusChange(
			statusByPath.get(path),
			liveStatus,
			todayLocalISODate(),
		);
		if (desired === undefined || !completedDateNeedsWrite(completed, desired)) return undefined;
		return desired;
	}
}
