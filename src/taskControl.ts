import { Menu, TFile } from 'obsidian';
import { runTaskClock } from './clockFlow';
import { editTimeOnTask } from './editTimeModal';
import type MuseProjectsPlugin from './main';
import { cycleTaskStatus, taskNoteFromFile, writeTaskStatus, type TaskNoteRef } from './taskNote';
import {
	cycleTodoStatus,
	owningTaskOfTodo,
	todoNoteFromFile,
	writeTodoStatus,
	type TodoNoteRef,
} from './todoNote';
import { taskCardPills } from './taskCardPills';
import {
	TASK_STATUSES,
	nextCycledStatus,
	taskStatusPresentation,
	type TaskStatusPresentation,
} from './taskStatuses';
import type { TaskCardPill } from './taskCardPills';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface TaskControlSpec {
	file: TaskNoteRef['file'];
	sourcePath: string;
	/** `card` is the bordered task card. `link` is a circle and title in prose. */
	mode: 'card' | 'link';
	/** A click on the card opens the note. The card on its own note leaves this false. */
	open: boolean;
	/** Reading view and Bases register for metadata refresh. Editor widgets rebuild instead. */
	track: boolean;
	/** To-do card: status and dates, without the clock or the billable pill. */
	todo?: boolean;
}

export interface TaskControlHandle {
	paint(): void;
	unload(): void;
}

const live = new Set<TaskControlHandle>();

export function refreshTaskControls(): void {
	for (const handle of [...live]) handle.paint();
}

export function clearTaskControls(): void {
	live.clear();
}

