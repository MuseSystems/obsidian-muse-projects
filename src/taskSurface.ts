import {
	Prec,
	RangeSetBuilder,
	StateEffect,
	type EditorState,
	type Extension,
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type ViewUpdate,
} from '@codemirror/view';
import {
	MarkdownRenderChild,
	MarkdownView,
	Menu,
	TFile,
	editorInfoField,
	editorLivePreviewField,
	type MarkdownPostProcessorContext,
} from 'obsidian';
import type { ClockScan } from './clockFlow';
import type MuseProjectsPlugin from './main';
import { CLOCK_MENU_SECTION, placeMenuSections } from './menuSections';
import {
	addTaskMenuItems,
	addTodoMenuItems,
	clearTaskControls,
	createTaskControl,
	refreshTaskControls,
	type TaskControlHandle,
} from './taskControl';
import { taskNoteFromFile, type TaskNoteRef } from './taskNote';
import { owningTaskOfTodo, todoNoteFromFile } from './todoNote';
import { findWikilinks, taskLinkPath, type TextLine } from './wikilinks';

const taskControlRefresh = StateEffect.define<null>();

interface TaskEditor {
	bump(): void;
}

const editors = new Set<TaskEditor>();
let editorRefreshPending = false;

export function refreshTaskEditors(): void {
	if (editorRefreshPending) return;
	editorRefreshPending = true;
	queueMicrotask(() => {
		editorRefreshPending = false;
		for (const editor of [...editors]) editor.bump();
	});
}

export function clearTaskEditors(): void {
	editors.clear();
	editorRefreshPending = false;
}

export function taskControlExtension(plugin: MuseProjectsPlugin): Extension {
	const pluginView = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(readonly view: EditorView) {
				editors.add(this);
				this.decorations = buildTaskDecorations(view, plugin);
			}

			update(update: ViewUpdate): void {
				try {
					if (!this.needsRebuild(update)) return;
					this.decorations = buildTaskDecorations(update.view, plugin);
				} catch (err) {
					console.error('Muse Projects: task control decorations failed', err);
					this.decorations = Decoration.none;
				}
			}

			destroy(): void {
				editors.delete(this);
			}

			bump(): void {
				if (!this.view.dom.isConnected) {
					editors.delete(this);
					return;
				}
				try {
					this.view.dispatch({ effects: taskControlRefresh.of(null) });
				} catch (err) {
					console.error('Muse Projects: task control refresh failed', err);
					editors.delete(this);
				}
			}

			private needsRebuild(update: ViewUpdate): boolean {
				if (update.docChanged || update.viewportChanged) return true;
				if (livePreview(update.state) !== livePreview(update.startState)) return true;
				for (const tr of update.transactions) {
					for (const effect of tr.effects) {
						if (effect.is(taskControlRefresh)) return true;
					}
				}
				return false;
			}
		},
		{
			decorations: (value) => value.decorations,
		},
	);
	return Prec.highest(pluginView);
}

class TaskControlWidget extends WidgetType {
	private readonly key: string;

	constructor(
		private readonly plugin: MuseProjectsPlugin,
		private readonly task: TaskNoteRef,
		private readonly sourcePath: string,
		private readonly mode: 'card' | 'link',
		private readonly block: boolean,
		private readonly todo: boolean,
		private readonly clocked: boolean,
	) {
		super();
		this.key = [
			task.file.path,
			todo ? 'todo' : 'task',
			task.status,
			task.code,
			task.title,
			task.project,
			task.scheduled,
			task.due,
			task.billable ? '1' : '0',
			mode,
			block ? '1' : '0',
			clocked ? '1' : '0',
		].join('\0');
	}

	eq(other: WidgetType): boolean {
		return other instanceof TaskControlWidget && other.key === this.key;
	}

	toDOM(view: EditorView): HTMLElement {
		const doc = view.dom.ownerDocument;
		const { el } = createTaskControl(doc, this.plugin, {
			file: this.task.file,
			sourcePath: this.sourcePath,
			mode: this.mode,
			open: false,
			track: false,
			todo: this.todo,
		});
		if (this.mode !== 'card') {
			if (this.block) el.classList.add('is-line');
			return el;
		}
		const bar = doc.createElement('div');
		bar.className = 'msprj-task-note-bar';
		bar.setAttribute('contenteditable', 'false');
		bar.append(el);
		return bar;
	}

	ignoreEvent(): boolean {
		return true;
	}

	get estimatedHeight(): number {
		return this.mode === 'card' || this.block ? 72 : -1;
	}
}

class TaskControlChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly handle: TaskControlHandle,
	) {
		super(containerEl);
	}

	onunload(): void {
		this.handle.unload();
	}
}

/** Reading view: task controls in place of wikilinks to tasks. */
export function decorateTaskPreview(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	plugin: MuseProjectsPlugin,
): void {
	for (const node of Array.from(el.querySelectorAll('a.internal-link'))) {
		if (node instanceof HTMLAnchorElement) mountLinkControl(node, ctx, plugin);
	}
}

