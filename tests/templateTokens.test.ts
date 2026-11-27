import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	applyTemplateTokens,
	normalizeTemplateStem,
	storedOrgChildTemplateStem,
	storedTaskTemplateStem,
	type TemplateTokenContext,
} from '../src/templateTokens';

function ctx(partial: Partial<TemplateTokenContext> = {}): TemplateTokenContext {
	return {
		title: 'note-title',
		dateFormat: 'YYYY-MM-DD',
		timeFormat: 'HH:mm',
		formatNow: (format) => `F(${format})`,
		fields: {},
		...partial,
	};
}

test('core tokens and field tokens replace in one pass', () => {
	const text = '{{title}} {{date}} {{time}} {{date:YYYY-MM-DD HH:mm}} {{msprj_prj_name}} {{missing}}';
	const result = applyTemplateTokens(
		text,
		ctx({
			fields: { msprj_prj_name: 'Acme $&' },
		}),
	);
	assert.equal(
		result,
		'note-title F(YYYY-MM-DD) F(HH:mm) F(YYYY-MM-DD HH:mm) Acme $& {{missing}}',
	);
});

test('frontmatter tokens are escaped and body tokens stay literal', () => {
	const raw = [
		'---',
		'msprj_tsk_title: "{{msprj_tsk_title}}"',
		"msprj_tsk_note: '{{msprj_tsk_note}}'",
		'msprj_tsk_billable: {{msprj_tsk_billable}}',
		'msprj_prj_name: {{msprj_prj_name}}',
		'---',
		'',
		'# {{msprj_tsk_title}}',
		'',
	].join('\n');
	const result = applyTemplateTokens(
		raw,
		ctx({
			fields: {
				msprj_tsk_title: 'Fix "quoted" bug',
				msprj_tsk_note: "it's",
				msprj_tsk_billable: 'true',
				msprj_prj_name: 'A: B',
			},
		}),
	);
	assert.equal(
		result,
		[
			'---',
			'msprj_tsk_title: "Fix \\"quoted\\" bug"',
			"msprj_tsk_note: 'it''s'",
			'msprj_tsk_billable: true',
			'msprj_prj_name: "A: B"',
			'---',
			'',
			'# Fix "quoted" bug',
			'',
		].join('\n'),
	);
});

test('a backslash inside a quoted frontmatter token stays a YAML escape', () => {
	const raw = '---\nmsprj_tsk_title: "{{msprj_tsk_title}}"\n---\n';
	const result = applyTemplateTokens(
		raw,
		ctx({ fields: { msprj_tsk_title: 'C:\\x\\temp' } }),
	);
	assert.equal(result, '---\nmsprj_tsk_title: "C:\\\\x\\\\temp"\n---\n');
});

test('a field value is not scanned for further tokens', () => {
	const result = applyTemplateTokens('{{msprj_prj_name}}', ctx({ fields: { msprj_prj_name: '{{title}}' } }));
	assert.equal(result, '{{title}}');
});

test('blank and spaced tokens', () => {
	assert.equal(applyTemplateTokens('{{}} {{ date }}', ctx()), '{{}} F(YYYY-MM-DD)');
	assert.equal(applyTemplateTokens('{{time: HH:mm:ss }}', ctx()), 'F(HH:mm:ss)');
});

test('template stems reject paths and strip a trailing extension', () => {
	assert.equal(normalizeTemplateStem(' meeting.md '), 'meeting');
	assert.equal(normalizeTemplateStem('task/meeting'), null);
	assert.equal(normalizeTemplateStem('..'), null);
	assert.equal(normalizeTemplateStem(''), null);
	assert.equal(normalizeTemplateStem(12), null);
});

test('task template stem is stored only when it differs from the organization', () => {
	assert.equal(storedTaskTemplateStem(null, null), null);
	assert.equal(storedTaskTemplateStem('meeting', 'meeting'), null);
	assert.equal(storedTaskTemplateStem('meeting', null), 'meeting');
	assert.equal(storedTaskTemplateStem(null, 'meeting'), 'default');
	assert.equal(storedTaskTemplateStem('default', 'meeting'), 'default');
});

test('organization child template stem omits the vault default', () => {
	assert.equal(storedOrgChildTemplateStem(null), null);
	assert.equal(storedOrgChildTemplateStem('default'), null);
	assert.equal(storedOrgChildTemplateStem('fixed-bid.md'), 'fixed-bid');
});
