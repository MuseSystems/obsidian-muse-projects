import { Plugin } from 'obsidian';
import { scheduleEnsureObjectIds } from './ensureObjectIds';
import { ensureMsprjPropertyTypes } from './propertyTypes';
import { installBundledTemplates, offerBundledTemplates } from './seedTemplates';
import {
	MuseProjectsSettings,
	MuseProjectsSettingTab,
	normalizeSettings,
} from './settings';

export default class MuseProjectsPlugin extends Plugin {
	settings!: MuseProjectsSettings;
	templateSeedTask: Promise<void> | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MuseProjectsSettingTab(this.app, this));
		await ensureMsprjPropertyTypes(this.app);
		scheduleEnsureObjectIds(this, () => this.settings.projectTemplatesPath);
		this.addCommand({
			id: 'install-templates',
			name: 'Install starting templates',
			callback: () => {
				void installBundledTemplates(this);
			},
		});
		this.app.workspace.onLayoutReady(() => {
			void offerBundledTemplates(this);
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
