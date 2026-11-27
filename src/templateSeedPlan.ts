import { sha256Hex } from './sha256';

export interface BundledTemplateFile {
	/** Path relative to the templates root. Forward slashes, no leading slash. */
	path: string;
	content: string;
}

/** `seeded` is a file this plugin wrote. `preexisting` was already in the folder. */
export type TemplateSeedRecord = { state: 'seeded'; hash: string } | { state: 'preexisting' };

export interface PlannedTemplateWrite {
	path: string;
	content: string;
	kind: 'create' | 'update';
}

export interface TemplateSeedPlan {
	writes: PlannedTemplateWrite[];
	/** Seeded files whose contents differ from the hash stored when this plugin wrote them. */
	keptEdits: string[];
	files: Record<string, TemplateSeedRecord>;
}

export interface StoredTemplateSeed {
	updateInstalledTemplates: boolean;
	templateInstallDeclined: boolean;
	/** Records keyed by templates root, then by path relative to that root. */
	templateSeeds: Record<string, Record<string, TemplateSeedRecord>>;
}

/** `silent` notices only when files change or a write fails. */
export type TemplateSeedReport = 'silent' | 'install' | 'update';

const HASH = /^[a-f0-9]{64}$/;

/**
 * Vault-relative path with no `.` or `..` segments.
 * Null for empty, the vault root, or a path that can leave the vault.
 */
export function normalizeVaultRelativePath(value: string): string | null {
	let path = value.trim().replace(/\\/g, '/');
	path = path.replace(/^\/+|\/+$/g, '');
	path = path.replace(/\/{2,}/g, '/');
	if (!path || path.includes(':')) return null;
	const parts = path.split('/');
	if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
	return path;
}

function parseSeedRecord(value: unknown): TemplateSeedRecord | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.state === 'preexisting') return { state: 'preexisting' };
	if (record.state === 'seeded' && typeof record.hash === 'string' && HASH.test(record.hash)) {
		return { state: 'seeded', hash: record.hash };
	}
	return null;
}

function orderedRecords(
	records: Readonly<Record<string, TemplateSeedRecord>> | undefined,
): Record<string, TemplateSeedRecord> {
	const out: Record<string, TemplateSeedRecord> = {};
	for (const key of Object.keys(records ?? {}).sort()) {
		const record = records?.[key];
		if (!record) continue;
		out[key] = record.state === 'seeded' ? { state: 'seeded', hash: record.hash } : { state: 'preexisting' };
	}
	return out;
}

export function templateSeedRecordsEqual(
	a: Readonly<Record<string, TemplateSeedRecord>> | undefined,
	b: Readonly<Record<string, TemplateSeedRecord>>,
): boolean {
	return JSON.stringify(orderedRecords(a)) === JSON.stringify(orderedRecords(b));
}

function normalizeTemplateSeeds(value: unknown): Record<string, Record<string, TemplateSeedRecord>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const roots: Record<string, Record<string, TemplateSeedRecord>> = {};
	for (const [root, files] of Object.entries(value as Record<string, unknown>)) {
		const normalizedRoot = normalizeVaultRelativePath(root);
		if (!normalizedRoot || !files || typeof files !== 'object' || Array.isArray(files)) continue;
		const parsed: Record<string, TemplateSeedRecord> = {};
		for (const [rel, record] of Object.entries(files as Record<string, unknown>)) {
			const path = normalizeVaultRelativePath(rel);
			const seed = parseSeedRecord(record);
			if (!path || !seed) continue;
			parsed[path] = seed;
		}
		roots[normalizedRoot] = orderedRecords(parsed);
	}
	return roots;
}

/** Fill seed fields missing from plugin data. Drops records that are not a seeded hash or preexisting. */
export function normalizeStoredTemplateSeed(stored: unknown): StoredTemplateSeed {
	const record =
		stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
	return {
		updateInstalledTemplates: record.updateInstalledTemplates === true,
		templateInstallDeclined: record.templateInstallDeclined === true,
		templateSeeds: normalizeTemplateSeeds(record.templateSeeds),
	};
}

