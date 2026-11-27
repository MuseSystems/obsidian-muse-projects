import { App, PluginSettingTab, Setting } from 'obsidian';
import type MuseProjectsPlugin from './main';
import { FolderPathSuggest } from './folderSuggest';
import {
	CLOCK_FORMAT_LABELS,
	CLOCK_FORMATS,
	DEFAULT_CLOCK_FORMAT,
	parseClockFormat,
	type ClockFormat,
} from './clockFormat';
import {
	DEFAULT_DURATION_FORMAT,
	DURATION_FORMATS,
	DURATION_FORMAT_LABELS,
	parseDurationFormat,
	type DurationFormat,
} from './durationFormat';
import {
	DEFAULT_WEEK_START,
	WEEK_STARTS,
	WEEK_START_LABELS,
	parseWeekStart,
	type WeekStart,
} from './weekStart';
import { installBundledTemplates, replaceUnmodifiedTemplates } from './seedTemplates';
import { normalizeStoredTemplateSeed, type TemplateSeedRecord } from './templateSeedPlan';
import { taskTodoEnabled } from './taskTodo';

export interface MuseProjectsSettings {
	/**
	 * Vault-relative template root.
	 * The stored key stays `projectTemplatesPath` so existing vault data still loads.
	 * `organization/<layout>/` and `project/<layout>/` are layouts.
	 * The folder `default` is the vault default layout. Its `_org.md` or `_prj.md` is the note template.
	 * `task/` and `todo/` hold note templates.
	 */
	projectTemplatesPath: string;
	/**
	 * Week used by reports that span organizations.
	 * `monday` is Monday–Sunday. `sunday` is Sunday–Saturday. `saturday` is Saturday–Friday.
	 * A report for one organization uses that note's `msprj_org_week_start`.
	 */
	weekStart: WeekStart;
	/**
	 * How reports that span organizations print a duration.
	 * `hours-minutes` is `1:30`. `decimal-hours` is hundredths of an hour (`1.50`).
	 * A report for one organization uses that note's `msprj_org_duration_format`.
	 */
	durationFormat: DurationFormat;
	/**
	 * How reports that span organizations print a civil clock time.
	 * `24-hour` is `14:30:05`. `12-hour` is `2:30:05 PM`.
	 * A report for one organization uses that note's `msprj_org_clock_format`.
	 * Durations use `durationFormat`.
	 */
	clockFormat: ClockFormat;
	/**
	 * Next global to-do number. Create takes this value, then advances it by one.
	 * File names pad it to five digits (`todo-00042`).
	 */
	nextTodoId: number;
	/**
	 * Copied onto each new project as `msprj_prj_task_todo`.
	 * While that checkbox is on, a new task on the project is also a to-do.
	 * Off is the default.
	 */
	taskTodoDefault: boolean;
	/**
	 * When true, a plugin update replaces a seeded template file that still matches
	 * the copy this plugin last wrote. Off leaves those files as they are.
	 */
	updateInstalledTemplates: boolean;
	/** The operator skipped the first-run folder prompt. Settings can install later. */
	templateInstallDeclined: boolean;
	/**
	 * Seed records keyed by templates root, then by path relative to that root.
	 * `seeded` is a file this plugin wrote, or one that already matched the shipped copy.
	 * `preexisting` was already in the folder and differed from the shipped copy.
	 * A removed file stays removed until install writes it again.
	 */
	templateSeeds: Record<string, Record<string, TemplateSeedRecord>>;
}

export const DEFAULT_SETTINGS: MuseProjectsSettings = {
	projectTemplatesPath: '',
	weekStart: DEFAULT_WEEK_START,
	durationFormat: DEFAULT_DURATION_FORMAT,
	clockFormat: DEFAULT_CLOCK_FORMAT,
	nextTodoId: 1,
	taskTodoDefault: false,
	updateInstalledTemplates: false,
	templateInstallDeclined: false,
	templateSeeds: {},
};

/** Fill missing or unrecognized stored settings. Does not rewrite the vault file. */
export function normalizeSettings(stored: unknown): MuseProjectsSettings {
	const record =
		stored !== null && typeof stored === 'object'
			? (stored as Record<string, unknown>)
			: {};
	const path = record.projectTemplatesPath;
	const seed = normalizeStoredTemplateSeed(stored);
	return {
		projectTemplatesPath: typeof path === 'string' ? path : DEFAULT_SETTINGS.projectTemplatesPath,
		weekStart: parseWeekStart(record.weekStart) ?? DEFAULT_SETTINGS.weekStart,
		durationFormat:
			parseDurationFormat(record.durationFormat) ?? DEFAULT_SETTINGS.durationFormat,
		clockFormat: parseClockFormat(record.clockFormat) ?? DEFAULT_SETTINGS.clockFormat,
		nextTodoId: parseNextTodoId(record.nextTodoId),
		taskTodoDefault: taskTodoEnabled(record.taskTodoDefault),
		updateInstalledTemplates: seed.updateInstalledTemplates,
		templateInstallDeclined: seed.templateInstallDeclined,
		templateSeeds: seed.templateSeeds,
	};
}

