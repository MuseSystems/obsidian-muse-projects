import { App, Notice, normalizePath, TFile, TFolder } from 'obsidian';
import { BUNDLED_TEMPLATES } from './bundledTemplates.gen';
import type { MuseProjectsSettings } from './settings';
import { promptTemplateInstallFolder } from './templateSeedModal';
import {
	planTemplateSeed,
	templateSeedNotice,
	templateSeedRecordsEqual,
	normalizeVaultRelativePath,
	type TemplateSeedRecord,
	type TemplateSeedReport,
} from './templateSeedPlan';

export interface TemplateSeedHost {
	app: App;
	settings: MuseProjectsSettings;
	templateSeedTask: Promise<void> | null;
	saveSettings(): Promise<void>;
}

interface SeedApplyOptions {
	fillMissing: boolean;
	updateUnmodified: boolean;
	report: TemplateSeedReport;
}

class TemplateSeedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TemplateSeedError';
	}
}

function enqueueTemplateSeed(host: TemplateSeedHost, work: () => Promise<void>): Promise<void> {
	const prev = host.templateSeedTask ?? Promise.resolve();
	const task = prev.then(work, work);
	const tracked = task.then(
		() => undefined,
		() => undefined,
	);
	host.templateSeedTask = tracked;
	void tracked.then(() => {
		if (host.templateSeedTask === tracked) host.templateSeedTask = null;
	});
	return task;
}

async function guarded(work: () => Promise<void>): Promise<void> {
	try {
		await work();
	} catch (err) {
		console.error('Muse Projects: template install failed', err);
		new Notice('Could not install template files.');
	}
}

/**
 * Startup pass. An empty templates path asks once where to install.
 * A configured folder gains shipped files that have never been installed there.
 * Removed files stay removed. With the update option on, a file that still
 * matches the last copy this plugin wrote is replaced.
 */
export function offerBundledTemplates(host: TemplateSeedHost): Promise<void> {
	return enqueueTemplateSeed(host, () =>
		guarded(async () => {
			const raw = host.settings.projectTemplatesPath;
			const root = normalizeVaultRelativePath(raw);
			if (raw.trim() && !root) return;
			if (!root) {
				if (host.settings.templateInstallDeclined) return;
				await promptAndInstall(host);
				return;
			}
			await applyBundledTemplateSeed(host, {
				fillMissing: false,
				updateUnmodified: host.settings.updateInstalledTemplates,
				report: 'silent',
			});
		}),
	);
}

/** Write shipped files that are missing. Asks for a folder when the templates path is empty. */
export function installBundledTemplates(host: TemplateSeedHost): Promise<void> {
	return enqueueTemplateSeed(host, () => guarded(() => installNow(host)));
}

/** Replace seeded files that still match the copy this plugin last wrote. */
export function replaceUnmodifiedTemplates(host: TemplateSeedHost): Promise<void> {
	return enqueueTemplateSeed(host, () =>
		guarded(() =>
			applyBundledTemplateSeed(host, {
				fillMissing: false,
				updateUnmodified: true,
				report: 'update',
			}),
		),
	);
}

async function installNow(host: TemplateSeedHost): Promise<void> {
	const raw = host.settings.projectTemplatesPath;
	const root = normalizeVaultRelativePath(raw);
	if (raw.trim() && !root) {
		new Notice('Templates path has to be a folder inside the vault.');
		return;
	}
	if (!root) {
		await promptAndInstall(host);
		return;
	}
	await applyBundledTemplateSeed(host, {
		fillMissing: true,
		updateUnmodified: false,
		report: 'install',
	});
}

async function promptAndInstall(host: TemplateSeedHost): Promise<void> {
	const chosen = await promptTemplateInstallFolder(host.app);
	if (!chosen) {
		host.settings.templateInstallDeclined = true;
		await host.saveSettings();
		return;
	}
	host.settings.projectTemplatesPath = chosen;
	host.settings.templateInstallDeclined = false;
	await host.saveSettings();
	await applyBundledTemplateSeed(host, {
		fillMissing: true,
		updateUnmodified: false,
		report: 'install',
	});
}

