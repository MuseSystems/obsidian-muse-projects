import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalObjectId, newObjectId } from '../src/uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('newObjectId is a lowercase UUID version 4', () => {
	const id = newObjectId();
	assert.match(id, UUID_V4);
	assert.notEqual(newObjectId(), id);
});

test('canonicalObjectId keeps a version 4 UUID and lowercases it', () => {
	const id = '3F1C0A5E-7B14-4D2A-8C91-6E0B4A2D91F7';
	assert.equal(canonicalObjectId(id), id.toLowerCase());
	assert.equal(canonicalObjectId(`  ${id.toLowerCase()}  `), id.toLowerCase());
	assert.equal(canonicalObjectId('aaaaaaaa'), null);
	assert.equal(canonicalObjectId('3f1c0a5e-7b14-1d2a-8c91-6e0b4a2d91f7'), null);
	assert.equal(canonicalObjectId(''), null);
	assert.equal(canonicalObjectId(null), null);
});
