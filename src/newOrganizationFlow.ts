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
import { alertAction } from './confirmModal';
import { displayFolderPath } from './explorerFolder';
import { formActions, formContext, formRow, formSection, formTitle, mountForm } from './formModal';
import { MSPRJ_ORG_CODE } from './constants';
import {
	CreateOrganizationError,
	createOrganizationNote,
} from './createOrganization';
import { listNoteTemplateFiles, selectableTemplateStems } from './noteTemplates';
import { chainFromFile } from './ownershipResolve';
import {
	findOrganizationByCode,
	nearestOrganizationInFolder,
	organizationFromFile,
	type OrganizationNote,
} from './orgIndex';
import { isUnderTemplatesPath } from './projectIndex';
import {
	resolveSkeletonFolder,
	selectableSkeletonNames,
	discoverSkeletons,
	type SkeletonSelection,
} from './skeletons';
import {
	identifierCodeError,
	normalizeNoteFilename,
	normalizeOrganizationCode,
	suggestFolderSlug,
	suggestOrganizationBasename,
} from './slug';
import { storedOrgChildTemplateStem } from './templateTokens';
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

export interface CreatedOrganization {
	code: string;
	billable: boolean;
}

export interface NewOrganizationOptions {
	/** Prefill the code field. Used when New Project offers to create the typed code. */
	initialCode?: string;
	/** Standalone command opens the new note. The project dialog does not. */
	openNote?: boolean;
	/** Templates root. Empty uses the built-in organization note. */
	templatesPath?: string;
	/** Initial week start. Defaults to Monday–Sunday. Stored even when it matches the plugin standard. */
	weekStart?: WeekStart;
	/** Initial duration format. Defaults to hours and minutes. Stored even when it matches the plugin standard. */
	durationFormat?: DurationFormat;
	/** Initial clock format. Defaults to 24-hour. Stored even when it matches the plugin standard. */
	clockFormat?: ClockFormat;
	/** Skip the destination picker. The new organization folder is created inside it. */
	folder?: TFolder;
	/**
	 * Organization note that owns the new organization.
	 * Wins over an organization that contains the destination.
	 */
	ownerFile?: TFile;
}

type ResolvedOrganizationOwner =
	| { kind: 'root' }
	| { kind: 'parent'; note: OrganizationNote }
	| { kind: 'broken'; message: string };

/**
 * Parent for a new organization.
 * A passed organization note wins. Otherwise the nearest organization at or above the destination.
 * None leaves the new organization a root.
 */
function resolveOrganizationOwner(
	app: App,
	destination: TFolder,
	templatesPath: string,
	ownerFile: TFile | null,
): ResolvedOrganizationOwner {
	const parent = ownerFile
		? organizationFromFile(app, ownerFile, templatesPath)
		: nearestOrganizationInFolder(app, destination, templatesPath);
	if (ownerFile && !parent) {
		return { kind: 'broken', message: 'New Organization needs an organization note.' };
	}
	if (!parent) return { kind: 'root' };
	const walked = chainFromFile(app, parent.file);
	if (!walked.ok) {
		return {
			kind: 'broken',
			message: "This organization's owner chain cannot be recovered.",
		};
	}
	return { kind: 'parent', note: parent };
}

/**
 * Prompt for a destination, then the organization folder, identity, and layout.
 * `options.folder` skips the destination picker. The new folder is created inside it.
 * `options.ownerFile` owns the new organization. Otherwise the nearest organization
 * at or above the destination does, and none leaves a root.
 * Resolves with the new organization, or null if the operator dismisses the prompt.
 */