export function createTaskControl(
	doc: Document,
	plugin: MuseProjectsPlugin,
	spec: TaskControlSpec,
): { el: HTMLElement; handle: TaskControlHandle } {
	const card = spec.mode === 'card';
	const root = doc.createElement(card ? 'div' : 'span');
	root.className = `msprj-task-control ${card ? 'is-card' : 'is-link'}${spec.open ? ' is-openable' : ''}`;
	root.dataset.mode = spec.mode;
	root.dataset.kind = spec.todo ? 'todo' : 'task';
	root.setAttribute('contenteditable', 'false');
	root.setAttribute('spellcheck', 'false');

	const mark = doc.createElement('button');
	mark.type = 'button';
	mark.className = 'msprj-task-mark';

	const copy = doc.createElement(card ? 'div' : 'span');
	copy.className = 'msprj-task-copy';

	const title = spec.mode === 'link' ? doc.createElement('button') : doc.createElement('span');
	if (title instanceof HTMLButtonElement) title.type = 'button';
	title.className = 'msprj-task-title';

	const meta = doc.createElement(card ? 'div' : 'span');
	meta.className = 'msprj-task-meta';
	meta.hidden = !card;

	copy.append(title, meta);
	root.append(mark, copy);

	const draw = (): void => {
		if (spec.todo) {
			drawTodo();
			return;
		}
		const task = taskNoteFromFile(plugin.app, spec.file, plugin.settings.projectTemplatesPath);
		const clocked = plugin.taskHost?.clockedPath === spec.file.path;
		root.classList.toggle('is-clocked', Boolean(task) && clocked);
		root.dataset.path = spec.file.path;
		meta.replaceChildren();
		if (!task) {
			applyStatus(root, { text: '', known: false, mark: 'unknown', strike: false, color: null });
			title.textContent = spec.file.basename;
			if (card) appendPills(meta, [{ kind: 'status', text: 'Task note is missing' }]);
			const label = 'Task note is missing';
			mark.title = label;
			mark.setAttribute('aria-label', label);
			setMarkIcon(mark, 'unknown');
			return;
		}
		const presentation = taskStatusPresentation(task.status);
		applyStatus(root, presentation);
		title.replaceChildren(doc.createTextNode(`${task.code} - ${task.title}`));
		if (clocked) appendOpenClock(title);
		if (card) appendPills(meta, taskCardPills(task, presentation.text, presentation.known));
		const label = markLabel(presentation.text, presentation.known);
		mark.title = label;
		mark.setAttribute('aria-label', label);
		setMarkIcon(mark, presentation.mark);
		if (title instanceof HTMLButtonElement) {
			const openLabel = `Open ${task.code} - ${task.title}`;
			title.setAttribute('aria-label', clocked ? `${openLabel}, clocked in` : openLabel);
		}
	};

	const drawTodo = (): void => {
		const templatesPath = plugin.settings.projectTemplatesPath;
		const todo = todoNoteFromFile(plugin.app, spec.file, templatesPath);
		const owner = todo ? owningTaskOfTodo(plugin.app, spec.file, templatesPath) : null;
		const clocked = owner !== null && plugin.taskHost?.clockedPath === owner.file.path;
		root.classList.toggle('is-clocked', clocked);
		root.dataset.path = spec.file.path;
		meta.replaceChildren();
		if (!todo) {
			applyStatus(root, { text: '', known: false, mark: 'unknown', strike: false, color: null });
			title.textContent = spec.file.basename;
			if (card) appendPills(meta, [{ kind: 'status', text: 'To-do note is missing' }]);
			const label = 'To-do note is missing';
			mark.title = label;
			mark.setAttribute('aria-label', label);
			setMarkIcon(mark, 'unknown');
			return;
		}
		const presentation = taskStatusPresentation(todo.status);
		applyStatus(root, presentation);
		const heading = todo.code ? `${todo.code} - ${todo.title}` : todo.title;
		title.replaceChildren(doc.createTextNode(heading));
		if (clocked) appendOpenClock(title);
		if (card) {
			appendPills(
				meta,
				taskCardPills(
					{
						code: todo.code,
						project: '',
						scheduled: todo.scheduled,
						due: todo.due,
						billable: false,
					},
					presentation.text,
					presentation.known,
				),
			);
		}
		const label = markLabel(presentation.text, presentation.known);
		mark.title = label;
		mark.setAttribute('aria-label', label);
		setMarkIcon(mark, presentation.mark);
		if (title instanceof HTMLButtonElement) {
			const openLabel = `Open ${heading}`;
			title.setAttribute('aria-label', clocked ? `${openLabel}, clocked in` : openLabel);
		}
	};

	draw();

	mark.addEventListener('click', (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		if (spec.todo) {
			const todo = todoNoteFromFile(plugin.app, spec.file, plugin.settings.projectTemplatesPath);
			if (!todo) return;
			void cycleTodoStatus(plugin.app, todo.file);
			return;
		}
		const task = taskNoteFromFile(plugin.app, spec.file, plugin.settings.projectTemplatesPath);
		if (!task) return;
		void cycleTaskStatus(plugin.app, task.file);
	});
	root.addEventListener('contextmenu', (evt) => {
		if (!(evt instanceof MouseEvent)) return;
		evt.preventDefault();
		evt.stopPropagation();
		if (spec.todo) {
			const todo = todoNoteFromFile(plugin.app, spec.file, plugin.settings.projectTemplatesPath);
			if (!todo) return;
			showTodoMenu(plugin, todo, evt, { open: spec.open || spec.mode === 'link' });
			return;
		}
		const task = taskNoteFromFile(plugin.app, spec.file, plugin.settings.projectTemplatesPath);
		if (!task) return;
		showTaskMenu(plugin, task, evt, { open: spec.open || spec.mode === 'link' });
	});
	if (spec.open) {
		root.addEventListener('click', (evt) => {
			if (!(evt instanceof MouseEvent) || evt.button !== 0) return;
			if (evt.target instanceof Node && mark.contains(evt.target)) return;
			evt.preventDefault();
			evt.stopPropagation();
			openTask(plugin, spec.file, spec.sourcePath, evt.ctrlKey || evt.metaKey);
		});
		root.addEventListener('auxclick', (evt) => {
			if (!(evt instanceof MouseEvent) || evt.button !== 1) return;
			if (evt.target instanceof Node && mark.contains(evt.target)) return;
			evt.preventDefault();
			evt.stopPropagation();
			openTask(plugin, spec.file, spec.sourcePath, true);
		});
	}
	if (title instanceof HTMLButtonElement) {
		title.addEventListener('click', (evt) => {
			if (evt.button !== 0) return;
			evt.preventDefault();
			evt.stopPropagation();
			openTask(plugin, spec.file, spec.sourcePath, evt.ctrlKey || evt.metaKey);
		});
		title.addEventListener('auxclick', (evt) => {
			if (evt.button !== 1) return;
			evt.preventDefault();
			evt.stopPropagation();
			openTask(plugin, spec.file, spec.sourcePath, true);
		});
	}

	let dead = false;
	let seen = false;
	const handle: TaskControlHandle = {
		paint() {
			if (dead) return;
			if (!root.isConnected) {
				if (seen) handle.unload();
				return;
			}
			seen = true;
			draw();
		},
		unload() {
			if (dead) return;
			dead = true;
			live.delete(handle);
		},
	};
	if (spec.track) live.add(handle);
	return { el: root, handle };
}

