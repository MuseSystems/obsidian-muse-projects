/** Filename stem of `<archetype>/default.md`, the vault fallback for that archetype. */
export const VAULT_DEFAULT_TEMPLATE_STEM = 'default';

export interface TemplateTokenContext {
	/** New note basename without `.md`. Core Templates `{{title}}`. */
	title: string;
	/** Core Templates date format. Used by bare `{{date}}`. */
	dateFormat: string;
	/** Core Templates time format. Used by bare `{{time}}`. */
	timeFormat: string;
	/** Format one Moment pattern. Called once per date/time token. */
	formatNow: (format: string) => string;
	/** Create-time values keyed by property name. Missing keys are left written. */
	fields: Record<string, string>;
}

/**
 * One left-to-right pass.
 * `{{title}}`, `{{date}}`, `{{time}}`, and `{{date:FORMAT}}` / `{{time:FORMAT}}` match core Templates.
 * Any other known field is replaced. Unknown tokens stay so the author can see them.
 * A replacement is not scanned again.
 * Frontmatter tokens are escaped for the quotes around them, or written as a YAML scalar.
 * Body tokens are literal, so a heading does not gain backslashes.
 */
export function applyTemplateTokens(text: string, ctx: TemplateTokenContext): string {
	const split = splitFrontmatter(text);
	if (!split) {
		return replaceTokens(text, ctx, false);
	}
	return replaceTokens(split.head, ctx, true) + replaceTokens(split.body, ctx, false);
}

function splitFrontmatter(text: string): { head: string; body: string } | null {
	const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
	if (!match || match.index !== 0) {
		return null;
	}
	return { head: match[0], body: text.slice(match[0].length) };
}

function replaceTokens(text: string, ctx: TemplateTokenContext, yaml: boolean): string {
	return text.replace(/\{\{([^{}]*)\}\}/g, (match, raw: string, offset: number) => {
		const value = resolveToken(raw, ctx);
		if (value === undefined) {
			return match;
		}
		if (!yaml) {
			return value;
		}
		return yamlScalar(value, quoteStyleAt(text, offset));
	});
}

/** Undefined keeps the original token. */
function resolveToken(raw: string, ctx: TemplateTokenContext): string | undefined {
	const token = raw.trim();
	if (!token) {
		return undefined;
	}
	const timed = /^(date|time)(?::([\s\S]*))?$/.exec(token);
	if (timed) {
		const kind = timed[1];
		const explicit = timed[2]?.trim();
		const format = explicit || (kind === 'date' ? ctx.dateFormat : ctx.timeFormat);
		if (!format) {
			return undefined;
		}
		return ctx.formatNow(format);
	}
	if (token === 'title') {
		return ctx.title;
	}
	if (Object.prototype.hasOwnProperty.call(ctx.fields, token)) {
		return ctx.fields[token] ?? '';
	}
	return undefined;
}

function quoteStyleAt(text: string, offset: number): 'double' | 'single' | 'none' {
	let double = false;
	let single = false;
	for (let i = 0; i < offset; i++) {
		const ch = text.charAt(i);
		if (double) {
			if (ch === '\\') {
				i += 1;
				continue;
			}
			if (ch === '"') {
				double = false;
			}
			continue;
		}
		if (single) {
			if (ch === "'" && text.charAt(i + 1) === "'") {
				i += 1;
				continue;
			}
			if (ch === "'") {
				single = false;
			}
			continue;
		}
		if (ch === '"') {
			double = true;
		} else if (ch === "'") {
			single = true;
		}
	}
	if (double) {
		return 'double';
	}
	if (single) {
		return 'single';
	}
	return 'none';
}

const YAML_11_WORD = /^(?:y|n|yes|no|on|off)$/i;

function yamlScalar(value: string, style: 'double' | 'single' | 'none'): string {
	if (style === 'double') {
		return JSON.stringify(value).slice(1, -1);
	}
	if (style === 'single') {
		return value.replace(/'/g, "''");
	}
	return yamlPlain(value) ?? JSON.stringify(value);
}

function yamlPlain(value: string): string | null {
	if (value === 'true' || value === 'false' || value === 'null' || value === '~') {
		return value;
	}
	if (YAML_11_WORD.test(value)) {
		return null;
	}
	if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
		return value;
	}
	if (/^[A-Za-z0-9][A-Za-z0-9_./:+-]*$/.test(value)) {
		return value;
	}
	return null;
}

/**
 * Template identity stored on an owner note.
 * A trailing `.md` is stripped. Paths and blank values are rejected.
 */
export function normalizeTemplateStem(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	let stem = value.trim();
	if (stem.toLowerCase().endsWith('.md')) {
		stem = stem.slice(0, -3).trim();
	}
	if (!stem || stem === '.' || stem === '..') {
		return null;
	}
	if (stem.includes('/') || stem.includes('\\') || stem.includes('..')) {
		return null;
	}
	return stem;
}

/**
 * Stem to write on a new project, or null when the choice matches the organization.
 * Null `chosenStem` means the vault default (`default.md`, else the built-in note).
 */
export function storedTaskTemplateStem(
	chosenStem: string | null,
	organizationStem: string | null,
): string | null {
	const selected = normalizeTemplateStem(chosenStem) ?? VAULT_DEFAULT_TEMPLATE_STEM;
	const inherited = normalizeTemplateStem(organizationStem) ?? VAULT_DEFAULT_TEMPLATE_STEM;
	if (selected === inherited) {
		return null;
	}
	return selected;
}

/**
 * Stem to write on a new organization for a child archetype.
 * The vault default is not stored; an empty property means that default.
 */
export function storedOrgChildTemplateStem(chosenStem: string | null): string | null {
	const stem = normalizeTemplateStem(chosenStem);
	if (!stem || stem === VAULT_DEFAULT_TEMPLATE_STEM) {
		return null;
	}
	return stem;
}