export function promptNewOrganization(
	app: App,
	options: NewOrganizationOptions = {},
): Promise<CreatedOrganization | null> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (created: CreatedOrganization | null) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(created);
		};

		const templatesPath = options.templatesPath ?? '';
		const openFields = (folder: TFolder) => {
			const resolved = resolveOrganizationOwner(
				app,
				folder,
				templatesPath,
				options.ownerFile ?? null,
			);
			if (resolved.kind === 'broken') {
				new Notice(resolved.message);
				finish(null);
				return;
			}
			new NewOrganizationFieldsModal(
				app,
				folder,
				options,
				resolved.kind === 'parent' ? resolved.note : null,
				finish,
			).open();
		};
		if (options.ownerFile) {
			const explicit = resolveOrganizationOwner(
				app,
				app.vault.getRoot(),
				templatesPath,
				options.ownerFile,
			);
			if (explicit.kind === 'broken') {
				new Notice(explicit.message);
				finish(null);
				return;
			}
		}
		if (options.folder) {
			openFields(options.folder);
			return;
		}

		const folders = new FolderSuggestModal(
			app,
			options.templatesPath ?? '',
			openFields,
			() => finish(null),
		);
		folders.open();
	});
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private picked = false;

	constructor(
		app: App,
		private readonly templatesPath: string,
		private readonly onPick: (folder: TFolder) => void,
		private readonly onDismiss: () => void,
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
		this.picked = true;
		this.onPick(folder);
	}

	onClose(): void {
		super.onClose();
		// Choose may close the modal before or after onChooseItem. Wait so a pick is not treated as a cancel.
		window.setTimeout(() => {
			if (!this.picked) {
				this.onDismiss();
			}
		}, 0);
	}
}

class NewOrganizationFieldsModal extends Modal {
	private name = '';
	private folderName = '';
	private folderSlugTouched = false;
	private settingFolderName = false;
	private folderText: TextComponent | null = null;
	private code = '';
	private noteFileName = '';
	private noteFileNameTouched = false;
	private settingNoteFileName = false;
	private billable: boolean | null = null;
	private weekStart: WeekStart;
	private durationFormat: DurationFormat;
	private clockFormat: ClockFormat;
	private codeText: TextComponent | null = null;
	private noteFileNameText: TextComponent | null = null;
	private submitted = false;
	private orgSkeletonStem = '';
	private projectSkeletonStem = '';
	private taskTemplateStem = '';
	private readonly orgSkeletonChoices: string[];
	private readonly projectSkeletonChoices: string[];
	private readonly taskTemplateChoices: string[];

