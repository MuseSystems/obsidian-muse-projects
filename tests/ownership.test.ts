import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	derivedProjectOrgCode,
	derivedTaskFacts,
	rollupProjects,
	walkOwnerChain,
	type ChainNote,
} from '../src/ownership';
import { repairNotice } from '../src/repairNotice';

function note(partial: Partial<ChainNote> & { path: string }): ChainNote {
	return {
		archetype: 'project',
		owner: null,
		orgCode: null,
		projectCode: null,
		projectName: null,
		generalAdmin: false,
		...partial,
	};
}

test('an empty owner ends the chain', () => {
	const walked = walkOwnerChain('task.md', null, () => {
		throw new Error('resolve');
	});
	assert.deepEqual(walked, { ok: true, ancestors: [] });
});

test('a cycle and a dangling link do not yield ancestors', () => {
	const org = note({ path: 'org.md', archetype: 'organization', orgCode: 'MUSE', owner: '[[task.md]]' });
	const project = note({
		path: 'project.md',
		projectCode: 'ENG',
		owner: '[[org.md]]',
	});
	const task = note({ path: 'task.md', archetype: 'task', owner: '[[project.md]]' });
	const byPath = new Map<string, ChainNote>([
		['org.md', org],
		['project.md', project],
		['task.md', task],
	]);
	const cycled = walkOwnerChain('task.md', '[[project.md]]', (_from, raw) => {
		const path = String(raw).replace('[[', '').replace(']]', '');
		return byPath.get(path) ?? null;
	});
	assert.equal(cycled.ok, false);
	if (!cycled.ok) assert.equal(cycled.reason, 'cycle');

	const dangling = walkOwnerChain('task.md', '[[missing.md]]', () => null);
	assert.deepEqual(dangling, { ok: false, reason: 'dangling' });
});

test('a task copies the nearest project and the organization above it', () => {
	const ancestors = [
		note({ path: 'child.md', projectCode: 'CHILD', projectName: 'Child', generalAdmin: true, owner: '[[parent.md]]' }),
		note({ path: 'parent.md', projectCode: 'PARENT', projectName: 'Parent', owner: '[[org.md]]' }),
		note({ path: 'org.md', archetype: 'organization', orgCode: ' muse ', owner: null }),
	];
	assert.deepEqual(derivedTaskFacts(ancestors), {
		projectCode: 'CHILD',
		orgCode: 'MUSE',
		generalAdmin: true,
	});
	assert.deepEqual(rollupProjects(ancestors), [{ code: 'PARENT', name: 'Parent' }]);
	assert.equal(derivedProjectOrgCode(ancestors.slice(1)), 'MUSE');
});

test('a project under a child organization copies that organization', () => {
	const ancestors = [
		note({
			path: 'child-org.md',
			archetype: 'organization',
			orgCode: 'SUB',
			owner: '[[parent-org.md]]',
		}),
		note({ path: 'parent-org.md', archetype: 'organization', orgCode: 'MUSE', owner: null }),
	];
	assert.equal(derivedProjectOrgCode(ancestors), 'SUB');
});

test('a task owned by an organization with no project above is not recoverable', () => {
	assert.equal(
		derivedTaskFacts([note({ path: 'org.md', archetype: 'organization', orgCode: 'MUSE' })]),
		null,
	);
	assert.equal(derivedProjectOrgCode([]), null);
});

test('repair notice names recovered notes and chains that stay broken', () => {
	assert.equal(repairNotice({ repaired: 0, unresolved: 0 }), 'Owner references already match.');
	assert.equal(repairNotice({ repaired: 1, unresolved: 0 }), 'Repaired 1 note.');
	assert.equal(
		repairNotice({ repaired: 2, unresolved: 1 }),
		'Repaired 2 notes. Left 1 note with an owner chain that cannot be recovered.',
	);
});
