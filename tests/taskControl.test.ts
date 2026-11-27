import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MSPRJ_TSK_STATUS_VALUES } from '../src/constants';
import {
	TASK_STATUSES,
	firstCycledStatus,
	nextCycledStatus,
	taskStatusPresentation,
} from '../src/taskStatuses';
import { findWikilinks, frontmatterLinkPath, linesFromText, taskLinkPath } from '../src/wikilinks';
import { taskCardPills } from '../src/taskCardPills';

test('status ids stay aligned with the stored vocabulary', () => {
	assert.deepEqual(
		TASK_STATUSES.map((status) => status.id),
		[...MSPRJ_TSK_STATUS_VALUES],
	);
});

test('click cycle is backlog, active, done', () => {
	assert.deepEqual(
		TASK_STATUSES.filter((status) => status.cycles).map((status) => status.id),
		['backlog', 'active', 'done'],
	);
	assert.equal(firstCycledStatus(), 'backlog');
	assert.equal(nextCycledStatus('backlog'), 'active');
	assert.equal(nextCycledStatus('active'), 'done');
	assert.equal(nextCycledStatus('done'), 'backlog');
	assert.equal(nextCycledStatus(' done '), 'backlog');
});

test('a click enters the cycle at backlog from outside it', () => {
	for (const current of ['blocked', 'cancelled', 'nope', '', '  ', null, 3]) {
		assert.equal(nextCycledStatus(current), 'backlog', String(current));
	}
});

test('presentation trims known statuses and keeps unknown text', () => {
	assert.deepEqual(taskStatusPresentation(' active '), {
		text: 'active',
		known: true,
		mark: 'active',
		strike: false,
		color: 'var(--msprj-status-active)',
	});
	assert.equal(taskStatusPresentation('done').strike, true);
	assert.equal(taskStatusPresentation('cancelled').strike, true);
	assert.equal(taskStatusPresentation('blocked').mark, 'blocked');
	assert.deepEqual(taskStatusPresentation('nope'), {
		text: 'nope',
		known: false,
		mark: 'unknown',
		strike: false,
		color: null,
	});
	assert.equal(taskStatusPresentation(null).text, '');
});

test('a line that is only a task link is a block span', () => {
	const spans = findWikilinks(linesFromText('- [[eng]]\nsee [[ab]] now\n12. [[task]]'));
	assert.deepEqual(
		spans.map((span) => [span.from, span.to, span.inner, span.block]),
		[
			[0, 9, 'eng', true],
			[14, 20, 'ab', false],
			[25, 37, 'task', true],
		],
	);
});

test('second line offsets skip the newline', () => {
	const spans = findWikilinks(linesFromText('[[a]]\n[[b]]'));
	assert.deepEqual(
		spans.map((span) => [span.from, span.to, span.inner, span.block]),
		[
			[0, 5, 'a', true],
			[6, 11, 'b', true],
		],
	);
});

test('fenced code, inline code, embeds, and escapes are not task links', () => {
	const text = ['[[keep]]', '```', '[[hide]]', '```', 'say `[[no]]` [[yes]]', '![[embed]]', '\\[[nope]]'].join(
		'\n',
	);
	assert.deepEqual(
		findWikilinks(linesFromText(text)).map((span) => span.inner),
		['keep', 'yes'],
	);
	assert.deepEqual(
		findWikilinks(linesFromText('[[a]]\n```\n[[b]]')).map((span) => span.inner),
		['a'],
	);
	assert.deepEqual(
		findWikilinks(linesFromText('~~~\n[[a]]\n~~~\n[[b]]')).map((span) => span.inner),
		['b'],
	);
});

test('a markdown checkbox line stays inline', () => {
	const spans = findWikilinks(linesFromText('- [ ] [[task]]'));
	assert.equal(spans.length, 1);
	assert.equal(spans[0]?.block, false);
	assert.equal(spans[0]?.inner, 'task');
});

test('visible ranges skip hidden lines and still honor fences above them', () => {
	const fenced = linesFromText('```\n[[inside]]\n');
	const hidden = fenced[1];
	assert.ok(hidden);
	assert.deepEqual(
		findWikilinks(fenced, [{ from: hidden.from, to: hidden.to }]).map((span) => span.inner),
		[],
	);
	const open = linesFromText('[[above]]\n[[shown]]\n');
	const shown = open[1];
	assert.ok(shown);
	assert.deepEqual(
		findWikilinks(open, [{ from: shown.from, to: shown.to }]).map((span) => span.inner),
		['shown'],
	);
});

test('frontmatter links drop the alias and the heading', () => {
	assert.equal(frontmatterLinkPath('[[Project|Alias]]'), 'Project');
	assert.equal(frontmatterLinkPath('[[Folder/Project#heading]]'), 'Folder/Project');
	assert.equal(frontmatterLinkPath('Project|Alias'), 'Project');
	assert.equal(frontmatterLinkPath('  '), '');
});

test('task link paths drop aliases and reject subpaths', () => {
	assert.equal(taskLinkPath('note|alias'), 'note');
	assert.equal(taskLinkPath('folder/note'), 'folder/note');
	assert.equal(taskLinkPath('  note  '), 'note');
	assert.equal(taskLinkPath('note#Head'), null);
	assert.equal(taskLinkPath('note#^id'), null);
	assert.equal(taskLinkPath('note#Head|alias'), null);
	assert.equal(taskLinkPath('|alias'), null);
	assert.equal(taskLinkPath('#head'), null);
});

test('card pills keep code and project and omit empty dates', () => {
	const task = {
		code: 'BPRJ001-00001',
		project: 'Billable project',
		scheduled: '2026-11-15',
		due: '',
		billable: true,
	};
	assert.deepEqual(taskCardPills(task, 'backlog', true), [
		{ kind: 'code', text: 'BPRJ001-00001' },
		{ kind: 'project', text: 'Billable project' },
		{ kind: 'scheduled', text: 'scheduled 2026-11-15' },
		{ kind: 'billable', text: 'billable' },
	]);
	assert.deepEqual(
		taskCardPills({ ...task, project: '', due: '2026-12-01', billable: false }, 'custom', false),
		[
			{ kind: 'code', text: 'BPRJ001-00001' },
			{ kind: 'scheduled', text: 'scheduled 2026-11-15' },
			{ kind: 'due', text: 'due 2026-12-01' },
			{ kind: 'status', text: 'custom' },
		],
	);
});
