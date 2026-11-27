import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	SkeletonChoiceError,
	planSkeletonCopy,
	selectableSkeletonNames,
	skeletonTemplateNoteName,
	straySkeletonManagedNotes,
} from '../src/skeletonPlan';

const layouts = ['default', 'software'];

test('named skeletons omit the vault default folder', () => {
	assert.deepEqual(selectableSkeletonNames(['software', 'default', 'client']), [
		'software',
		'client',
	]);
	assert.deepEqual(selectableSkeletonNames(['default']), []);
});

test('vault default copies the default folder, or nothing when that folder is absent', () => {
	assert.equal(
		planSkeletonCopy('project', { kind: 'vault-default' }, layouts),
		'default',
	);
	assert.equal(
		planSkeletonCopy('project', { kind: 'vault-default' }, ['software']),
		null,
	);
	assert.equal(
		planSkeletonCopy('organization', { kind: 'inherit', inheritedStem: null }, layouts),
		'default',
	);
	assert.equal(
		planSkeletonCopy('organization', { kind: 'inherit', inheritedStem: null }, []),
		null,
	);
});

test('a stored default stays on the vault default folder', () => {
	assert.equal(
		planSkeletonCopy('project', { kind: 'inherit', inheritedStem: 'default' }, layouts),
		'default',
	);
	assert.throws(
		() => planSkeletonCopy('project', { kind: 'inherit', inheritedStem: 'default' }, []),
		(err: unknown) =>
			err instanceof SkeletonChoiceError &&
			err.message === 'Skeleton "project/default" was not found.',
	);
});

test('a named skeleton must exist, and an empty name is refused', () => {
	assert.equal(
		planSkeletonCopy('project', { kind: 'named', stem: 'software' }, layouts),
		'software',
	);
	assert.equal(
		planSkeletonCopy(
			'organization',
			{ kind: 'inherit', inheritedStem: 'client.md' },
			['client'],
		),
		'client',
	);
	assert.throws(
		() => planSkeletonCopy('organization', { kind: 'named', stem: 'missing' }, layouts),
		(err: unknown) =>
			err instanceof SkeletonChoiceError &&
			err.message === 'Skeleton "organization/missing" was not found.',
	);
	assert.throws(
		() => planSkeletonCopy('project', { kind: 'named', stem: '  ' }, layouts),
		(err: unknown) =>
			err instanceof SkeletonChoiceError && err.message === 'Skeleton name is empty.',
	);
});

test('the layout note has a fixed name, and any other managed note is stray', () => {
	assert.equal(skeletonTemplateNoteName('organization'), '_org.md');
	assert.equal(skeletonTemplateNoteName('project'), '_prj.md');
	assert.equal(skeletonTemplateNoteName('document'), '_doc.md');
	assert.deepEqual(straySkeletonManagedNotes('organization', ['_org.md']), []);
	assert.deepEqual(straySkeletonManagedNotes('project', ['_prj.md', 'notes/task.md']), [
		'notes/task.md',
	]);
	assert.deepEqual(straySkeletonManagedNotes('document', ['_doc.md', 'feature.md']), [
		'feature.md',
	]);
});