export function addTaskMenuItems(
	menu: Menu,
	plugin: MuseProjectsPlugin,
	task: TaskNoteRef,
	options: { open: boolean; clockSection?: string },
): void {
	const holds = taskHoldsClock(plugin, task);
	menu.addItem((item) => {
		if (options.clockSection) item.setSection(options.clockSection);
		item.setTitle(holds ? 'Clock out' : 'Clock in');
		item.setIcon(holds ? 'square' : 'play');
		item.onClick(() => {
			void runTaskClock(plugin, task);
		});
	});
	menu.addItem((item) => {
		if (options.clockSection) item.setSection(options.clockSection);
		item.setTitle('Edit time');
		item.setIcon('pencil');
		item.onClick(() => {
			void editTimeOnTask(plugin, task.file);
		});
	});
	if (options.open) {
		menu.addItem((item) => {
			item.setTitle('Open task');
			item.setIcon('file-text');
			item.onClick(() => {
				openTask(plugin, task.file, '', false);
			});
		});
	}
	if (!options.clockSection) menu.addSeparator();
	addStatusItems(menu, task.status, (status) => {
		void writeTaskStatus(plugin.app, task.file, status);
	});
}

function addStatusItems(
	menu: Menu,
	current: string,
	write: (status: string) => void,
): void {
	const known = TASK_STATUSES.some((status) => status.id === current);
	if (!known) {
		menu.addItem((item) => {
			item.setTitle(current || '(empty)');
			item.setChecked(true);
			item.setDisabled(true);
		});
	}
	for (const status of TASK_STATUSES) {
		menu.addItem((item) => {
			item.setTitle(status.id);
			item.setChecked(status.id === current);
			item.onClick(() => {
				write(status.id);
			});
		});
	}
}

export function showTaskMenu(
	plugin: MuseProjectsPlugin,
	task: TaskNoteRef,
	event: MouseEvent,
	options: { open: boolean },
): void {
	const menu = new Menu();
	addTaskMenuItems(menu, plugin, task, options);
	menu.showAtMouseEvent(event);
}

export function addTodoMenuItems(
	menu: Menu,
	plugin: MuseProjectsPlugin,
	todo: TodoNoteRef,
	options: { open: boolean; clockSection?: string },
): void {
	const owner = owningTaskOfTodo(plugin.app, todo.file, plugin.settings.projectTemplatesPath);
	if (owner) {
		const holds = taskHoldsClock(plugin, owner);
		menu.addItem((item) => {
			if (options.clockSection) item.setSection(options.clockSection);
			item.setTitle(holds ? 'Clock out' : 'Clock in');
			item.setIcon(holds ? 'square' : 'play');
			item.onClick(() => {
				void runTaskClock(plugin, owner);
			});
		});
	}
	if (options.open) {
		menu.addItem((item) => {
			item.setTitle('Open to-do');
			item.setIcon('file-text');
			item.onClick(() => {
				openTask(plugin, todo.file, '', false);
			});
		});
	}
	if (!options.clockSection && (owner || options.open)) menu.addSeparator();
	addStatusItems(menu, todo.status, (status) => {
		void writeTodoStatus(plugin.app, todo.file, status);
	});
}

