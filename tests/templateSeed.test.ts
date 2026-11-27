import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUNDLED_TEMPLATES } from '../src/bundledTemplates.gen';
import { sha256Hex } from '../src/sha256';
import {
	normalizeStoredTemplateSeed,
	normalizeVaultRelativePath,
	planTemplateSeed,
	templateSeedNotice,
	templateSeedRecordsEqual,
	type BundledTemplateFile,
	type TemplateSeedRecord,
} from '../src/templateSeedPlan';

const REQUIRED_TEMPLATES = [
	'README.md',
	'contact/default.md',
	'contract-term/default.md',
	'document/default/_doc.md',
	'document/default/notes/notes.md',
	'document/default/todos/.gitkeep',
	'document/design/_doc.md',
	'document/design/features/features.md',
	'document/design/glossary/glossary.md',
	'document/design/modules/modules.md',
	'document/design/notes/notes.md',
	'document/design/todos/.gitkeep',
	'document/guide/_doc.md',
	'document/guide/chapters/chapters.md',
	'document/guide/glossary/glossary.md',
	'document/guide/notes/notes.md',
	'document/guide/todos/.gitkeep',
	'document/msa/_doc.md',
	'document/msa/notes/notes.md',
	'document/msa/schedules/schedules.md',
	'document/msa/terms/terms.md',
	'document/msa/todos/.gitkeep',
	'document/requirements/_doc.md',
	'document/requirements/glossary/glossary.md',
	'document/requirements/notes/notes.md',
	'document/requirements/questions/questions.md',
	'document/requirements/requirements/requirements.md',
	'document/requirements/todos/.gitkeep',
	'document/statement-of-work/_doc.md',
	'document/statement-of-work/notes/notes.md',
	'document/statement-of-work/terms/terms.md',
	'document/statement-of-work/todos/.gitkeep',
	'document/test-plan/_doc.md',
	'document/test-plan/cases/cases.md',
	'document/test-plan/notes/notes.md',
	'document/test-plan/todos/.gitkeep',
	'feature/default.md',
	'glossary-entry/default.md',
	'module/default.md',
	'organization/client/_org.md',
	'organization/client/communications/communications.md',
	'organization/client/contacts/contacts.md',
	'organization/client/documents/documents.md',
	'organization/client/llm/analysis/.gitkeep',
	'organization/client/llm/brainstorming/.gitkeep',
	'organization/client/llm/functional/.gitkeep',
	'organization/client/llm/llm.md',
	'organization/client/llm/planning/.gitkeep',
	'organization/client/notes/notes.md',
	'organization/client/projects/projects.md',
	'organization/client/todos/.gitkeep',
	'organization/default/_org.md',
	'organization/default/communications/communications.md',
	'organization/default/contacts/contacts.md',
	'organization/default/llm/analysis/.gitkeep',
	'organization/default/llm/brainstorming/.gitkeep',
	'organization/default/llm/functional/.gitkeep',
	'organization/default/llm/llm.md',
	'organization/default/llm/planning/.gitkeep',
	'organization/default/todos/.gitkeep',
	'organization/employer/_org.md',
	'organization/employer/communications/communications.md',
	'organization/employer/contacts/contacts.md',
	'organization/employer/documents/documents.md',
	'organization/employer/llm/analysis/.gitkeep',
	'organization/employer/llm/brainstorming/.gitkeep',
	'organization/employer/llm/functional/.gitkeep',
	'organization/employer/llm/llm.md',
	'organization/employer/llm/planning/.gitkeep',
	'organization/employer/notes/notes.md',
	'organization/employer/projects/projects.md',
	'organization/employer/todos/.gitkeep',
	'project/default/_prj.md',
	'project/default/documents/documents.md',
	'project/default/llm/llm.md',
	'project/default/todos/.gitkeep',
	'project/household/_prj.md',
	'project/household/documents/documents.md',
	'project/household/notes/notes.md',
	'project/self-improvement/_prj.md',
	'project/self-improvement/documents/documents.md',
	'project/self-improvement/notes/notes.md',
	'project/services/_prj.md',
	'project/services/communications/communications.md',
	'project/services/documents/documents.md',
	'project/services/notes/notes.md',
	'project/software/_prj.md',
	'project/software/designs/designs.md',
	'project/software/documentation/documentation.md',
	'project/software/notes/notes.md',
	'project/software/requirements/requirements.md',
	'project/software/test-plans/test-plans.md',
	'question/default.md',
	'requirement/default.md',
	'resource/default.md',
	'task/default.md',
	'test-case/default.md',
	'todo/default.md',
];

