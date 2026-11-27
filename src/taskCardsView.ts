import { BasesView, type BasesEntryGroup, type QueryController, type TFile } from 'obsidian';
import type MuseProjectsPlugin from './main';
import { createTaskControl, type TaskControlHandle } from './taskControl';
import { taskNoteFromFile } from './taskNote';
import { todoNoteFromFile } from './todoNote';

/**
 * Group collapse lives on BasesView at runtime. The 1.10 d.ts does not list it.
 * The heading click calls `onGroupCollapsedChange` on this view.
 */
interface CollapsibleBasesView {
	createGroupHeadingEl(group: BasesEntryGroup): HTMLElement | null;
	isGroupCollapsed(group: BasesEntryGroup): boolean;
}

/** Bases view id. A `.base` file selects it with `type: msprj-task-cards`. */
export const TASK_CARDS_VIEW = 'msprj-task-cards';

export class TaskCardsBasesView extends BasesView {
	readonly type = TASK_CARDS_VIEW;
	private readonly list: HTMLElement;
	private readonly handles: TaskControlHandle[] = [];
	/** Used when the host Obsidian build has no Bases group-fold API. */
	private readonly collapsedGroups = new Set<string>();

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		private readonly plugin: MuseProjectsPlugin,
	) {
		super(controller);
		this.list = containerEl.createDiv({ cls: 'msprj-task-cards' });
	}

	onDataUpdated(): void {
		this.render();
	}

	/** Bases calls this after a group heading click. */
	onGroupCollapsedChange(): void {
		this.render();
	}

	onunload(): void {
		this.clear();
	}

	private render(): void {
		this.clear();
		const doc = this.list.ownerDocument;
		let count = 0;
		for (const group of this.data.groupedData) {
			count += group.entries.length;
			const heading = this.groupHeading(doc, group);
			if (heading) this.list.append(heading);
			if (this.groupIsCollapsed(group)) continue;
			for (const entry of group.entries) {
				this.appendEntry(doc, entry.file);
			}
		}
		if (count === 0) {
			const empty = doc.createElement('div');
			empty.className = 'msprj-task-cards-empty';
			empty.textContent = 'No notes in this view.';
			this.list.append(empty);
		}
	}

	private collapseApi(): CollapsibleBasesView | null {
		const view = this as unknown as CollapsibleBasesView;
		if (
			typeof view.createGroupHeadingEl !== 'function' ||
			typeof view.isGroupCollapsed !== 'function'
		) {
			return null;
		}
		return view;
	}

	private groupIsCollapsed(group: BasesEntryGroup): boolean {
		if (!group.hasKey()) return false;
		const api = this.collapseApi();
		if (api) return api.isGroupCollapsed(group);
		const label = groupText(group.key);
		return label !== '' && this.collapsedGroups.has(label);
	}

	private groupHeading(doc: Document, group: BasesEntryGroup): HTMLElement | null {
		if (!group.hasKey()) return null;
		const api = this.collapseApi();
		if (api) {
			const heading = api.createGroupHeadingEl(group);
			if (!heading) return null;
			const count = doc.createElement('span');
			count.className = 'msprj-task-cards-count';
			count.textContent = String(group.entries.length);
			heading.append(count);
			return heading;
		}
		const label = groupText(group.key);
		if (!label) return null;
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = 'msprj-task-cards-group';
		const collapsed = this.collapsedGroups.has(label);
		button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		button.textContent = `${collapsed ? '▸' : '▾'} ${label} (${group.entries.length})`;
		button.addEventListener('click', () => {
			if (this.collapsedGroups.has(label)) this.collapsedGroups.delete(label);
			else this.collapsedGroups.add(label);
			this.render();
		});
		return button;
	}

	private appendEntry(doc: Document, file: TFile): void {
		const templates = this.plugin.settings.projectTemplatesPath;
		const task = taskNoteFromFile(this.plugin.app, file, templates);
		const todo = task ? null : todoNoteFromFile(this.plugin.app, file, templates);
		const note = task ?? todo;
		if (!note) {
			const button = doc.createElement('button');
			button.type = 'button';
			button.className = 'msprj-task-cards-file';
			button.textContent = file.basename;
			button.addEventListener('click', () => {
				void this.plugin.app.workspace.openLinkText(file.path, '', false);
			});
			this.list.append(button);
			return;
		}
		const { el, handle } = createTaskControl(doc, this.plugin, {
			file: note.file,
			sourcePath: note.file.path,
			mode: 'card',
			open: true,
			track: true,
			todo: todo !== null,
		});
		this.handles.push(handle);
		this.list.append(el);
	}

	private clear(): void {
		for (const handle of this.handles) handle.unload();
		this.handles.length = 0;
		this.list.replaceChildren();
	}
}

function groupText(value: { toString(): string } | undefined): string {
	if (!value) return '';
	const text = value.toString().trim();
	if (!text || text === '[object Object]' || text === 'null') return '';
	return text;
}
