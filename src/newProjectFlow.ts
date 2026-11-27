import {
	App,
	DropdownComponent,
	FuzzySuggestModal,
	Modal,
	Notice,
	Setting,
	TextComponent,
	TFile,
	TFolder,
} from 'obsidian';
import { alertAction, confirmAction } from './confirmModal';
import { displayFolderPath } from './explorerFolder';
import { formActions, formContext, formSection, formTitle, mountForm } from './formModal';
import type MuseProjectsPlugin from './main';
import { MSPRJ_ORG_SKEL_PROJECT, MSPRJ_ORG_TPL_TASK } from './constants';
import { promptNewOrganization } from './newOrganizationFlow';
import {
	listNoteTemplateFiles,
	organizationTemplateStem,
	selectableTemplateStems,
} from './noteTemplates';
import { organizationCodeAbove } from './ownershipResolve';
import { findOrganizationByCode, type OrganizationNote } from './orgIndex';
import { OrganizationSuggest } from './orgSuggest';
import { findProjectByCode, isUnderTemplatesPath } from './projectIndex';
import { nearestProjectInFolder, projectNoteFromFile } from './projectResolve';
import { ScaffoldError, scaffoldProject } from './scaffold';
import {
	discoverSkeletons,
	resolveSkeletonFolder,
	selectableSkeletonNames,
	type SkeletonSelection,
} from './skeletons';
import { storedTaskTemplateStem } from './templateTokens';
import {
	identifierCodeError,
	normalizeNoteFilename,
	normalizeOrganizationCode,
	normalizeProjectCode,
	suggestFolderSlug,
	suggestProjectBasename,
} from './slug';
import type { ClockFormat } from './clockFormat';
import type { DurationFormat } from './durationFormat';
import type { WeekStart } from './weekStart';

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly templatesPath: string,
		private readonly onPick: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder('Choose destination folder…');
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllFolders(true)
			.filter((folder) => !isUnderTemplatesPath(folder.path, this.templatesPath));
	}

	getItemText(folder: TFolder): string {
		return folder.path === '/' || folder.path === '' ? '/' : folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onPick(folder);
	}
}

class NewProjectFieldsModal extends Modal {
	private projectName = '';
	private folderName = '';
	private projectCode = '';
	private noteFileName = '';
	private noteFileNameTouched = false;
	private settingNoteFileName = false;
	private noteFileNameText: TextComponent | null = null;
	private projectOrg = '';
	private projectOrgText: TextComponent | null = null;
	/** Set only when the form chooses Billable or Non-billable. Null means the form has not set a value. */
	private billable: boolean | null = null;
	/** Starts from the plugin setting. Stored as msprj_prj_task_todo. */
	private taskTodo: boolean;
	private billableDropdown: DropdownComponent | null = null;
	private settingBillable = false;
	private folderSlugTouched = false;
	private folderText: TextComponent | null = null;
	private projectCodeText: TextComponent | null = null;
	private projectSkeletonStem = '';
	private taskTemplateStem = '';
	private projectSkeletonTouched = false;
	private taskTemplateTouched = false;
	private settingProjectSkeleton = false;
	private settingTaskTemplate = false;
	private projectSkeletonDropdown: DropdownComponent | null = null;
	private taskTemplateDropdown: DropdownComponent | null = null;
	private readonly projectSkeletonChoices: string[];
	private readonly taskTemplateChoices: string[];

