import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	directoryContextKind,
	documentInScope,
	noteCreateActions,
	orgResourceInScope,
} from '../src/noteCreateAction';

const plain = {
	underTemplates: false,
	isProject: false,
	isOrganization: false,
	documentInScope: false,
	orgResourceInScope: false,
};

test('a project note offers a task, a sub-project, a document, a to-do, and the resource notes', () => {
	assert.deepEqual(noteCreateActions({ ...plain, isProject: true, orgResourceInScope: true }), [
		'new-task',
		'new-project',
		'new-document',
		'new-todo',
		'new-org-resource',
	]);
});

test('an organization note offers a child organization, a project, a document, a to-do, and the resource notes', () => {
	assert.deepEqual(
		noteCreateActions({ ...plain, isOrganization: true, orgResourceInScope: true }),
		['new-organization', 'new-project', 'new-document', 'new-todo', 'new-org-resource'],
	);
});

test('a task, a to-do, and an ordinary note offer a document and a to-do', () => {
	assert.deepEqual(noteCreateActions(plain), ['new-document', 'new-todo']);
});

test('a document in scope also offers the subordinate notes', () => {
	assert.deepEqual(noteCreateActions({ ...plain, documentInScope: true }), [
		'new-document',
		'new-todo',
		'new-subordinate',
	]);
});

test('a directory takes the one project note, otherwise the one organization note', () => {
	assert.equal(directoryContextKind({ projects: 1, organizations: 0 }), 'project');
	assert.equal(directoryContextKind({ projects: 1, organizations: 1 }), 'project');
	assert.equal(directoryContextKind({ projects: 0, organizations: 1 }), 'organization');
	assert.equal(directoryContextKind({ projects: 0, organizations: 0 }), 'none');
	assert.equal(directoryContextKind({ projects: 2, organizations: 0 }), 'none');
	assert.equal(directoryContextKind({ projects: 0, organizations: 2 }), 'none');
	assert.equal(directoryContextKind({ projects: 2, organizations: 1 }), 'none');
});

test('a template note offers nothing, and a project wins over an organization', () => {
	assert.deepEqual(
		noteCreateActions({ ...plain, underTemplates: true, isProject: true, isOrganization: true }),
		[],
	);
	assert.deepEqual(noteCreateActions({ ...plain, isProject: true, isOrganization: true }), [
		'new-task',
		'new-project',
		'new-document',
		'new-todo',
	]);
});

test('a contact or resource is in scope from the note or from the nearest organization or project', () => {
	assert.equal(orgResourceInScope('contact', null), true);
	assert.equal(orgResourceInScope('resource', 'document'), true);
	assert.equal(orgResourceInScope('task', 'project'), true);
	assert.equal(orgResourceInScope('task', 'organization'), true);
	assert.equal(orgResourceInScope('task', 'document'), false);
	assert.equal(orgResourceInScope('requirement', 'document'), false);
});

test('a document is in scope from the note or from the nearest document', () => {
	assert.equal(documentInScope('document', null), true);
	assert.equal(documentInScope('requirement', 'project'), true);
	assert.equal(documentInScope('task', 'document'), true);
	assert.equal(documentInScope('task', 'project'), false);
	assert.equal(documentInScope(null, 'organization'), false);
});
