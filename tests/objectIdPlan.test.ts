import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planObjectIds } from '../src/objectIdPlan';

const ID = '3f1c0a5e-7b14-4d2a-8c91-6e0b4a2d91f7';

test('a duplicate id is reported and a missing id is assigned', () => {
	const plan = planObjectIds([
		{ path: 'b.md', id: ID, canonical: false },
		{ path: 'a.md', id: ID, canonical: true },
		{ path: 'c.md', id: null, canonical: false },
		{ path: 'd.md', id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', canonical: true },
	]);
	assert.deepEqual(plan.canonicalize, []);
	assert.deepEqual(plan.duplicates, [{ id: ID, paths: ['a.md', 'b.md'] }]);
	assert.deepEqual(plan.assign, ['c.md']);
});

test('one uppercase id is canonicalized', () => {
	const plan = planObjectIds([{ path: 'a.md', id: ID, canonical: false }]);
	assert.deepEqual(plan.canonicalize, [{ path: 'a.md', id: ID }]);
	assert.deepEqual(plan.duplicates, []);
	assert.deepEqual(plan.assign, []);
});
