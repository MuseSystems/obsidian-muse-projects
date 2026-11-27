import { App, ButtonComponent, Modal, Notice, Setting, TFile } from 'obsidian';
import {
	TimeEntryWriteError,
	UnreadableTimeEntriesError,
	loadTimeEntries,
	writeTimeEntries,
	writeTimeEntriesIfUnchanged,
} from './clockFlow';
import { confirmAction } from './confirmModal';
import { formRow, mountForm } from './formModal';
import type MuseProjectsPlugin from './main';
import { taskNoteFromFile } from './taskNote';
import { composeStamp, currentOffsetString, parseStamp } from './stamps';
import type { TimeEntry } from './timeEntries';

interface ClosedDraft {
	date: string;
	time: string;
	offset: string;
}

interface DraftRow {
	id: string;
	startDate: string;
	startTime: string;
	startOffset: string;
	/** Null marks the open interval. New rows are closed. */
	end: ClosedDraft | null;
	note: string;
	extra: Record<string, unknown>;
	keyOrder: string[];
}

function draftFromEntry(entry: TimeEntry): DraftRow | null {
	const start = parseStamp(entry.start);
	if (!start) {
		return null;
	}
	if (entry.end === null) {
		return {
			id: entry.id,
			startDate: start.date,
			startTime: start.time,
			startOffset: start.offset,
			end: null,
			note: entry.note,
			extra: entry.extra,
			keyOrder: entry.keyOrder,
		};
	}
	const end = parseStamp(entry.end);
	if (!end) {
		return null;
	}
	return {
		id: entry.id,
		startDate: start.date,
		startTime: start.time,
		startOffset: start.offset,
		end: { date: end.date, time: end.time, offset: end.offset },
		note: entry.note,
		extra: entry.extra,
		keyOrder: entry.keyOrder,
	};
}

function stampFields(
	parent: HTMLElement,
	date: string,
	time: string,
	offset: string,
	assign: (part: 'date' | 'time' | 'offset', value: string) => void,
): void {
	const row = formRow(parent);
	new Setting(row)
		.setName('Date')
		.addText((text) =>
			text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(date)
				.onChange((value) => assign('date', value)),
		);
	new Setting(row)
		.setName('Time')
		.addText((text) =>
			text
				.setPlaceholder('HH:mm:ss')
				.setValue(time)
				.onChange((value) => assign('time', value)),
		);
	new Setting(row)
		.setName('Offset')
		.addText((text) =>
			text
				.setPlaceholder('±HH:mm')
				.setValue(offset)
				.onChange((value) => assign('offset', value)),
		);
}

function closedDraft(): ClosedDraft {
	const offset = currentOffsetString();
	return { date: '', time: '', offset };
}

class EditTimeModal extends Modal {
	private readonly rows: DraftRow[];
	/** List the modal opened with. Save refuses when the file no longer matches it. */
	private readonly opened: TimeEntry[];
	private saving = false;

	constructor(
		app: App,
		private readonly file: TFile,
		private readonly code: string,
		entries: TimeEntry[],
	) {
		super(app);
		this.opened = entries.map((entry) => ({
			id: entry.id,
			start: entry.start,
			end: entry.end,
			note: entry.note,
			extra: JSON.parse(JSON.stringify(entry.extra)) as Record<string, unknown>,
			keyOrder: [...entry.keyOrder],
		}));
		const rows = entries
			.map((entry) => draftFromEntry(entry))
			.filter((row): row is DraftRow => row !== null);
		if (rows.length !== entries.length) {
			throw new TimeEntryWriteError('A stored interval could not be shown.');
		}
		this.rows = rows;
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(`Edit time (${this.code})`);
		const { body, footer } = mountForm(this);
		this.modalEl.addClass('msprj-time');

		if (this.rows.length === 0) {
			body.createEl('p', { cls: 'msprj-time-empty', text: 'No intervals.' });
		}

		this.rows.forEach((row, index) => {
			const block = body.createDiv({ cls: 'msprj-time-interval' });
			const head = block.createDiv({ cls: 'msprj-time-interval-head' });
			const title = row.end === null ? `Interval ${index + 1} (open)` : `Interval ${index + 1}`;
			head.createDiv({ cls: 'msprj-time-interval-title', text: title });
			new ButtonComponent(head).setButtonText('Delete').onClick(() => {
				this.rows.splice(index, 1);
				this.render();
			});

			block.createDiv({ cls: 'msprj-time-stamp-label', text: 'Start' });
			stampFields(block, row.startDate, row.startTime, row.startOffset, (part, value) => {
				if (part === 'date') row.startDate = value;
				else if (part === 'time') row.startTime = value;
				else row.startOffset = value;
			});

			block.createDiv({ cls: 'msprj-time-stamp-label', text: 'End' });
			if (row.end) {
				const end = row.end;
				stampFields(block, end.date, end.time, end.offset, (part, value) => {
					if (part === 'date') end.date = value;
					else if (part === 'time') end.time = value;
					else end.offset = value;
				});
			} else {
				block.createDiv({
					cls: 'msprj-time-open',
					text: 'Open. Clock out closes this interval.',
				});
			}

			const note = formRow(block);
			note.addClass('is-single');
			new Setting(note).setName('Note').addText((text) =>
				text.setValue(row.note).onChange((value) => {
					row.note = value;
				}),
			);
		});

		new ButtonComponent(footer)
			.setButtonText('Add closed interval')
			.onClick(() => {
				this.rows.push({
					id: '',
					startDate: '',
					startTime: '',
					startOffset: currentOffsetString(),
					end: closedDraft(),
					note: '',
					extra: {},
					keyOrder: ['id', 'start', 'end', 'note'],
				});
				this.render();
			}).buttonEl.addClass('msprj-time-add');
		new ButtonComponent(footer).setButtonText('Cancel').onClick(() => {
			this.close();
		});
		new ButtonComponent(footer)
			.setButtonText('Save')
			.setCta()
			.onClick(() => {
				void this.save();
			});
	}

