import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUBORDINATES } from '../src/subordinates';
import { ORG_RESOURCES } from '../src/orgResources';
import { MSPRJ_ORG_RESOURCE_ARCHETYPES, MSPRJ_SUBORDINATE_ARCHETYPES } from '../src/constants';
import {
	aggregateKindForArchetype,
	firstAggregate,
	folderAggregateKind,
} from '../src/todoScope';

test('a folder is the one document, otherwise the one project, otherwise the one organization', () => {
	assert.equal(folderAggregateKind({ documents: 1, projects: 1, organizations: 1 }), 'document');
	assert.equal(folderAggregateKind({ documents: 0, projects: 1, organizations: 1 }), 'project');
	assert.equal(folderAggregateKind({ documents: 0, projects: 0, organizations: 1 }), 'organization');
	assert.equal(folderAggregateKind({ documents: 2, projects: 1, organizations: 0 }), null);
	assert.equal(folderAggregateKind({ documents: 0, projects: 2, organizations: 1 }), null);
	assert.equal(folderAggregateKind({ documents: 0, projects: 0, organizations: 2 }), null);
	assert.equal(folderAggregateKind({ documents: 0, projects: 0, organizations: 0 }), null);
});

test('the nearest entity walking upward is the to-do association', () => {
	assert.equal(firstAggregate([null, 'document', 'project', 'organization']), 'document');
	assert.equal(firstAggregate([null, 'project', 'project', 'organization']), 'project');
	assert.equal(firstAggregate([null, 'organization']), 'organization');
	assert.equal(firstAggregate([null, null]), null);
	assert.equal(firstAggregate([]), null);
});

test('only a document, project, or organization note is an aggregate', () => {
	assert.equal(aggregateKindForArchetype('document'), 'document');
	assert.equal(aggregateKindForArchetype('project'), 'project');
	assert.equal(aggregateKindForArchetype('organization'), 'organization');
	assert.equal(aggregateKindForArchetype('task'), null);
	assert.equal(aggregateKindForArchetype('requirement'), null);
	assert.equal(aggregateKindForArchetype('todo'), null);
});

test('the subordinate menu list is the fixed archetype set', () => {
	assert.deepEqual(
		SUBORDINATES.map((kind) => kind.id),
		[...MSPRJ_SUBORDINATE_ARCHETYPES],
	);
});

test('the contact and resource menu list is the fixed archetype set', () => {
	assert.deepEqual(
		ORG_RESOURCES.map((kind) => kind.id),
		[...MSPRJ_ORG_RESOURCE_ARCHETYPES],
	);
});
