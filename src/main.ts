import { Plugin } from 'obsidian';
import { scheduleEnsureObjectIds } from './ensureObjectIds';
import { promptNewOrganization } from './newOrganizationFlow';
import { runNewProjectFlow } from './newProjectFlow';
import { runNewTaskFlow } from './newTaskFlow';
import { documentFlowContextFromNote, runNewDocumentFlow } from './newDocumentFlow';
import { runNewSubordinateFlow } from './newSubordinateFlow';
import { SUBORDINATES } from './subordinates';
import { runNewOrgResourceFlow } from './newOrgResourceFlow';
import { ORG_RESOURCES } from './orgResources';
import { runNewTodoFlow } from './newTodoFlow';
import { ensureMsprjPropertyTypes } from './propertyTypes';
import { runRepairReferences } from './repairReferences';
import { installBundledTemplates, offerBundledTemplates } from './seedTemplates';
import {
	MuseProjectsSettings,
	MuseProjectsSettingTab,
	normalizeSettings,
} from './settings';
import { startTaskListSync } from './taskListSync';

export default class MuseProjectsPlugin extends Plugin {
	settings!: MuseProjectsSettings;
	templateSeedTask: Promise<void> | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MuseProjectsSettingTab(this.app, this));
		await ensureMsprjPropertyTypes(this.app);
		scheduleEnsureObjectIds(this, () => this.settings.projectTemplatesPath);
		startTaskListSync(this, () => this.settings.projectTemplatesPath);
		this.addCommand({
			id: 'new-organization',
			name: 'New Organization',
			callback: () => {
				void promptNewOrganization(this.app, {
					openNote: true,
					templatesPath: this.settings.projectTemplatesPath,
					weekStart: this.settings.weekStart,
					durationFormat: this.settings.durationFormat,
					clockFormat: this.settings.clockFormat,
				});
			},
		});
		this.addCommand({
			id: 'new-project',
			name: 'New Project',
			callback: () => {
				void runNewProjectFlow(this);
			},
		});
		this.addCommand({
			id: 'new-task',
			name: 'New Task',
			callback: () => {
				void runNewTaskFlow(this);
			},
		});
		this.addCommand({
			id: 'new-todo',
			name: 'New To-Do',
			callback: () => {
				void runNewTodoFlow(this);
			},
		});
		this.addCommand({
			id: 'new-document',
			name: 'New Document',
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				const templatesPath = this.settings.projectTemplatesPath;
				void runNewDocumentFlow(
					this.app,
					templatesPath,
					file ? documentFlowContextFromNote(this.app, file, templatesPath) : {},
				);
			},
		});
		for (const kind of SUBORDINATES) {
			this.addCommand({
				id: `new-${kind.id}`,
				name: `New ${kind.label}`,
				callback: () => {
					void runNewSubordinateFlow(this, kind.id);
				},
			});
		}
		for (const kind of ORG_RESOURCES) {
			this.addCommand({
				id: `new-${kind.id}`,
				name: `New ${kind.label}`,
				callback: () => {
					void runNewOrgResourceFlow(this, kind.id);
				},
			});
		}
		this.addCommand({
			id: 'install-templates',
			name: 'Install starting templates',
			callback: () => {
				void installBundledTemplates(this);
			},
		});
		this.addCommand({
			id: 'repair-references',
			name: 'Repair references',
			callback: () => {
				void runRepairReferences(this.app, this.settings.projectTemplatesPath);
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
