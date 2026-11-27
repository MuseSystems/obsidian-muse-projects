import {
	App,
	FuzzySuggestModal,
	Modal,
	Notice,
	Setting,
	TFile,
} from 'obsidian';
import { MSPRJ_ARCHETYPE_TASK } from './constants';
import { formActions, formTitle, mountForm } from './formModal';
import { CreateTaskError, createTaskNote } from './createTask';
import { isCalendarDate, todayLocalISODate } from './dates';
import type MuseProjectsPlugin from './main';
import {
	inheritedTaskTemplateStem,
	listNoteTemplateFiles,
	selectableTemplateStems,
	type TemplateSelection,
} from './noteTemplates';
import {
	listResolvableProjects,
	resolveProjectFromFile,
	type ResolvedProject,
} from './projectResolve';

class ProjectPickModal extends FuzzySuggestModal<ResolvedProject> {
	constructor(
		app: App,
		private readonly projects: ResolvedProject[],
		private readonly onPick: (project: ResolvedProject) => void,
	) {
		super(app);
		this.setPlaceholder('Choose a project…');
	}

	getItems(): ResolvedProject[] {
		return this.projects;
	}

	getItemText(item: ResolvedProject): string {
		return `${item.code} — ${item.name}`;
	}

	onChooseItem(item: ResolvedProject): void {
		this.onPick(item);
	}
}

class NewTaskFieldsModal extends Modal {
	private title = '';
	private scheduled = todayLocalISODate();
	/** Seeded from project when set; otherwise must be chosen explicitly. */
	private billable: boolean | null;

	private templateStem = '';
	private readonly templateChoices: string[];

	constructor(
		app: App,
		private readonly project: ResolvedProject,
		private readonly templatesPath: string,
		private readonly onSubmit: (fields: {
			title: string;
			scheduled: string | null;
			billable: boolean;
			noteTemplate: TemplateSelection;
		}) => void,
	) {
		super(app);
		this.billable = project.billable;
		this.templateChoices = selectableTemplateStems(
			listNoteTemplateFiles(app, templatesPath, MSPRJ_ARCHETYPE_TASK),
		);
		const inherited = inheritedTaskTemplateStem(app, project.file, templatesPath);
		if (inherited && this.templateChoices.includes(inherited)) {
			this.templateStem = inherited;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(`New task (${this.project.code})`);
		const { body, footer } = mountForm(this);

		formTitle(body, 'Title', (value) => {
			this.title = value;
		});

		new Setting(body)
			.setName('Scheduled')
			.addText((text) =>
				text
					.setPlaceholder('YYYY-MM-DD')
					.setValue(this.scheduled)
					.onChange((value) => {
						this.scheduled = value;
					}),
			);

		if (this.project.billable === null) {
			new Setting(body).setName('Billable').addDropdown((dropdown) => {
				dropdown
					.addOption('', 'Select…')
					.addOption('true', 'Billable')
					.addOption('false', 'Non-billable')
					.setValue('')
					.onChange((value) => {
						if (value === 'true') {
							this.billable = true;
						} else if (value === 'false') {
							this.billable = false;
						} else {
							this.billable = null;
						}
					});
			});
		} else {
			new Setting(body).setName('Billable').addToggle((toggle) =>
				toggle.setValue(this.billable === true).onChange((value) => {
					this.billable = value;
				}),
			);
		}

		if (this.templateChoices.length > 0) {
			new Setting(body).setName('Template').addDropdown((dropdown) => {
				dropdown.addOption('', 'Vault default');
				for (const stem of this.templateChoices) {
					dropdown.addOption(stem, stem);
				}
				dropdown.setValue(this.templateStem);
				dropdown.onChange((value) => {
					this.templateStem = value;
				});
			});
		}

		formActions(this, footer, () => {
			void this.submit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const title = this.title.trim();
		if (!title) {
			new Notice('Task title is required.');
			return;
		}
		if (this.billable === null) {
			new Notice('Billable is required — choose Billable or Non-billable.');
			return;
		}

		const scheduledRaw = this.scheduled.trim();
		let scheduled: string | null = scheduledRaw || null;
		if (scheduled && !isCalendarDate(scheduled)) {
			new Notice('Scheduled date must be a real YYYY-MM-DD date or empty.');
			return;
		}

		const noteTemplate: TemplateSelection =
			this.templateChoices.length === 0
				? {
						kind: 'inherit',
						inheritedStem: inheritedTaskTemplateStem(
							this.app,
							this.project.file,
							this.templatesPath,
						),
					}
				: this.templateStem
					? { kind: 'named', stem: this.templateStem }
					: { kind: 'vault-default' };

		this.close();
		this.onSubmit({
			title,
			scheduled,
			billable: this.billable,
			noteTemplate,
		});
	}
}

function activeMarkdownFile(app: App): TFile | null {
	const file = app.workspace.getActiveFile();
	return file instanceof TFile && file.extension === 'md' ? file : null;
}

async function openTaskFields(
	app: App,
	project: ResolvedProject,
	templatesPath: string,
): Promise<void> {
	new NewTaskFieldsModal(app, project, templatesPath, async (fields) => {
		try {
			const file = await createTaskNote(app, project, fields, templatesPath);
			new Notice(`Created task ${file.basename}`);
			await app.workspace.getLeaf(false).openFile(file);
		} catch (err) {
			const message =
				err instanceof CreateTaskError
					? err.message
					: err instanceof Error
						? err.message
						: String(err);
			new Notice(message);
			console.error('Muse Projects: New Task failed', err);
		}
	}).open();
}

/**
 * New Task: use `project` when the caller already has one, otherwise resolve
 * from the active note, or pick. Then title / schedule / billable.
 */
export async function runNewTaskFlow(
	plugin: MuseProjectsPlugin,
	project?: ResolvedProject,
): Promise<void> {
	const { app } = plugin;
	const templatesPath = plugin.settings.projectTemplatesPath.trim();

	if (project) {
		await openTaskFields(app, project, templatesPath);
		return;
	}

	const fromContext = await resolveProjectFromFile(
		app,
		activeMarkdownFile(app),
		templatesPath,
	);
	if (fromContext) {
		await openTaskFields(app, fromContext, templatesPath);
		return;
	}

	const projects = listResolvableProjects(app, templatesPath);
	if (projects.length === 0) {
		new Notice('No projects found. Create a project first.');
		return;
	}

	new ProjectPickModal(app, projects, (project) => {
		void openTaskFields(app, project, templatesPath);
	}).open();
}
