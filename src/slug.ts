/**
 * Narrow folder-name suggestion from a display name.
 * Lowercase; non [a-z0-9] → hyphen; collapse/trim hyphens. Dots are stripped.
 */
export function suggestFolderSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/** Normalize project codes for use in identifiers. */
export function normalizeProjectCode(code: string): string {
	return code.trim().toUpperCase();
}

/**
 * Null when `code` is empty or already a code.
 * A code is letters, digits, hyphens, or underscores, and starts with a letter or digit.
 * Callers still treat an empty code as missing.
 */
export function identifierCodeError(code: string): string | null {
	const normalized = normalizeProjectCode(code);
	if (!normalized || /^[A-Z0-9][A-Z0-9_-]*$/.test(normalized)) {
		return null;
	}
	return 'Use letters, digits, hyphens, or underscores, starting with a letter or digit.';
}

/** Organization codes use the same identifier rules as project codes. */
export function normalizeOrganizationCode(code: string): string {
	return normalizeProjectCode(code);
}

/** Managed note basename: `_org` or `_prj`, code slug, then name slug when present. */
function suggestPrefixedBasename(prefix: '_org' | '_prj', code: string, name = ''): string {
	const codePart = suggestFolderSlug(code);
	if (!codePart) {
		return '';
	}
	const namePart = suggestFolderSlug(name);
	return namePart ? `${prefix}-${codePart}-${namePart}` : `${prefix}-${codePart}`;
}

/** Organization note basename, no extension. Example: _org-muse-muse-systems */
export function suggestOrganizationBasename(code: string, name = ''): string {
	return suggestPrefixedBasename('_org', code, name);
}

/** Project note basename, no extension. Example: _prj-eng-012-client-engagement */
export function suggestProjectBasename(code: string, title = ''): string {
	return suggestPrefixedBasename('_prj', code, title);
}

/**
 * A single markdown file name.
 * Keeps a trailing `.md`; adds one when it is missing.
 * Empty when blank, `.` / `..`, or a path.
 */
export function normalizeNoteFilename(name: string): string {
	const trimmed = name.trim();
	if (!trimmed || trimmed === '.' || trimmed === '..') {
		return '';
	}
	if (trimmed.includes('/') || trimmed.includes('\\')) {
		return '';
	}
	const base = trimmed.toLowerCase().endsWith('.md')
		? trimmed.slice(0, -3).trim()
		: trimmed;
	if (!base || base === '.' || base === '..') {
		return '';
	}
	if (base.includes('/') || base.includes('\\')) {
		return '';
	}
	return `${base}.md`;
}

/** Format task code: PROJECTCODE-001. The code has no `task-` prefix. */
export function formatTaskCode(projectCode: string, taskId: number, pad = 3): string {
	const code = normalizeProjectCode(projectCode);
	return `${code}-${String(taskId).padStart(pad, '0')}`;
}

/**
 * Task note basename (no extension).
 * `task-` is only the file name, so the archetype is visible. The code stays `ENG-012-001`.
 * Example: task-eng-012-001-write-runbook
 */
export function suggestTaskBasename(taskCode: string, title: string): string {
	const codePart = taskCode.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
	const titlePart = suggestFolderSlug(title);
	const stem = titlePart ? `${codePart}-${titlePart}` : codePart;
	return stem ? `task-${stem}` : '';
}

/**
 * To-do label: `todo-00042`, plus the owning artifact's code when it has one.
 * Example: `todo-00042-eng-012-001`.
 */
export function formatTodoCode(id: number, projectCode: string | null, pad = 5): string {
	const base = `todo-${String(id).padStart(pad, '0')}`;
	const segment = (projectCode ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return segment ? `${base}-${segment}` : base;
}

/** Document root basename, no extension. Example: `_doc-product-design`. */
export function suggestDocumentBasename(title: string): string {
	const slug = suggestFolderSlug(title);
	return slug ? `_doc-${slug}` : '';
}

/**
 * Subordinate note basename, no extension.
 * The prefix is the archetype id. Example: `requirement-sign-off`.
 */
export function suggestSubordinateBasename(prefix: string, title: string): string {
	const slug = suggestFolderSlug(title);
	return slug ? `${prefix}-${slug}` : '';
}

/** To-do basename (no extension). Example: `todo-00042-eng-012-001-send-the-draft`. */
export function suggestTodoBasename(todoCode: string, title: string): string {
	const titlePart = suggestFolderSlug(title);
	if (!titlePart) {
		return todoCode;
	}
	return `${todoCode}-${titlePart}`;
}
