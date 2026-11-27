import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	formatTaskCode,
	formatTodoCode,
	identifierCodeError,
	normalizeOrganizationCode,
	normalizeProjectCode,
	normalizeNoteFilename,
	suggestFolderSlug,
	suggestOrganizationBasename,
	suggestProjectBasename,
	suggestDocumentBasename,
	suggestSubordinateBasename,
	suggestTaskBasename,
	suggestTodoBasename,
} from '../src/slug';

test('folder slugs are lowercase, hyphenated, and drop dots', () => {
	assert.equal(suggestFolderSlug('Write the Runbook!'), 'write-the-runbook');
	assert.equal(suggestFolderSlug('Hello...World'), 'hello-world');
	assert.equal(suggestFolderSlug('  A  B  '), 'a-b');
	assert.equal(suggestFolderSlug('---'), '');
});

test('project codes are trimmed and uppercased', () => {
	assert.equal(normalizeProjectCode('  ab-12 '), 'AB-12');
	assert.equal(normalizeProjectCode('   '), '');
});

test('codes reject spaces, quotes, and slashes', () => {
	assert.equal(identifierCodeError(''), null);
	assert.equal(identifierCodeError(' ab-12 '), null);
	assert.equal(identifierCodeError('A_1'), null);
	assert.notEqual(identifierCodeError('A/B'), null);
	assert.notEqual(identifierCodeError('A B'), null);
	assert.notEqual(identifierCodeError('A"B'), null);
	assert.notEqual(identifierCodeError('-AB'), null);
});

test('organization note names append the name slug after the code', () => {
	assert.equal(normalizeOrganizationCode('  muse '), 'MUSE');
	assert.equal(suggestOrganizationBasename('MUSE', 'Muse Systems'), '_org-muse-muse-systems');
	assert.equal(suggestOrganizationBasename('MUSE'), '_org-muse');
	assert.equal(suggestOrganizationBasename('MUSE', '...'), '_org-muse');
	assert.equal(suggestOrganizationBasename('---', 'Name'), '');
});

test('project note names append the title slug after the code', () => {
	assert.equal(
		suggestProjectBasename('ENG-012', 'Client Engagement'),
		'_prj-eng-012-client-engagement',
	);
	assert.equal(suggestProjectBasename('  muse ', 'Muse Systems'), '_prj-muse-muse-systems');
	assert.equal(suggestProjectBasename('ENG-012'), '_prj-eng-012');
	assert.equal(suggestProjectBasename('ENG-012', '...'), '_prj-eng-012');
	assert.equal(suggestProjectBasename('---', 'Name'), '');
});

test('note file names keep a single .md suffix and reject paths', () => {
	assert.equal(normalizeNoteFilename('  _prj-eng-012.md '), '_prj-eng-012.md');
	assert.equal(normalizeNoteFilename('_org-muse'), '_org-muse.md');
	assert.equal(normalizeNoteFilename('Note.MD'), 'Note.md');
	assert.equal(normalizeNoteFilename(''), '');
	assert.equal(normalizeNoteFilename('.md'), '');
	assert.equal(normalizeNoteFilename('.'), '');
	assert.equal(normalizeNoteFilename('a/b.md'), '');
	assert.equal(normalizeNoteFilename('a\\b.md'), '');
});

test('task codes pad the id and file names add the task- prefix', () => {
	assert.equal(formatTaskCode('eng', 1), 'ENG-001');
	assert.equal(formatTaskCode(' eng-12 ', 12, 4), 'ENG-12-0012');
	assert.equal(
		suggestTaskBasename(formatTaskCode('ENG-012', 1), 'Write Runbook'),
		'task-eng-012-001-write-runbook',
	);
	assert.equal(suggestTaskBasename(formatTaskCode('ENG-012', 1), '...'), 'task-eng-012-001');
});

test('document and subordinate names use the title slug and no code', () => {
	assert.equal(suggestDocumentBasename('Product Design'), '_doc-product-design');
	assert.equal(suggestDocumentBasename('...'), '');
	assert.equal(suggestSubordinateBasename('test-case', 'Sign Off'), 'test-case-sign-off');
	assert.equal(suggestSubordinateBasename('contact', 'Ada Lovelace'), 'contact-ada-lovelace');
	assert.equal(suggestSubordinateBasename('question', '...'), '');
});

test('to-do names pad five digits and add an artifact code only when one is passed', () => {
	assert.equal(formatTodoCode(42, null), 'todo-00042');
	assert.equal(formatTodoCode(42, ' ENG-012-001 '), 'todo-00042-eng-012-001');
	assert.equal(formatTodoCode(42, '---'), 'todo-00042');
	assert.equal(
		suggestTodoBasename('todo-00042-eng-012-001', 'Send the Draft!'),
		'todo-00042-eng-012-001-send-the-draft',
	);
	assert.equal(suggestTodoBasename('todo-00042', '...'), 'todo-00042');
});