export class TaskHost {
	/** Path of the task that holds the only open clock, or null. */
	clockedPath: string | null = null;
	private readonly noteCards = new Map<MarkdownView, NoteCard>();
	private placeTries = 0;

	constructor(private readonly plugin: MuseProjectsPlugin) {}

	start(): void {
		this.plugin.registerEditorExtension(taskControlExtension(this.plugin));
		this.plugin.registerMarkdownPostProcessor(
			(el, ctx) => decorateTaskPreview(el, ctx, this.plugin),
			100,
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile) this.addFileItems(menu, file);
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('editor-menu', (menu, _editor, info) => {
				const file = info.file;
				if (file) this.addFileItems(menu, file);
			}),
		);
		this.plugin.registerEvent(this.plugin.app.workspace.on('layout-change', () => this.syncNoteCards()));
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', () => this.syncNoteCards()),
		);
		this.plugin.clockWatch.subscribe((scan) => this.applyClock(scan));
		this.plugin.register(() => {
			this.clockedPath = null;
			for (const view of [...this.noteCards.keys()]) this.dropNoteCard(view);
			clearTaskControls();
			clearTaskEditors();
		});
	}

	private applyClock(scan: ClockScan): void {
		const open = scan.opens.length === 1 ? scan.opens[0] : undefined;
		this.clockedPath = open ? open.file.path : null;
		refreshTaskControls();
		refreshTaskEditors();
		this.syncNoteCards();
	}

	private syncNoteCards(): void {
		this.placeTries = 0;
		this.placeNoteCards();
	}

	private placeNoteCards(): void {
		const seen = new Set<MarkdownView>();
		let waiting = false;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			seen.add(view);
			if (!this.ensureNoteCard(view)) waiting = true;
		});
		for (const view of [...this.noteCards.keys()]) {
			if (!seen.has(view) || !view.containerEl.isConnected) this.dropNoteCard(view);
		}
		if (waiting && this.placeTries < 8) {
			this.placeTries += 1;
			window.requestAnimationFrame(() => this.placeNoteCards());
		}
	}

	/** True when the leaf needs no card, or the card is in place. */
	private ensureNoteCard(view: MarkdownView): boolean {
		const file = view.file;
		const templates = this.plugin.settings.projectTemplatesPath;
		const task =
			file instanceof TFile ? taskNoteFromFile(this.plugin.app, file, templates) : null;
		const todo =
			!task && file instanceof TFile ? todoNoteFromFile(this.plugin.app, file, templates) : null;
		if ((!task && !todo) || !(file instanceof TFile)) {
			this.dropNoteCard(view);
			return true;
		}
		const current = this.noteCards.get(view);
		if (!current || current.path !== file.path) {
			this.dropNoteCard(view);
			const { el, handle } = createTaskControl(view.containerEl.ownerDocument, this.plugin, {
				file,
				sourcePath: file.path,
				mode: 'card',
				open: false,
				track: true,
				todo: todo !== null,
			});
			el.classList.add('msprj-task-note-card');
			this.noteCards.set(view, { path: file.path, el, handle });
		}
		const card = this.noteCards.get(view);
		return card ? placeTaskNoteCard(view, card.el) : false;
	}

	private dropNoteCard(view: MarkdownView): void {
		const card = this.noteCards.get(view);
		if (!card) return;
		card.handle.unload();
		card.el.remove();
		this.noteCards.delete(view);
	}

	private addFileItems(menu: Menu, file: TFile): void {
		const templates = this.plugin.settings.projectTemplatesPath;
		const task = taskNoteFromFile(this.plugin.app, file, templates);
		if (task) {
			placeMenuSections(menu);
			addTaskMenuItems(menu, this.plugin, task, { open: false, clockSection: CLOCK_MENU_SECTION });
			return;
		}
		const todo = todoNoteFromFile(this.plugin.app, file, templates);
		if (!todo) return;
		placeMenuSections(menu);
		addTodoMenuItems(menu, this.plugin, todo, { open: false, clockSection: CLOCK_MENU_SECTION });
	}
}

interface NoteCard {
	path: string;
	el: HTMLElement;
	handle: TaskControlHandle;
}

function placeTaskNoteCard(view: MarkdownView, el: HTMLElement): boolean {
	const preview = view.getMode() === 'preview';
	const scope = preview
		? view.containerEl.querySelector('.markdown-preview-view')
		: view.containerEl.querySelector('.markdown-source-view');
	if (!(scope instanceof HTMLElement)) return false;

	const metadata = scope.querySelector('.metadata-container');
	if (metadata instanceof HTMLElement && !metadata.closest('.cm-content')) {
		if (metadata.nextElementSibling !== el) metadata.insertAdjacentElement('afterend', el);
		return true;
	}

	if (preview) {
		const header = scope.querySelector('.markdown-preview-sizer .mod-header.mod-ui');
		if (!(header instanceof HTMLElement)) return false;
		if (header.lastElementChild !== el) header.append(el);
		return true;
	}

	const editor = scope.querySelector(':scope > .cm-editor');
	if (!(editor instanceof HTMLElement)) return false;
	if (editor.previousElementSibling !== el) scope.insertBefore(el, editor);
	return true;
}