/** Integers from 1. Anything else starts the sequence at 1. */
export function parseNextTodoId(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

export class MuseProjectsSettingTab extends PluginSettingTab {
	plugin: MuseProjectsPlugin;

	constructor(app: App, plugin: MuseProjectsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Templates path')
			.setDesc(
				'Vault-relative template root. organization/ and project/ hold layout folders; default is the vault default, and its _org.md or _prj.md is the note. task/ and todo/ hold note templates. Type to autosuggest folders.',
			)
			.addText((text) => {
				text
					.setPlaceholder('e.g. project-templates')
					.setValue(this.plugin.settings.projectTemplatesPath)
					.onChange(async (value) => {
						this.plugin.settings.projectTemplatesPath = value.trim();
						await this.plugin.saveSettings();
					});
				new FolderPathSuggest(this.app, text.inputEl, async (folder) => {
					const path =
						folder.path === '/' || folder.path === '' ? '' : folder.path;
					this.plugin.settings.projectTemplatesPath = path;
					text.setValue(path);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Install starting templates')
			.setDesc(
				'Writes template files shipped with the plugin that are missing from the templates folder. Files already in that folder stay. Asks for a folder when Templates path is empty.',
			)
			.addButton((button) =>
				button.setButtonText('Install').onClick(() => {
					void installBundledTemplates(this.plugin).then(() => {
						this.display();
					});
				}),
			);

		new Setting(containerEl)
			.setName('Update installed templates')
			.setDesc(
				'When this is on, replace a template file that still matches the copy this plugin last wrote. Turning this on does that now, and again when the plugin loads. An edited file stays. Off is the default. A file shipped with a newer plugin is added when that file has never been installed in this folder. A file you removed stays removed until you install templates again.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.updateInstalledTemplates).onChange(async (value) => {
					this.plugin.settings.updateInstalledTemplates = value;
					await this.plugin.saveSettings();
					if (value) await replaceUnmodifiedTemplates(this.plugin);
				}),
			);

		new Setting(containerEl)
			.setName('Standard week start')
			.setDesc(
				'Week used by reports that span organizations. An organization report uses that organization’s week start. Monday–Sunday, Sunday–Saturday, or Saturday–Friday. Monday–Sunday is the default when this is unset.',
			)
			.addDropdown((dropdown) => {
				for (const start of WEEK_STARTS) {
					dropdown.addOption(start, WEEK_START_LABELS[start]);
				}
				dropdown.setValue(this.plugin.settings.weekStart).onChange(async (value) => {
					const parsed = parseWeekStart(value);
					if (!parsed) {
						return;
					}
					this.plugin.settings.weekStart = parsed;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Standard duration format')
			.setDesc(
				'How reports that span organizations show durations. An organization report uses that organization’s duration format. Hours and minutes (1:30) is the default when this is unset. Decimal hours are hundredths of an hour (1.50).',
			)
			.addDropdown((dropdown) => {
				for (const format of DURATION_FORMATS) {
					dropdown.addOption(format, DURATION_FORMAT_LABELS[format]);
				}
				dropdown.setValue(this.plugin.settings.durationFormat).onChange(async (value) => {
					const parsed = parseDurationFormat(value);
					if (!parsed) {
						return;
					}
					this.plugin.settings.durationFormat = parsed;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Standard clock format')
			.setDesc(
				'How reports that span organizations show a clock time. An organization report uses that organization’s clock format. 24-hour (14:30:05) is the default when this is unset. 12-hour prints 2:30:05 PM. Durations use the duration format.',
			)
			.addDropdown((dropdown) => {
				for (const format of CLOCK_FORMATS) {
					dropdown.addOption(format, CLOCK_FORMAT_LABELS[format]);
				}
				dropdown.setValue(this.plugin.settings.clockFormat).onChange(async (value) => {
					const parsed = parseClockFormat(value);
					if (!parsed) {
						return;
					}
					this.plugin.settings.clockFormat = parsed;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('New tasks are to-dos')
			.setDesc(
				'Default for a new project. While that project’s msprj_prj_task_todo is on, each new task is also a to-do. Off is the default.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.taskTodoDefault).onChange(async (value) => {
					this.plugin.settings.taskTodoDefault = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Next to-do number')
			.setDesc(
				'The next to-do takes this number, then the setting advances by one. The file name pads it to five digits.',
			)
			.addText((text) => {
				text
					.setPlaceholder('1')
					.setValue(String(this.plugin.settings.nextTodoId))
					.onChange(async (value) => {
						const parsed = parseNextTodoId(Number(value.trim()));
						if (value.trim() !== String(parsed)) {
							return;
						}
						this.plugin.settings.nextTodoId = parsed;
						await this.plugin.saveSettings();
					});
			});
	}
}