async function applyBundledTemplateSeed(host: TemplateSeedHost, options: SeedApplyOptions): Promise<void> {
	const root = normalizeVaultRelativePath(host.settings.projectTemplatesPath);
	if (!root) {
		if (options.report === 'install') new Notice('Choose a templates folder inside the vault.');
		if (options.report === 'update') new Notice('Choose a templates folder before updating templates.');
		return;
	}

	try {
		await ensureFolder(host.app, root);
	} catch (err) {
		console.error('Muse Projects: template folder', err);
		new Notice(`Could not create the template folder ${root}.`);
		return;
	}

	const existing = new Map<string, string>();
	const unreadable = new Set<string>();
	for (const file of BUNDLED_TEMPLATES) {
		const read = await readVaultFile(host.app, `${root}/${file.path}`);
		if (read.kind === 'missing') continue;
		if (read.kind === 'unreadable') {
			unreadable.add(file.path);
			continue;
		}
		existing.set(file.path, read.content);
	}

	const previous = host.settings.templateSeeds[root];
	const plan = planTemplateSeed({
		bundled: BUNDLED_TEMPLATES,
		existing,
		unreadable,
		records: previous,
		fillMissing: options.fillMissing,
		updateUnmodified: options.updateUnmodified,
	});

	const failed = new Set<string>();
	for (const write of plan.writes) {
		try {
			await writeVaultFile(host.app, `${root}/${write.path}`, write.content);
		} catch (err) {
			console.error(`Muse Projects: template file ${write.path}`, err);
			failed.add(write.path);
		}
	}

	let files: Record<string, TemplateSeedRecord> = plan.files;
	if (failed.size > 0) {
		files = { ...plan.files };
		for (const rel of failed) {
			const prior = previous?.[rel];
			if (prior?.state === 'seeded') files[rel] = { state: 'seeded', hash: prior.hash };
			else if (prior?.state === 'preexisting') files[rel] = { state: 'preexisting' };
			else delete files[rel];
		}
	}

	if (!templateSeedRecordsEqual(previous, files)) {
		host.settings.templateSeeds = {
			...host.settings.templateSeeds,
			[root]: files,
		};
		await host.saveSettings();
	}

	const written = plan.writes.filter((write) => !failed.has(write.path));
	const reportEdits =
		options.updateUnmodified && (options.report !== 'silent' || written.length > 0);
	const notice = templateSeedNotice({
		root,
		creates: written.filter((write) => write.kind === 'create').length,
		updates: written.filter((write) => write.kind === 'update').length,
		keptEdits: reportEdits ? plan.keptEdits.length : 0,
		failed: failed.size,
		report: options.report,
	});
	if (notice) new Notice(notice);
}

async function ensureFolder(app: App, vaultPath: string): Promise<void> {
	const parts = normalizePath(vaultPath).split('/').filter((part) => part.length > 0);
	let acc = '';
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		const stat = await app.vault.adapter.stat(acc);
		if (stat?.type === 'folder') continue;
		if (stat) throw new TemplateSeedError(`${acc} is a file.`);
		const current = app.vault.getAbstractFileByPath(acc);
		if (current instanceof TFolder) continue;
		if (current) throw new TemplateSeedError(`${acc} is a file.`);
		try {
			await app.vault.createFolder(acc);
		} catch (err) {
			const again = await app.vault.adapter.stat(acc);
			if (again?.type === 'folder') continue;
			throw err;
		}
	}
}

type VaultRead = { kind: 'missing' } | { kind: 'unreadable' } | { kind: 'file'; content: string };

/** Disk stat, so a dotfile the vault list hides still counts as present. */
async function readVaultFile(app: App, vaultPath: string): Promise<VaultRead> {
	const path = normalizePath(vaultPath);
	try {
		const stat = await app.vault.adapter.stat(path);
		if (!stat) return { kind: 'missing' };
		if (stat.type !== 'file') return { kind: 'unreadable' };
		const current = app.vault.getAbstractFileByPath(path);
		if (current instanceof TFile) return { kind: 'file', content: await app.vault.read(current) };
		return { kind: 'file', content: await app.vault.adapter.read(path) };
	} catch (err) {
		console.error(`Muse Projects: read template ${vaultPath}`, err);
		return { kind: 'unreadable' };
	}
}

async function writeVaultFile(app: App, vaultPath: string, content: string): Promise<void> {
	const path = normalizePath(vaultPath);
	const slash = path.lastIndexOf('/');
	if (slash > 0) await ensureFolder(app, path.slice(0, slash));
	const stat = await app.vault.adapter.stat(path);
	if (stat?.type === 'folder') throw new TemplateSeedError(`${path} is a folder.`);
	const current = app.vault.getAbstractFileByPath(path);
	if (current instanceof TFile) {
		await app.vault.modify(current, content);
		return;
	}
	if (current instanceof TFolder) throw new TemplateSeedError(`${path} is a folder.`);
	if (stat?.type === 'file') {
		await app.vault.adapter.write(path, content);
		return;
	}
	if (current) throw new TemplateSeedError(`${path} is not a file.`);
	await app.vault.create(path, content);
}