	constructor(
		app: App,
		private readonly folder: TFolder,
		private readonly options: NewOrganizationOptions,
		private readonly parent: OrganizationNote | null,
		private readonly finish: (created: CreatedOrganization | null) => void,
	) {
		super(app);
		this.weekStart = options.weekStart ?? DEFAULT_WEEK_START;
		this.durationFormat = options.durationFormat ?? DEFAULT_DURATION_FORMAT;
		this.clockFormat = options.clockFormat ?? DEFAULT_CLOCK_FORMAT;
		const templatesPath = options.templatesPath ?? '';
		this.orgSkeletonChoices = selectableSkeletonNames(
			discoverSkeletons(app, templatesPath, 'organization').map((skeleton) => skeleton.name),
		);
		this.projectSkeletonChoices = selectableSkeletonNames(
			discoverSkeletons(app, templatesPath, 'project').map((skeleton) => skeleton.name),
		);
		this.taskTemplateChoices = selectableTemplateStems(
			listNoteTemplateFiles(app, templatesPath, 'task'),
		);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('New organization');
		const { body, footer } = mountForm(this);
		const parentLine = this.parent ? `${this.parent.code} — ${this.parent.name}` : '';
		const where = displayFolderPath(this.folder.path);
		formContext(body, parentLine ? `${where} · ${parentLine}` : where);

		const initialCode = normalizeOrganizationCode(this.options.initialCode ?? '');
		this.code = initialCode;
		const initialBase = suggestOrganizationBasename(initialCode);
		this.noteFileName = initialBase ? `${initialBase}.md` : '';

		formTitle(body, 'Organization name', (value) => {
			this.name = value;
			this.applySuggestedFolderName();
			this.applySuggestedNoteFileName();
		});

		formSection(body, 'Identity');
		new Setting(body)
			.setName('Code')
			.setDesc('Unique. Stored in uppercase.')
			.addText((text) => {
				this.codeText = text;
				text.setPlaceholder('e.g. MUSE').setValue(initialCode).onChange((value) => {
					this.code = value;
					this.applySuggestedNoteFileName();
				});
			});
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

		formSection(body, 'Reports');
		const reports = formRow(body);
		new Setting(reports).setName('Week start').addDropdown((dropdown) => {
			for (const start of WEEK_STARTS) {
				dropdown.addOption(start, WEEK_START_LABELS[start]);
			}
			dropdown.setValue(this.weekStart).onChange((value) => {
				const parsed = parseWeekStart(value);
				if (parsed) {
					this.weekStart = parsed;
				}
			});
		});
		new Setting(reports).setName('Duration').addDropdown((dropdown) => {
			for (const format of DURATION_FORMATS) {
				dropdown.addOption(format, DURATION_FORMAT_LABELS[format]);
			}
			dropdown.setValue(this.durationFormat).onChange((value) => {
				const parsed = parseDurationFormat(value);
				if (parsed) {
					this.durationFormat = parsed;
				}
			});
		});
		new Setting(reports).setName('Clock').addDropdown((dropdown) => {
			for (const format of CLOCK_FORMATS) {
				dropdown.addOption(format, CLOCK_FORMAT_LABELS[format]);
			}
			dropdown.setValue(this.clockFormat).onChange((value) => {
				const parsed = parseClockFormat(value);
				if (parsed) {
					this.clockFormat = parsed;
				}
			});
		});

		formSection(body, 'File');
		new Setting(body)
			.setName('Folder')
			.addText((text) => {
				this.folderText = text;
				text.setPlaceholder('e.g. muse-systems').onChange((value) => {
					if (this.settingFolderName) {
						return;
					}
					this.folderSlugTouched = true;
					this.folderName = value;
				});
			});
		new Setting(body)
			.setName('Note file')
			.addText((text) => {
				this.noteFileNameText = text;
				text
					.setPlaceholder('e.g. _org-muse-muse-systems.md')
					.setValue(this.noteFileName)
					.onChange((value) => {
						if (this.settingNoteFileName) {
							return;
						}
						this.noteFileNameTouched = true;
						this.noteFileName = value;
					});
			});

		if (
			this.orgSkeletonChoices.length > 0 ||
			this.projectSkeletonChoices.length > 0 ||
			this.taskTemplateChoices.length > 0
		) {
			formSection(body, 'Templates');
			this.addTemplateChoice(body, 'Organization skeleton', this.orgSkeletonChoices, (value) => {
				this.orgSkeletonStem = value;
			});
			this.addTemplateChoice(body, 'Project skeleton', this.projectSkeletonChoices, (value) => {
				this.projectSkeletonStem = value;
			});
			this.addTemplateChoice(body, 'Task template', this.taskTemplateChoices, (value) => {
				this.taskTemplateStem = value;
			});
		}

		formActions(this, footer, () => {
			void this.submit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) {
			this.finish(null);
		}
	}

	private async submit(): Promise<void> {
		const name = this.name.trim();
		const code = normalizeOrganizationCode(this.code);
		const noteFileRaw = this.noteFileNameText?.inputEl.value ?? this.noteFileName;
		const noteFileName = normalizeNoteFilename(noteFileRaw);
		const folderName = this.folderName.trim();
		if (!name) {
			new Notice('Organization name is required.');
			return;
		}
		if (!folderName) {
			new Notice('Organization folder name is required.');
			return;
		}
		if (folderName.includes('/') || folderName.includes('\\')) {
			new Notice('Organization folder name must not contain path separators.');
			return;
		}
		if (!code) {
			new Notice('Organization code is required.');
			return;
		}
		const codeError = identifierCodeError(code);
		if (codeError) {
			new Notice(`Organization code: ${codeError}`);
			return;
		}
		if (!noteFileName) {
			const raw = noteFileRaw.trim();
			new Notice(
				raw.includes('/') || raw.includes('\\')
					? 'Organization note file name must not contain a path.'
					: 'Organization note file name is required.',
			);
			return;
		}
		if (this.billable === null) {
			new Notice('Organization billable is required — choose Billable or Non-billable.');
			return;
		}
		const weekStart = parseWeekStart(this.weekStart);
		if (!weekStart) {
			new Notice('Week start must be Monday–Sunday, Sunday–Saturday, or Saturday–Friday.');
			return;
		}
		const durationFormat = parseDurationFormat(this.durationFormat);
		if (!durationFormat) {
			new Notice('Duration format must be hours and minutes or decimal hours.');
			return;
		}
		const clockFormat = parseClockFormat(this.clockFormat);
		if (!clockFormat) {
			new Notice('Clock format must be 24-hour or 12-hour.');
			return;
		}

		const templatesPath = this.options.templatesPath ?? '';
		const duplicate = findOrganizationByCode(this.app, code, templatesPath);
		if (duplicate) {
			await alertAction(
				this.app,
				'Organization code already in use',
				`${MSPRJ_ORG_CODE} "${code}" is already used by ${duplicate.file.path}. Change the code and try again.`,
			);
			this.code = '';
			this.codeText?.setValue('');
			this.applySuggestedNoteFileName();
			this.codeText?.inputEl.focus();
			return;
		}

		const skeletonSelection: SkeletonSelection = this.orgSkeletonStem
			? { kind: 'named', stem: this.orgSkeletonStem }
			: { kind: 'vault-default' };
		let skeleton: TFolder | null;
		try {
			skeleton = resolveSkeletonFolder(
				this.app,
				templatesPath,
				'organization',
				skeletonSelection,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(message);
			return;
		}
		let file: TFile;
		try {
			file = await createOrganizationNote(
				this.app,
				this.folder,
				folderName,
				{
					name,
					code,
					billable: this.billable,
					weekStart,
					durationFormat,
					clockFormat,
					filename: noteFileName,
					projectSkeletonStem: storedOrgChildTemplateStem(
						this.projectSkeletonChoices.length === 0
							? null
							: this.projectSkeletonStem || null,
					),
					taskTemplateStem: storedOrgChildTemplateStem(
						this.taskTemplateChoices.length === 0 ? null : this.taskTemplateStem || null,
					),
					owner: this.parent?.file ?? null,
				},
				templatesPath,
				skeleton,
			);
		} catch (err) {
			const message =
				err instanceof CreateOrganizationError
					? err.message
					: err instanceof Error
						? err.message
						: String(err);
			new Notice(message);
			console.error('Muse Projects: New Organization failed', err);
			return;
		}

		this.submitted = true;
		this.finish({ code, billable: this.billable });
		this.close();
		new Notice(`Created organization ${code}`);
		if (this.options.openNote) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	private addTemplateChoice(
		parent: HTMLElement,
		name: string,
		choices: string[],
		onChange: (value: string) => void,
	): void {
		if (choices.length === 0) {
			return;
		}
		new Setting(parent)
			.setName(name)
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown.addOption('', 'Vault default');
				for (const stem of choices) {
					dropdown.addOption(stem, stem);
				}
				dropdown.setValue('');
				dropdown.onChange(onChange);
			});
	}

	/** Fill the folder name from the organization name until the field is edited. */
	private applySuggestedFolderName(): void {
		if (this.folderSlugTouched) {
			return;
		}
		this.folderName = suggestFolderSlug(this.name);
		this.settingFolderName = true;
		this.folderText?.setValue(this.folderName);
		this.settingFolderName = false;
	}

	/** Fill the note file name from the code and name until the field is edited. */
	private applySuggestedNoteFileName(): void {
		if (this.noteFileNameTouched) {
			return;
		}
		const base = suggestOrganizationBasename(this.code, this.name);
		this.noteFileName = base ? `${base}.md` : '';
		this.settingNoteFileName = true;
		this.noteFileNameText?.setValue(this.noteFileName);
		this.settingNoteFileName = false;
	}
}
