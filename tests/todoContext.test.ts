import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	artifactCodeForTodoOwner,
	createdTodoDir,
	designatedTodoDir,
	todoAggregateFolder,
	todoCreateSeed,
	todoFolderPrefill,
	todoOwnerFromContext,
} from '../src/todoContext';

test('an archetype note owns the to-do and files it in the parent folder', () => {
	assert.deepEqual(
		todoCreateSeed({
			context: 'archetype',
			path: 'Projects/app/task.md',
			parentPath: 'Projects/app',
		}),
		{ ownerPath: 'Projects/app/task.md', folderPath: 'Projects/app' },
	);
});

test('a folder and an ordinary note supply a location and no owner', () => {
	assert.deepEqual(
		todoCreateSeed({ context: 'folder', path: 'Inbox', parentPath: null }),
		{ ownerPath: null, folderPath: 'Inbox' },
	);
	assert.deepEqual(
		todoCreateSeed({ context: 'note', path: 'Inbox/scratch.md', parentPath: 'Inbox' }),
		{ ownerPath: null, folderPath: 'Inbox' },
	);
});

test('no context has no owner and no folder', () => {
	assert.deepEqual(todoCreateSeed({ context: 'none', path: '', parentPath: null }), {
		ownerPath: null,
		folderPath: null,
	});
});

test('an owning artifact contributes its own code', () => {
	assert.equal(
		artifactCodeForTodoOwner('organization', { msprj_org_code: ' MUSE ' }),
		'MUSE',
	);
	assert.equal(
		artifactCodeForTodoOwner('project', { msprj_prj_code: ' ENG-012 ' }),
		'ENG-012',
	);
	assert.equal(
		artifactCodeForTodoOwner('task', {
			msprj_tsk_code: ' ENG-012-001 ',
			msprj_tsk_project_code: 'ENG-012',
		}),
		'ENG-012-001',
	);
	assert.equal(
		artifactCodeForTodoOwner('memo', { msprj_memo_code: ' BRIEF ' }),
		'BRIEF',
	);
	assert.equal(
		artifactCodeForTodoOwner('task', { msprj_tsk_project_code: 'ENG-012' }),
		null,
	);
	assert.equal(artifactCodeForTodoOwner('project', null), null);
});

test('an organization, project, or document names its to-do folder', () => {
	assert.equal(
		designatedTodoDir('project', { msprj_prj_todo_dir: ' Projects/app/todos ' }),
		'Projects/app/todos',
	);
	assert.equal(
		designatedTodoDir('organization', { msprj_org_todo_dir: '/' }),
		'/',
	);
	assert.equal(designatedTodoDir('project', { msprj_prj_todo_dir: '   ' }), null);
	assert.equal(designatedTodoDir('project', { msprj_prj_todo_dir: null }), null);
	assert.equal(designatedTodoDir('project', {}), null);
	assert.equal(designatedTodoDir('project', null), null);
	assert.equal(
		designatedTodoDir('task', { msprj_prj_todo_dir: 'Projects/app/todos' }),
		null,
	);
	assert.equal(
		designatedTodoDir('todo', { msprj_org_todo_dir: 'Orgs/muse/todos' }),
		null,
	);
	assert.equal(
		designatedTodoDir('organization', { msprj_prj_todo_dir: 'Projects/app/todos' }),
		null,
	);
	assert.equal(
		designatedTodoDir('document', { msprj_doc_todo_dir: ' Clients/acme/sow/todos ' }),
		'Clients/acme/sow/todos',
	);
	assert.equal(designatedTodoDir('requirement', { msprj_doc_todo_dir: 'Clients/acme/sow/todos' }), null);
});

test('a template to-do directory is a folder inside the new project or organization', () => {
	assert.deepEqual(createdTodoDir('Clients/acme', 'todos', 'msprj_prj_todo_dir'), {
		kind: 'folder',
		vaultPath: 'Clients/acme/todos',
	});
	assert.deepEqual(createdTodoDir('Clients/acme', ' work/todos/ ', 'msprj_prj_todo_dir'), {
		kind: 'folder',
		vaultPath: 'Clients/acme/work/todos',
	});
	assert.deepEqual(createdTodoDir('', './todos', 'msprj_org_todo_dir'), {
		kind: 'folder',
		vaultPath: 'todos',
	});
	assert.deepEqual(createdTodoDir('Clients/acme', '   ', 'msprj_prj_todo_dir'), { kind: 'none' });
	assert.deepEqual(createdTodoDir('Clients/acme', null, 'msprj_prj_todo_dir'), { kind: 'none' });
	assert.equal(createdTodoDir('Clients/acme', '../todos', 'msprj_prj_todo_dir').kind, 'invalid');
	assert.equal(createdTodoDir('Clients/acme', '/vault/todos', 'msprj_prj_todo_dir').kind, 'invalid');
	assert.equal(createdTodoDir('Clients/acme', 'todos/../../x', 'msprj_prj_todo_dir').kind, 'invalid');
	assert.equal(createdTodoDir('Clients/acme', 3, 'msprj_prj_todo_dir').kind, 'invalid');
});

test('a to-do files in the entity folder, and keeps the context folder when there is no entity', () => {
	assert.equal(
		todoAggregateFolder({
			contextFolder: 'Clients/acme/sow/requirements',
			entityFolder: 'Clients/acme/sow',
			designated: 'Clients/acme/sow/todos',
			designatedExists: true,
		}),
		'Clients/acme/sow/todos',
	);
	assert.equal(
		todoAggregateFolder({
			contextFolder: 'Clients/acme/website/billing/notes',
			entityFolder: 'Clients/acme/website/billing',
			designated: 'Clients/acme/website/billing/todos',
			designatedExists: false,
		}),
		'Clients/acme/website/billing',
	);
	assert.equal(
		todoAggregateFolder({
			contextFolder: 'Inbox/scratch',
			entityFolder: null,
			designated: null,
			designatedExists: false,
		}),
		'Inbox/scratch',
	);
});

test('an existing to-do folder replaces the note folder', () => {
	assert.equal(todoFolderPrefill('Projects/app', 'Projects/app/todos', true), 'Projects/app/todos');
	assert.equal(todoFolderPrefill('Projects/app', 'Projects/missing', false), 'Projects/app');
	assert.equal(todoFolderPrefill('Projects/app', null, false), 'Projects/app');
	assert.equal(todoFolderPrefill(null, null, false), null);
});

test('a to-do context uses its owner, and any other managed note owns directly', () => {
	assert.equal(todoOwnerFromContext('todo'), 'context-owner');
	assert.equal(todoOwnerFromContext('task'), 'context');
	assert.equal(todoOwnerFromContext('project'), 'context');
	assert.equal(todoOwnerFromContext('organization'), 'context');
	assert.equal(todoOwnerFromContext('document'), 'context');
	assert.equal(todoOwnerFromContext('requirement'), 'context');
	assert.equal(todoOwnerFromContext('note'), 'none');
	assert.equal(todoOwnerFromContext(null), 'none');
});