function bundledRelativePath(path: string): string {
	const rel = normalizeVaultRelativePath(path);
	if (rel !== path) {
		throw new Error(`Bundled template path is not normalized: ${path}`);
	}
	return rel;
}

/**
 * Decide which bundled files to write.
 * A missing file with no record is new to this folder and is created.
 * A missing file with a record was removed and stays removed unless `fillMissing`.
 * A file already in the folder is left alone. Matching the shipped copy records it as seeded,
 * so a later update can replace it while it still matches. Any other existing file is preexisting.
 * `updateUnmodified` replaces a seeded file whose contents still match the stored hash.
 */
export function planTemplateSeed(args: {
	bundled: readonly BundledTemplateFile[];
	existing: ReadonlyMap<string, string>;
	unreadable: ReadonlySet<string>;
	records: Readonly<Record<string, TemplateSeedRecord>> | undefined;
	fillMissing: boolean;
	updateUnmodified: boolean;
}): TemplateSeedPlan {
	const files = orderedRecords(args.records);
	const writes: PlannedTemplateWrite[] = [];
	const keptEdits: string[] = [];
	const bundled = [...args.bundled].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	const seen = new Set<string>();

	for (const file of bundled) {
		const rel = bundledRelativePath(file.path);
		if (seen.has(rel)) {
			throw new Error(`Duplicate bundled template: ${rel}`);
		}
		seen.add(rel);
		if (args.unreadable.has(rel)) continue;

		const current = args.existing.get(rel);
		const record = files[rel];
		if (current === undefined) {
			if (record && !args.fillMissing) continue;
			const hash = sha256Hex(file.content);
			files[rel] = { state: 'seeded', hash };
			writes.push({ path: rel, content: file.content, kind: 'create' });
			continue;
		}

		if (!record) {
			const bundledHash = sha256Hex(file.content);
			files[rel] =
				sha256Hex(current) === bundledHash
					? { state: 'seeded', hash: bundledHash }
					: { state: 'preexisting' };
			continue;
		}
		if (record.state === 'preexisting') continue;

		const currentHash = sha256Hex(current);
		if (currentHash !== record.hash) {
			keptEdits.push(rel);
			continue;
		}
		const bundledHash = sha256Hex(file.content);
		if (!args.updateUnmodified || currentHash === bundledHash) continue;
		files[rel] = { state: 'seeded', hash: bundledHash };
		writes.push({ path: rel, content: file.content, kind: 'update' });
	}

	keptEdits.sort();
	writes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { writes, keptEdits, files: orderedRecords(files) };
}

function filesWord(count: number): string {
	return count === 1 ? 'file' : 'files';
}

export function templateSeedNotice(args: {
	root: string;
	creates: number;
	updates: number;
	keptEdits: number;
	failed: number;
	report: TemplateSeedReport;
}): string | null {
	const { root, creates, updates, keptEdits, failed, report } = args;
	if (creates === 0 && updates === 0 && keptEdits === 0 && failed === 0) {
		if (report === 'install') return `No template files were written into ${root}.`;
		if (report === 'update') return `No template files were replaced in ${root}.`;
		return null;
	}
	const parts: string[] = [];
	if (creates > 0) {
		parts.push(`Installed ${creates} template ${filesWord(creates)} in ${root}.`);
	}
	if (updates > 0) {
		parts.push(`Updated ${updates} template ${filesWord(updates)} in ${root}.`);
	}
	if (keptEdits > 0) {
		parts.push(`Left ${keptEdits} edited template ${filesWord(keptEdits)} in place.`);
	}
	if (failed > 0) {
		parts.push(`Could not write ${failed} template ${filesWord(failed)}.`);
	}
	return parts.join(' ');
}
