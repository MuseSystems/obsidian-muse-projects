import { App, getFrontMatterInfo, TFile } from 'obsidian';

/** Sanitize a display title for use as a single-line ATX heading. */
export function sanitizeNoteHeading(title: string): string {
	return title.replace(/[\r\n]+/g, ' ').trim();
}

/** True when the body already has a level-1 ATX heading with text. */
export function hasLevelOneHeading(content: string): boolean {
	const info = getFrontMatterInfo(content);
	const body = content.slice(info.contentStart);
	return /^[ \t]*#(?!#)[ \t]+\S/m.test(body);
}

/**
 * Insert a level-1 heading when the note does not already have one.
 * An existing H1 is left alone so a note template can own the heading.
 */
export async function ensureNoteHeadingTitle(
	app: App,
	file: TFile,
	title: string,
): Promise<void> {
	const data = await app.vault.read(file);
	if (hasLevelOneHeading(data)) {
		return;
	}
	await setNoteHeadingTitle(app, file, title);
}

/**
 * Set the note's first level-1 ATX heading to `title`.
 * Inserts an H1 after frontmatter if none exists. Does not rename the file.
 */
export async function setNoteHeadingTitle(
	app: App,
	file: TFile,
	title: string,
): Promise<void> {
	const heading = sanitizeNoteHeading(title);
	if (!heading) {
		return;
	}

	await app.vault.process(file, (data) => {
		const info = getFrontMatterInfo(data);
		const prefix = data.slice(0, info.contentStart);
		const body = data.slice(info.contentStart);
		const h1 = /^([ \t]*)#(?!#)[ \t]+[^\n]*/m;
		if (h1.test(body)) {
			return prefix + body.replace(h1, `$1# ${heading}`);
		}

		const leading = body.match(/^\s*/)?.[0] ?? '';
		const rest = body.slice(leading.length);
		const spacer = rest.length > 0 ? '\n\n' : '\n';
		return `${prefix}${leading}# ${heading}${spacer}${rest}`;
	});
}
