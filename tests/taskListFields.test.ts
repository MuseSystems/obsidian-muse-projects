import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MSPRJ_ARCHETYPE, MSPRJ_PRJ_GENERAL_ADMIN, MSPRJ_PRJ_ORG } from '../src/constants';
import { TASK_STATUSES } from '../src/taskStatuses';
import {
	adminNeedsWrite,
	completedDateNeedsWrite,
	completionValueAfterStatusChange,
	listFactsFromProject,
	orgNeedsWrite,
	storedDate,
	taskListWrites,
} from '../src/taskListFields';

const TODAY = '2026-11-15';

test('done and cancelled are the terminal statuses', () => {
	assert.deepEqual(
		TASK_STATUSES.filter((status) => status.terminal).map((status) => status.id),
		['done', 'cancelled'],
	);
});

test('entering or switching a terminal status stamps today', () => {
	assert.equal(completionValueAfterStatusChange('active', 'done', TODAY), TODAY);
	assert.equal(completionValueAfterStatusChange('blocked', 'cancelled', TODAY), TODAY);
	assert.equal(completionValueAfterStatusChange('done', 'cancelled', TODAY), TODAY);
	assert.equal(completionValueAfterStatusChange(' cancelled ', 'done', TODAY), TODAY);
});

test('leaving a terminal status clears the date, and other moves leave it', () => {
	assert.equal(completionValueAfterStatusChange('done', 'active', TODAY), null);
	assert.equal(completionValueAfterStatusChange('cancelled', 'backlog', TODAY), null);
	assert.equal(completionValueAfterStatusChange('active', 'blocked', TODAY), undefined);
	assert.equal(completionValueAfterStatusChange('backlog', 'active', TODAY), undefined);
	assert.equal(completionValueAfterStatusChange('done', 'done', TODAY), undefined);
	assert.equal(completionValueAfterStatusChange('done', ' custom ', TODAY), null);
});

test('a completion write is skipped when the stored calendar day already matches', () => {
	assert.equal(completedDateNeedsWrite('2026-11-15', TODAY), false);
	assert.equal(completedDateNeedsWrite('2026-11-15T00:00:00', TODAY), false);
	assert.equal(completedDateNeedsWrite(null, TODAY), true);
	assert.equal(completedDateNeedsWrite(undefined, TODAY), true);
	assert.equal(completedDateNeedsWrite('2026-11-14', null), true);
	assert.equal(completedDateNeedsWrite(null, null), false);
	assert.equal(completedDateNeedsWrite('2026-11-14', undefined), false);
});

test('a UTC-midnight Date keeps that calendar day', () => {
	assert.equal(storedDate(new Date(Date.UTC(2026, 10, 15))), '2026-11-15');
	assert.equal(storedDate(new Date(2026, 10, 15, 16, 30, 0)), '2026-11-15');
	assert.equal(storedDate(''), null);
	assert.equal(storedDate(4), null);
});

test('org and general admin copy from the project, and missing admin is written', () => {
	assert.deepEqual(
		listFactsFromProject({
			[MSPRJ_ARCHETYPE]: 'project',
			[MSPRJ_PRJ_ORG]: ' SURTECH ',
			[MSPRJ_PRJ_GENERAL_ADMIN]: true,
		}),
		{ org: 'SURTECH', generalAdmin: true },
	);
	assert.deepEqual(listFactsFromProject({ [MSPRJ_ARCHETYPE]: 'project' }), {
		org: null,
		generalAdmin: false,
	});
	assert.equal(listFactsFromProject({ [MSPRJ_ARCHETYPE]: 'task' }), null);
	assert.equal(orgNeedsWrite('SURTECH', 'SURTECH'), false);
	assert.equal(orgNeedsWrite(undefined, 'SURTECH'), true);
	assert.equal(orgNeedsWrite('', null), false);
	assert.equal(adminNeedsWrite(undefined, false), true);
	assert.equal(adminNeedsWrite(false, false), false);
	assert.equal(adminNeedsWrite(true, false), true);
});

test('list sync writes a completion date only for a known status change', () => {
	assert.deepEqual(
		taskListWrites({
			known: true,
			previous: 'active',
			liveStatus: 'done',
			completed: null,
			today: TODAY,
		}),
		{ completed: TODAY },
	);
	assert.equal(
		taskListWrites({
			known: false,
			previous: undefined,
			liveStatus: 'done',
			completed: null,
			today: TODAY,
		}),
		null,
	);
	assert.equal(
		taskListWrites({
			known: true,
			previous: 'active',
			liveStatus: 'active',
			completed: null,
			today: TODAY,
		}),
		null,
	);
});