	private build(): { ok: true; entries: TimeEntry[] } | { ok: false; reason: string } {
		const entries: TimeEntry[] = [];
		let openCount = 0;
		for (let index = 0; index < this.rows.length; index++) {
			const row = this.rows[index];
			if (!row) {
				return { ok: false, reason: `Interval ${index + 1} is missing.` };
			}
			const label = `Interval ${index + 1}`;
			const start = composeStamp(row.startDate, row.startTime, row.startOffset);
			if (!start) {
				return { ok: false, reason: `${label} start is not a stamp.` };
			}
			let end: string | null = null;
			if (row.end) {
				const parsedEnd = composeStamp(row.end.date, row.end.time, row.end.offset);
				if (!parsedEnd) {
					return { ok: false, reason: `${label} end is not a stamp.` };
				}
				if (Math.floor(start.instant / 1000) >= Math.floor(parsedEnd.instant / 1000)) {
					return { ok: false, reason: `${label} end must be after start.` };
				}
				end = parsedEnd.canonical;
			} else {
				openCount += 1;
				if (openCount > 1) {
					return { ok: false, reason: 'Only one open interval is allowed on a task.' };
				}
			}
			entries.push({
				id: row.id,
				start: start.canonical,
				end,
				note: row.note,
				extra: row.extra,
				keyOrder: row.keyOrder,
			});
		}
		return { ok: true, entries };
	}

	private async save(): Promise<void> {
		if (this.saving) {
			return;
		}
		const built = this.build();
		if (!built.ok) {
			new Notice(built.reason);
			return;
		}
		this.saving = true;
		try {
			await writeTimeEntriesIfUnchanged(this.app, this.file, this.opened, built.entries);
			this.close();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(message);
			console.error('Muse Projects: Edit time failed', err);
		} finally {
			this.saving = false;
		}
	}
}

/** Edit intervals on a task note. Does not open a new clock. */
export async function editTimeOnTask(plugin: MuseProjectsPlugin, file: TFile): Promise<void> {
	const task = taskNoteFromFile(plugin.app, file, plugin.settings.projectTemplatesPath);
	if (!task) {
		new Notice('Edit time works on a task note.');
		return;
	}
	let entries: TimeEntry[];
	try {
		entries = await loadTimeEntries(plugin.app, task.file);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('Muse Projects: Edit time failed', err);
		if (!(err instanceof UnreadableTimeEntriesError)) {
			new Notice(message);
			return;
		}
		const replace = await confirmAction(
			plugin.app,
			'Replace time entries',
			`${task.code}: ${message} Replace the list with an empty list? The current value will be discarded.`,
		);
		if (!replace) {
			return;
		}
		try {
			await writeTimeEntries(plugin.app, task.file, []);
			new Notice(`Replaced time entries on ${task.code} with an empty list.`);
		} catch (writeErr) {
			const writeMessage = writeErr instanceof Error ? writeErr.message : String(writeErr);
			new Notice(writeMessage);
			console.error('Muse Projects: Replace time entries failed', writeErr);
		}
		return;
	}
	new EditTimeModal(plugin.app, task.file, task.code, entries).open();
}

/** Edit intervals on the active task. Does not open a new clock. */
export async function runEditTime(plugin: MuseProjectsPlugin): Promise<void> {
	const file = plugin.app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension !== 'md') {
		new Notice('Edit time works on the active task note.');
		return;
	}
	const task = taskNoteFromFile(plugin.app, file, plugin.settings.projectTemplatesPath);
	if (!task) {
		new Notice('Edit time works on the active task note.');
		return;
	}
	await editTimeOnTask(plugin, file);
}