function mountLinkControl(
	anchor: HTMLAnchorElement,
	ctx: MarkdownPostProcessorContext,
	plugin: MuseProjectsPlugin,
): void {
	const raw = anchor.getAttribute('data-href') ?? '';
	let href = raw;
	try {
		href = decodeURIComponent(raw);
	} catch {
		href = raw;
	}
	const path = taskLinkPath(href);
	if (!path) return;
	const dest = plugin.app.metadataCache.getFirstLinkpathDest(path, ctx.sourcePath);
	if (!dest) return;
	const task = taskNoteFromFile(plugin.app, dest, plugin.settings.projectTemplatesPath);
	const todo = task ? null : todoNoteFromFile(plugin.app, dest, plugin.settings.projectTemplatesPath);
	const file = task?.file ?? todo?.file;
	if (!file) return;
	const block = isSoleContent(anchor);
	if (block) markListHost(anchor);
	const { el, handle } = createTaskControl(anchor.ownerDocument, plugin, {
		file,
		sourcePath: ctx.sourcePath,
		mode: 'link',
		open: false,
		track: true,
		todo: todo !== null,
	});
	anchor.replaceWith(el);
	ctx.addChild(new TaskControlChild(el, handle));
}

function isSoleContent(el: HTMLElement): boolean {
	const parent = el.parentElement;
	if (!parent) return false;
	const tag = parent.tagName;
	if (tag !== 'P' && tag !== 'LI' && !/^H[1-6]$/.test(tag)) return false;
	for (const child of Array.from(parent.childNodes)) {
		if (child === el) continue;
		if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() === '') continue;
		return false;
	}
	return true;
}

function markListHost(anchor: HTMLAnchorElement): void {
	const parent = anchor.parentElement;
	if (!parent) return;
	if (parent.tagName === 'LI') {
		parent.classList.add('msprj-task-link-host');
		return;
	}
	if (parent.parentElement?.tagName === 'LI') {
		parent.parentElement.classList.add('msprj-task-link-host');
	}
}

function buildTaskDecorations(view: EditorView, plugin: MuseProjectsPlugin): DecorationSet {
	try {
		return buildTaskDecorationsInner(view, plugin);
	} catch (err) {
		console.error('Muse Projects: task control decorations failed', err);
		return Decoration.none;
	}
}

function buildTaskDecorationsInner(view: EditorView, plugin: MuseProjectsPlugin): DecorationSet {
	if (!livePreview(view.state)) return Decoration.none;
	const info = view.state.field(editorInfoField);
	const sourcePath = info.file?.path ?? '';
	const doc = view.state.doc;
	const clockedPath = plugin.taskHost?.clockedPath ?? null;
	const templates = plugin.settings.projectTemplatesPath;
	const lines: TextLine[] = [];
	for (let n = 1; n <= doc.lines; n++) {
		const line = doc.line(n);
		lines.push({ text: line.text, from: line.from, to: line.to });
	}
	const contentStart = frontmatterContentStart(lines);
	const pending: { from: number; to: number; deco: Decoration }[] = [];

	for (const span of findWikilinks(lines, view.visibleRanges)) {
		if (span.from < contentStart) continue;
		const path = taskLinkPath(span.inner);
		if (!path) continue;
		const dest = plugin.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
		if (!dest) continue;
		const task = taskNoteFromFile(plugin.app, dest, templates);
		const todo = task ? null : todoNoteFromFile(plugin.app, dest, templates);
		if (!task && !todo) continue;
		const note: TaskNoteRef = task ?? {
			file: todo!.file,
			code: todo!.code,
			title: todo!.title,
			status: todo!.status,
			project: '',
			scheduled: todo!.scheduled,
			due: todo!.due,
			billable: false,
		};
		const owner = todo ? owningTaskOfTodo(plugin.app, todo.file, templates) : null;
		const clocked = task
			? clockedPath === task.file.path
			: owner !== null && owner.file.path === clockedPath;
		pending.push({
			from: span.from,
			to: span.to,
			deco: Decoration.replace({
				widget: new TaskControlWidget(
					plugin,
					note,
					sourcePath,
					'link',
					span.block,
					todo !== null,
					clocked,
				),
			}),
		});
	}

	pending.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide || a.to - b.to);
	const builder = new RangeSetBuilder<Decoration>();
	for (const item of pending) builder.add(item.from, item.to, item.deco);
	return builder.finish();
}

function frontmatterContentStart(lines: readonly TextLine[]): number {
	const first = lines[0];
	if (!first || !/^---[ \t]*$/.test(first.text)) return 0;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (line && /^---[ \t]*$/.test(line.text)) return line.to + 1;
	}
	return 0;
}

function livePreview(state: EditorState): boolean {
	try {
		return state.field(editorLivePreviewField);
	} catch {
		return false;
	}
}