export function showTodoMenu(
	plugin: MuseProjectsPlugin,
	todo: TodoNoteRef,
	event: MouseEvent,
	options: { open: boolean },
): void {
	const menu = new Menu();
	addTodoMenuItems(menu, plugin, todo, options);
	menu.showAtMouseEvent(event);
}

function appendOpenClock(title: HTMLElement): void {
	const clock = title.ownerDocument.createElement('span');
	clock.className = 'msprj-task-clock';
	clock.setAttribute('aria-hidden', 'true');
	clock.textContent = '\u23F1\uFE0E';
	title.append(clock);
}

function taskHoldsClock(plugin: MuseProjectsPlugin, task: TaskNoteRef): boolean {
	const scan = plugin.clockWatch.current();
	const open = scan.opens.length === 1 ? scan.opens[0] : undefined;
	return open?.file.path === task.file.path;
}

function openTask(
	plugin: MuseProjectsPlugin,
	file: TaskNoteRef['file'],
	sourcePath: string,
	newLeaf: boolean,
): void {
	const current = plugin.app.vault.getFileByPath(file.path);
	if (!(current instanceof TFile)) return;
	void plugin.app.workspace.openLinkText(current.path, sourcePath, newLeaf);
}

function applyStatus(root: HTMLElement, presentation: TaskStatusPresentation): void {
	root.dataset.mark = presentation.mark;
	root.dataset.strike = presentation.strike ? 'true' : 'false';
	if (presentation.text) root.dataset.status = presentation.text;
	else delete root.dataset.status;
	if (presentation.color) root.style.setProperty('--msprj-status-color', presentation.color);
	else root.style.removeProperty('--msprj-status-color');
}

function appendPills(meta: HTMLElement, pills: TaskCardPill[]): void {
	const doc = meta.ownerDocument;
	for (const pill of pills) {
		const el = doc.createElement('span');
		el.className = pill.kind === 'code' ? 'msprj-task-pill is-code' : 'msprj-task-pill';
		el.dataset.pill = pill.kind;
		el.textContent = pill.text;
		meta.append(el);
	}
}

function markLabel(status: string, known: boolean): string {
	const next = nextCycledStatus(status);
	if (!known) {
		const shown = status ? `unknown status ${status}` : 'empty status';
		return `Status: ${shown}. Set ${next}.`;
	}
	return `Status: ${status}. Set ${next}.`;
}

function setMarkIcon(mark: HTMLElement, kind: string): void {
	if (mark.dataset.kind === kind) return;
	mark.dataset.kind = kind;
	mark.replaceChildren();
	if (kind === 'open' || kind === 'unknown') return;
	const doc = mark.ownerDocument;
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('width', '12');
	svg.setAttribute('height', '12');
	svg.setAttribute('aria-hidden', 'true');
	if (kind === 'active') {
		const circle = doc.createElementNS(SVG_NS, 'circle');
		circle.setAttribute('cx', '8');
		circle.setAttribute('cy', '8');
		circle.setAttribute('r', '2.4');
		circle.setAttribute('fill', 'currentColor');
		svg.append(circle);
	} else {
		const path = doc.createElementNS(SVG_NS, 'path');
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.75');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute(
			'd',
			kind === 'blocked'
				? 'M4 8h8'
				: kind === 'done'
					? 'M3.5 8.5 6.5 11.5 12.5 4.5'
					: 'M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5',
		);
		svg.append(path);
	}
	mark.append(svg);
}