function plan(args: {
	bundled: BundledTemplateFile[];
	existing?: Map<string, string>;
	unreadable?: Set<string>;
	records?: Record<string, TemplateSeedRecord>;
	fillMissing?: boolean;
	updateUnmodified?: boolean;
}) {
	return planTemplateSeed({
		bundled: args.bundled,
		existing: args.existing ?? new Map(),
		unreadable: args.unreadable ?? new Set(),
		records: args.records,
		fillMissing: args.fillMissing ?? false,
		updateUnmodified: args.updateUnmodified ?? false,
	});
}

test('sha256 matches node crypto', () => {
	const samples = ['', 'abc', 'a'.repeat(200), 'café — templates'];
	for (const sample of samples) {
		assert.equal(sha256Hex(sample), createHash('sha256').update(sample, 'utf8').digest('hex'));
	}
	assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('templates path rejects the vault root and paths that leave the vault', () => {
	assert.equal(normalizeVaultRelativePath('  _project-templates/ '), '_project-templates');
	assert.equal(normalizeVaultRelativePath('Foo\\Bar'), 'Foo/Bar');
	assert.equal(normalizeVaultRelativePath('Foo//Bar/'), 'Foo/Bar');
	assert.equal(normalizeVaultRelativePath(''), null);
	assert.equal(normalizeVaultRelativePath('/'), null);
	assert.equal(normalizeVaultRelativePath('.'), null);
	assert.equal(normalizeVaultRelativePath('Foo/../Bar'), null);
	assert.equal(normalizeVaultRelativePath('../Foo'), null);
	assert.equal(normalizeVaultRelativePath('C:/vault'), null);
	assert.equal(normalizeVaultRelativePath('todos/.gitkeep'), 'todos/.gitkeep');
});

test('stored seed records keep a seeded hash and a preexisting file', () => {
	const hash = 'a'.repeat(64);
	const stored = normalizeStoredTemplateSeed({
		updateInstalledTemplates: 'yes',
		templateInstallDeclined: true,
		templateSeeds: {
			'../etc': { 'a.md': { state: 'seeded', hash } },
			Templates: {
				'task/default.md': { state: 'seeded', hash: 'ab' },
				'todo/default.md': { state: 'seeded', hash },
				'nope.md': { state: 'other' },
				'keep.md': { state: 'preexisting', hash: 'ignored' },
			},
		},
	});
	assert.equal(stored.updateInstalledTemplates, false);
	assert.equal(stored.templateInstallDeclined, true);
	assert.deepEqual(stored.templateSeeds, {
		Templates: {
			'keep.md': { state: 'preexisting' },
			'todo/default.md': { state: 'seeded', hash },
		},
	});
});

test('a new folder receives every bundled file', () => {
	const result = plan({
		bundled: [
			{ path: 'task/default.md', content: 'task' },
			{ path: 'todo/default.md', content: 'todo' },
		],
	});
	assert.deepEqual(
		result.writes.map((write) => write.path),
		['task/default.md', 'todo/default.md'],
	);
	assert.equal(result.writes.every((write) => write.kind === 'create'), true);
	assert.equal(result.files['task/default.md']?.state, 'seeded');
	const task = result.files['task/default.md'];
	assert.equal(task?.state === 'seeded' ? task.hash : '', sha256Hex('task'));
});

test('a file already in the folder is preexisting and stays', () => {
	const result = plan({
		bundled: [{ path: 'task/default.md', content: 'shipped' }],
		existing: new Map([['task/default.md', 'mine']]),
		fillMissing: true,
		updateUnmodified: true,
	});
	assert.deepEqual(result.writes, []);
	assert.deepEqual(result.files['task/default.md'], { state: 'preexisting' });
});

test('a file that already matches the shipped copy can be updated later', () => {
	const first = plan({
		bundled: [{ path: 'task/default.md', content: 'shipped' }],
		existing: new Map([['task/default.md', 'shipped']]),
		updateUnmodified: true,
	});
	assert.deepEqual(first.writes, []);
	const recorded = first.files['task/default.md'];
	assert.equal(recorded?.state === 'seeded' ? recorded.hash : '', sha256Hex('shipped'));

	const next = plan({
		bundled: [{ path: 'task/default.md', content: 'shipped-2' }],
		existing: new Map([['task/default.md', 'shipped']]),
		records: first.files,
		updateUnmodified: true,
	});
	assert.deepEqual(next.writes, [{ path: 'task/default.md', content: 'shipped-2', kind: 'update' }]);
});

test('a removed file stays removed until install fills it', () => {
	const hash = sha256Hex('shipped');
	const records = { 'task/default.md': { state: 'seeded' as const, hash } };
	const quiet = plan({
		bundled: [{ path: 'task/default.md', content: 'shipped' }],
		records,
	});
	assert.deepEqual(quiet.writes, []);
	assert.equal(templateSeedRecordsEqual(records, quiet.files), true);

	const filled = plan({
		bundled: [{ path: 'task/default.md', content: 'shipped again' }],
		records,
		fillMissing: true,
	});
	assert.equal(filled.writes[0]?.kind, 'create');
	assert.equal(filled.writes[0]?.content, 'shipped again');
});

test('update replaces an unmodified seeded file and leaves an edit', () => {
	const original = 'alpha';
	const records = {
		'a.md': { state: 'seeded' as const, hash: sha256Hex(original) },
		'b.md': { state: 'seeded' as const, hash: sha256Hex(original) },
		'old.md': { state: 'preexisting' as const },
	};
	const bundled = [
		{ path: 'a.md', content: 'beta' },
		{ path: 'b.md', content: 'beta' },
	];
	const existing = new Map([
		['a.md', original],
		['b.md', 'edited'],
	]);
	const held = plan({ bundled, existing, records, updateUnmodified: false });
	assert.deepEqual(held.writes, []);
	assert.deepEqual(held.keptEdits, ['b.md']);

	const updated = plan({ bundled, existing, records, updateUnmodified: true });
	assert.deepEqual(updated.writes, [{ path: 'a.md', content: 'beta', kind: 'update' }]);
	assert.deepEqual(updated.keptEdits, ['b.md']);
	const a = updated.files['a.md'];
	assert.equal(a?.state === 'seeded' ? a.hash : '', sha256Hex('beta'));
	const b = updated.files['b.md'];
	assert.equal(b?.state === 'seeded' ? b.hash : '', sha256Hex(original));
	assert.deepEqual(updated.files['old.md'], { state: 'preexisting' });
});

test('an unreadable file is left out of the records', () => {
	const result = plan({
		bundled: [{ path: 'task/default.md', content: 'task' }],
		unreadable: new Set(['task/default.md']),
	});
	assert.deepEqual(result.writes, []);
	assert.equal(result.files['task/default.md'], undefined);
});

test('template seed notices stay quiet when a startup pass changes nothing', () => {
	assert.equal(
		templateSeedNotice({
			root: '_project-templates',
			creates: 0,
			updates: 0,
			keptEdits: 0,
			failed: 0,
			report: 'silent',
		}),
		null,
	);
	assert.equal(
		templateSeedNotice({
			root: '_project-templates',
			creates: 2,
			updates: 1,
			keptEdits: 1,
			failed: 0,
			report: 'silent',
		}),
		'Installed 2 template files in _project-templates. Updated 1 template file in _project-templates. Left 1 edited template file in place.',
	);
	assert.equal(
		templateSeedNotice({
			root: 'Templates',
			creates: 0,
			updates: 0,
			keptEdits: 0,
			failed: 0,
			report: 'install',
		}),
		'No template files were written into Templates.',
	);
	assert.equal(
		templateSeedNotice({
			root: 'Templates',
			creates: 0,
			updates: 0,
			keptEdits: 0,
			failed: 0,
			report: 'update',
		}),
		'No template files were replaced in Templates.',
	);
});

test('bundled templates match templates/ and include the starting set', () => {
	const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
	const onDisk = readTemplates(path.join(pluginRoot, 'templates'));
	assert.deepEqual(
		BUNDLED_TEMPLATES.map((file) => file.path),
		onDisk.map((file) => file.path),
	);
	assert.deepEqual(
		BUNDLED_TEMPLATES.map((file) => file.content),
		onDisk.map((file) => file.content),
	);
	const paths = new Set(BUNDLED_TEMPLATES.map((file) => file.path));
	for (const required of REQUIRED_TEMPLATES) {
		assert.equal(paths.has(required), true, required);
	}
	const readme = BUNDLED_TEMPLATES.find((file) => file.path === 'README.md');
	assert.equal(readme?.content.startsWith('# Muse templates\n'), true);
	assert.equal(readme?.content.includes('(lab)'), false);
	const org = BUNDLED_TEMPLATES.find((file) => file.path === 'organization/default/_org.md');
	assert.equal(org?.content.includes('msprj_archetype: organization'), true);
	const keep = BUNDLED_TEMPLATES.find((file) => file.path === 'organization/default/todos/.gitkeep');
	assert.equal(keep?.content, '');
});

function readTemplates(dir: string, prefix = ''): { path: string; content: string }[] {
	const files: { path: string; content: string }[] = [];
	for (const name of readdirSync(dir)) {
		if (name === '.DS_Store' || (name.startsWith('.') && name !== '.gitkeep') || name.endsWith('~')) {
			continue;
		}
		const full = path.join(dir, name);
		const rel = prefix ? `${prefix}/${name}` : name;
		if (statSync(full).isDirectory()) {
			files.push(...readTemplates(full, rel));
			continue;
		}
		files.push({ path: rel, content: readFileSync(full, 'utf8') });
	}
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return files;
}
