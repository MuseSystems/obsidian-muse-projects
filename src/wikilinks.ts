export interface TextLine {
	text: string;
	from: number;
	to: number;
}

export interface WikilinkSpan {
	/** Replacement start. The line start when `block` is set. */
	from: number;
	/** Replacement end, exclusive. The line end when `block` is set. */
	to: number;
	/** Text between `[[` and `]]`. */
	inner: string;
	/** The line is only an optional list marker and this link. */
	block: boolean;
}

interface Fence {
	char: '`' | '~';
	len: number;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const BLOCK_RE = /^[ \t]*(?:[-*+]|\d+[.)])?[ \t]*\[\[[^\]\r\n]+\]\][ \t]*$/;

/**
 * Wikilinks outside fenced code and inline code. Embeds (`![[`) are skipped.
 * When `ranges` is set, only links that intersect one of them are returned.
 * Fence lines outside those ranges still open and close fences.
 */
export function findWikilinks(
	lines: readonly TextLine[],
	ranges?: readonly { from: number; to: number }[],
): WikilinkSpan[] {
	const spans: WikilinkSpan[] = [];
	let fence: Fence | null = null;
	for (const line of lines) {
		const fenceMatch = FENCE_RE.exec(line.text);
		if (fenceMatch) {
			const token = fenceMatch[1] ?? '';
			const char = token.charAt(0);
			if ((char === '`' || char === '~') && token.length > 0) {
				if (!fence) {
					fence = { char, len: token.length };
				} else if (char === fence.char && token.length >= fence.len) {
					fence = null;
				}
			}
			continue;
		}
		if (fence) continue;
		if (ranges && !lineIntersects(line, ranges)) continue;
		collectLine(line, spans);
	}
	return spans;
}

function lineIntersects(line: TextLine, ranges: readonly { from: number; to: number }[]): boolean {
	for (const range of ranges) {
		if (line.to >= range.from && line.from <= range.to) return true;
	}
	return false;
}

/** Split a document on `\n` for tests and callers that do not have editor lines. */
export function linesFromText(text: string): TextLine[] {
	const parts = text.split('\n');
	const lines: TextLine[] = [];
	let from = 0;
	for (const part of parts) {
		const line = part.endsWith('\r') ? part.slice(0, -1) : part;
		lines.push({ text: line, from, to: from + line.length });
		from += line.length + 1;
	}
	return lines;
}

/** Split the inside of a wikilink. The alias is dropped. A heading or block stays on `subpath`. */
export function splitWikilink(inner: string): { path: string; subpath: string } {
	const aliasAt = inner.indexOf('|');
	const body = (aliasAt >= 0 ? inner.slice(0, aliasAt) : inner).trim();
	const hash = body.indexOf('#');
	if (hash < 0) return { path: body, subpath: '' };
	return { path: body.slice(0, hash).trim(), subpath: body.slice(hash).trim() };
}

/**
 * Note path from a frontmatter link.
 * Optional `[[` `]]` are stripped. An alias and a heading or block are dropped.
 */
export function frontmatterLinkPath(raw: string): string {
	let text = raw.trim();
	if (text.startsWith('[[') && text.endsWith(']]')) {
		text = text.slice(2, -2).trim();
	}
	return splitWikilink(text).path;
}

/** Path of a wikilink that refers to a whole note. Heading, block, and empty targets are null. */
export function taskLinkPath(inner: string): string | null {
	const { path, subpath } = splitWikilink(inner);
	if (!path || subpath) return null;
	return path;
}

function collectLine(line: TextLine, spans: WikilinkSpan[]): void {
	const text = line.text;
	const found: { offset: number; end: number; inner: string }[] = [];
	let i = 0;
	while (i < text.length) {
		if (text.charAt(i) === '`') {
			i = skipCode(text, i);
			continue;
		}
		if (!isLinkStart(text, i)) {
			i += 1;
			continue;
		}
		const close = text.indexOf(']]', i + 2);
		if (close < 0) break;
		const inner = text.slice(i + 2, close);
		if (inner.length > 0 && !inner.includes('[') && !inner.includes(']')) {
			found.push({ offset: i, end: close + 2, inner });
		}
		i = close + 2;
	}
	const block = found.length === 1 && BLOCK_RE.test(text);
	for (const link of found) {
		spans.push({
			from: block ? line.from : line.from + link.offset,
			to: block ? line.to : line.from + link.end,
			inner: link.inner,
			block,
		});
	}
}

function skipCode(text: string, i: number): number {
	let n = 0;
	while (text.charAt(i + n) === '`') n += 1;
	const token = '`'.repeat(n);
	const close = text.indexOf(token, i + n);
	if (close < 0) return text.length;
	return close + n;
}

function isLinkStart(text: string, i: number): boolean {
	if (text.charAt(i) !== '[' || text.charAt(i + 1) !== '[') return false;
	const prev = i > 0 ? text.charAt(i - 1) : '';
	return prev !== '!' && prev !== '\\';
}