	constructor(
		app: App,
		private readonly destination: TFolder,
		private readonly projectTemplatesPath: string,
		private readonly standardWeekStart: WeekStart,
		private readonly standardDurationFormat: DurationFormat,
		private readonly standardClockFormat: ClockFormat,
		taskTodoDefault: boolean,
		private readonly initialOrganizationCode: string,
		private readonly parentProject: TFile | null,
		private readonly onSubmit: (fields: {
			projectName: string;
			folderName: string;
			projectCode: string;
			projectOrg: string;
			ownerPath: string;
			child: boolean;
			billable: boolean;
			taskTodo: boolean;
			noteFileName: string;
			skeleton: TFolder | null;
			taskTemplateStem: string | null;
		}) => void,
	) {
		super(app);
		this.taskTodo = taskTodoDefault;
		this.projectSkeletonChoices = selectableSkeletonNames(
			discoverSkeletons(app, projectTemplatesPath, 'project').map((skeleton) => skeleton.name),
		);
		this.taskTemplateChoices = selectableTemplateStems(
			listNoteTemplateFiles(app, projectTemplatesPath, 'task'),
		);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('New project');
		const { body, footer } = mountForm(this);
		const where = displayFolderPath(this.destination.path);
		formContext(
			body,
			this.parentProject ? `${where} · ${this.parentProject.basename}` : where,
		);

		formTitle(body, 'Project name', (value) => {
			this.projectName = value;
			if (!this.folderSlugTouched) {
				this.folderName = suggestFolderSlug(value);
				this.folderText?.setValue(this.folderName);
			}
			this.applySuggestedNoteFileName();
		});

		formSection(body, 'Identity');
		new Setting(body)
			.setName('Code')
			.setDesc('Unique. Stored in uppercase.')
			.addText((text) => {
				this.projectCodeText = text;
				text.setPlaceholder('e.g. ENG-012').onChange((value) => {
					this.projectCode = value;
					this.applySuggestedNoteFileName();
				});
			});
		new Setting(body)
			.setName('Organization')
			.addText((text) => {
				this.projectOrgText = text;
				text.setPlaceholder('e.g. MUSE');
				if (this.parentProject) {
					text.setDisabled(true);
					return;
				}
				text.onChange((value) => {
					this.projectOrg = value;
					this.syncBillableToOrganization(value);
				});
				new OrganizationSuggest(this.app, text.inputEl, this.projectTemplatesPath, (org) => {
					this.projectOrg = org.code;
					this.syncBillableToOrganization(org.code, org.billable);
				});
			});
		new Setting(body).setName('Billable').addDropdown((dropdown) => {
			this.billableDropdown = dropdown;
			dropdown
				.addOption('', 'Select…')
				.addOption('true', 'Billable')
				.addOption('false', 'Non-billable')
				.setValue('')
				.onChange((value) => {
					if (this.settingBillable) {
						return;
					}
					if (value === 'true') {
						this.billable = true;
					} else if (value === 'false') {
						this.billable = false;
					} else {
						this.billable = null;
					}
				});
		});
		new Setting(body).setName('New tasks are to-dos').addToggle((toggle) =>
			toggle.setValue(this.taskTodo).onChange((value) => {
				this.taskTodo = value;
			}),
		);

		formSection(body, 'File');
		new Setting(body)
			.setName('Folder')
			.addText((text) => {
				this.folderText = text;
				text.setPlaceholder('e.g. client-engagement').onChange((value) => {
					this.folderSlugTouched = true;
					this.folderName = value;
				});
			});
		new Setting(body)
			.setName('Note file')
			.addText((text) => {
				this.noteFileNameText = text;
				text.setPlaceholder('e.g. _prj-eng-012-client-engagement.md').onChange((value) => {
					if (this.settingNoteFileName) {
						return;
					}
					this.noteFileNameTouched = true;
					this.noteFileName = value;
				});
			});

		if (this.projectSkeletonChoices.length > 0 || this.taskTemplateChoices.length > 0) {
			formSection(body, 'Templates');
			this.addTemplateChoice(
				body,
				'Project skeleton',
				this.projectSkeletonChoices,
				(dropdown) => {
					this.projectSkeletonDropdown = dropdown;
				},
				(value) => {
					if (this.settingProjectSkeleton) {
						return;
					}
					this.projectSkeletonTouched = true;
					this.projectSkeletonStem = value;
				},
			);
			this.addTemplateChoice(
				body,
				'Task template',
				this.taskTemplateChoices,
				(dropdown) => {
					this.taskTemplateDropdown = dropdown;
				},
				(value) => {
					if (this.settingTaskTemplate) {
						return;
					}
					this.taskTemplateTouched = true;
					this.taskTemplateStem = value;
				},
			);
		}

		this.applyInitialOrganization();
		formActions(this, footer, () => {
			void this.submit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const projectName = this.projectName.trim();
		const folderName = this.folderName.trim();
		const projectCode = normalizeProjectCode(this.projectCode);
		const noteFileRaw = this.noteFileNameText?.inputEl.value ?? this.noteFileName;
		const noteFileName = normalizeNoteFilename(noteFileRaw);
		const projectOrg = normalizeOrganizationCode(
			this.projectOrgText?.inputEl.value ?? this.projectOrg,
		);

		if (!projectName) {
			new Notice('Project name is required.');
			return;
		}
		if (!folderName) {
			new Notice('Folder name is required.');
			return;
		}
		if (!projectCode) {
			new Notice('Project code is required.');
			return;
		}
		const codeError = identifierCodeError(projectCode);
		if (codeError) {
			new Notice(`Project code: ${codeError}`);
			return;
		}
		if (!noteFileName) {
			const raw = noteFileRaw.trim();
			new Notice(
				raw.includes('/') || raw.includes('\\')
					? 'Project note file name must not contain a path.'
					: 'Project note file name is required.',
			);
			return;
		}

		const duplicate = findProjectByCode(
			this.app,
			projectCode,
			this.projectTemplatesPath,
		);
		if (duplicate) {
			await alertAction(
				this.app,
				'Project code already in use',
				`msprj_prj_code "${projectCode}" is already used by ${duplicate.path}. Change the code and try again.`,
			);
			this.projectCode = '';
			this.projectCodeText?.setValue('');
			this.applySuggestedNoteFileName();
			this.projectCodeText?.inputEl.focus();
			return;
		}

		if (!projectOrg) {
			new Notice('Organization is required.');
			return;
		}
		const organization = findOrganizationByCode(
			this.app,
			projectOrg,
			this.projectTemplatesPath,
		);
		if (!organization) {
			const create = await confirmAction(
				this.app,
				'Create organization',
				`"${projectOrg}" is not an organization note. Create one?`,
				{ confirm: 'Yes', cancel: 'No' },
			);
			if (!create) {
				this.projectOrg = '';
				this.projectOrgText?.setValue('');
				this.projectOrgText?.inputEl.focus();
				return;
			}
			const created = await promptNewOrganization(this.app, {
				initialCode: projectOrg,
				templatesPath: this.projectTemplatesPath,
				weekStart: this.standardWeekStart,
				durationFormat: this.standardDurationFormat,
				clockFormat: this.standardClockFormat,
			});
			if (created) {
				this.projectOrg = created.code;
				this.projectOrgText?.setValue(created.code);
				this.syncBillableToOrganization(created.code, created.billable);
			}
			return;
		}

		const orgTaskStem = organizationTemplateStem(
			this.app,
			organization.file,
			MSPRJ_ORG_TPL_TASK,
		);
		const orgSkeletonStem = organizationTemplateStem(
			this.app,
			organization.file,
			MSPRJ_ORG_SKEL_PROJECT,
		);
		const skeletonSelection: SkeletonSelection =
			this.projectSkeletonChoices.length === 0
				? { kind: 'inherit', inheritedStem: orgSkeletonStem }
				: this.projectSkeletonStem
					? { kind: 'named', stem: this.projectSkeletonStem }
					: { kind: 'vault-default' };
		let skeleton: TFolder | null;
		try {
			skeleton = resolveSkeletonFolder(
				this.app,
				this.projectTemplatesPath,
				'project',
				skeletonSelection,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(message);
			return;
		}
		const taskTemplateStem =
			this.taskTemplateChoices.length === 0
				? null
				: storedTaskTemplateStem(this.taskTemplateStem || null, orgTaskStem);

		this.close();
		this.onSubmit({
			projectName,
			folderName,
			projectCode,
			projectOrg: organization.code,
			ownerPath: this.parentProject?.path ?? organization.file.path,
			child: this.parentProject !== null,
			billable: this.coalesceBillable(organization.billable),
			taskTodo: this.taskTodo,
			noteFileName,
			skeleton,
			taskTemplateStem,
		});
	}

	private addTemplateChoice(
		parent: HTMLElement,
		name: string,
		choices: string[],
		capture: (dropdown: DropdownComponent) => void,
		onChange: (value: string) => void,
	): void {
		if (choices.length === 0) {
			return;
		}
		new Setting(parent)
			.setName(name)
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Vault default');
				for (const stem of choices) {
					dropdown.addOption(stem, stem);
				}
				dropdown.setValue('');
				capture(dropdown);
				dropdown.onChange(onChange);
			});
	}

	private applyTaskTemplateDefault(stem: string | null): void {
		if (this.taskTemplateTouched || this.taskTemplateChoices.length === 0) {
			return;
		}
		const next = stem && this.taskTemplateChoices.includes(stem) ? stem : '';
		this.taskTemplateStem = next;
		this.settingTaskTemplate = true;
		this.taskTemplateDropdown?.setValue(next);
		this.settingTaskTemplate = false;
	}

	private syncTemplateChoices(org: OrganizationNote): void {
		this.applySkeletonDefault(
			organizationTemplateStem(this.app, org.file, MSPRJ_ORG_SKEL_PROJECT),
		);
		this.applyTaskTemplateDefault(
			organizationTemplateStem(this.app, org.file, MSPRJ_ORG_TPL_TASK),
		);
	}

	/** Show the organization's skeleton until the form chooses one. */
	private applySkeletonDefault(stem: string | null): void {
		if (this.projectSkeletonTouched || this.projectSkeletonChoices.length === 0) {
			return;
		}
		const next = stem && this.projectSkeletonChoices.includes(stem) ? stem : '';
		this.projectSkeletonStem = next;
		this.settingProjectSkeleton = true;
		this.projectSkeletonDropdown?.setValue(next);
		this.settingProjectSkeleton = false;
	}

	/** Organization named by the click. The field stays editable. */
	private applyInitialOrganization(): void {
		const code = normalizeOrganizationCode(this.initialOrganizationCode);
		if (!code) {
			return;
		}
		this.projectOrg = code;
		this.projectOrgText?.setValue(code);
		this.syncBillableToOrganization(code);
	}

	/** Fill the note file name from the code and name until the field is edited. */
	private applySuggestedNoteFileName(): void {
		if (this.noteFileNameTouched) {
			return;
		}
		const base = suggestProjectBasename(this.projectCode, this.projectName);
		this.noteFileName = base ? `${base}.md` : '';
		this.settingNoteFileName = true;
		this.noteFileNameText?.setValue(this.noteFileName);
		this.settingNoteFileName = false;
	}

	/** Form choice, otherwise the organization's billable, otherwise non-billable. */
	private coalesceBillable(organizationBillable: boolean | null): boolean {
		if (this.billable !== null) {
			return this.billable;
		}
		return typeof organizationBillable === 'boolean' ? organizationBillable : false;
	}

	/**
	 * Show the organization default while the form has not chosen a value.
	 * The shown value is not stored as the form choice.
	 */
	private syncBillableToOrganization(code: string, knownBillable?: boolean | null): void {
		const normalized = normalizeOrganizationCode(code);
		if (!normalized) {
			return;
		}
		const org = findOrganizationByCode(this.app, normalized, this.projectTemplatesPath);
		if (org) {
			this.syncTemplateChoices(org);
		}
		if (this.billable !== null) {
			return;
		}
		if (!org && typeof knownBillable !== 'boolean') {
			return;
		}
		const billable =
			typeof knownBillable === 'boolean'
				? knownBillable
				: typeof org?.billable === 'boolean'
					? org.billable
					: false;
		this.settingBillable = true;
		this.billableDropdown?.setValue(billable ? 'true' : 'false');
		this.settingBillable = false;
	}
}

function openPluginSettings(app: App): void {
	const setting = (
		app as unknown as {
			setting?: { open: () => void; openTabById: (id: string) => void };
		}
	).setting;
	if (!setting) {
		return;
	}
	setting.open();
	setting.openTabById('muse-projects');
}

/** Fields a right-click can answer. Anything omitted is still prompted. */
export interface NewProjectContext {
	/** Skip the destination picker. The new project folder is created inside it. */
	destination?: TFolder;
	/** Prefill Organization. Empty leaves the field blank. Ignored when a parent project is the owner. */
	organizationCode?: string;
	/**
	 * Project note that owns the new project.
	 * Wins over a project that contains the destination folder.
	 */
	ownerFile?: TFile;
}

/**
 * Run the New Project suggest/modal chain.
 * Context fills the destination, the organization, both, or neither.
 * The skeleton is chosen on the form. Vault default is `project/default`, and that folder's `_prj.md` is the project note.
 */
export async function runNewProjectFlow(
	plugin: MuseProjectsPlugin,
	context: NewProjectContext = {},
): Promise<void> {
	const { app } = plugin;
	const templatesPath = plugin.settings.projectTemplatesPath.trim();

	if (!templatesPath) {
		new Notice('Set Templates path in Muse Projects settings.');
		openPluginSettings(app);
		return;
	}

	const openFields = (dest: TFolder) => {
		const explicit = context.ownerFile
			? projectNoteFromFile(app, context.ownerFile, templatesPath)
			: null;
		if (context.ownerFile && !explicit) {
			new Notice('New Project needs a project note.');
			return;
		}
		const parent = explicit ?? nearestProjectInFolder(app, dest, templatesPath);
		let organizationCode = context.organizationCode ?? '';
		if (parent) {
			const above = organizationCodeAbove(app, parent.file);
			if (!above) {
				new Notice("This project's owner chain cannot be recovered.");
				return;
			}
			organizationCode = above;
		}
		new NewProjectFieldsModal(
			app,
			dest,
			templatesPath,
			plugin.settings.weekStart,
			plugin.settings.durationFormat,
			plugin.settings.clockFormat,
			plugin.settings.taskTodoDefault,
			organizationCode,
			parent?.file ?? null,
			async (fields) => {
				try {
					const primary = await scaffoldProject(
						app,
						dest,
						fields.folderName,
						fields.noteFileName,
						{
							project_name: fields.projectName,
							project_code: fields.projectCode,
							project_org: fields.projectOrg,
							owner_path: fields.ownerPath,
							billable: fields.billable,
							task_todo: fields.taskTodo,
						},
						{
							projectTemplatesPath: templatesPath,
							skeleton: fields.skeleton,
							taskTemplateStem: fields.taskTemplateStem,
							child: fields.child,
						},
					);
					new Notice(`Created project ${fields.projectCode}`);
					await app.workspace.getLeaf(false).openFile(primary);
				} catch (err) {
					const message =
						err instanceof ScaffoldError
							? err.message
							: err instanceof Error
								? err.message
								: String(err);
					new Notice(message);
					console.error('Muse Projects: New Project failed', err);
				}
			},
		).open();
	};

	if (context.destination) {
		openFields(context.destination);
		return;
	}
	new FolderSuggestModal(app, templatesPath, (picked) => {
		openFields(picked);
	}).open();
}
