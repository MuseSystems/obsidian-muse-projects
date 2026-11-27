import { ButtonComponent, Modal } from 'obsidian';

/** Create dialogs. Scoped so a snippet can restyle them without touching every Setting. */
export function mountForm(modal: Modal): { body: HTMLElement; footer: HTMLElement } {
	modal.modalEl.addClass('msprj-form');
	const body = modal.contentEl.createDiv({ cls: 'msprj-form-body' });
	const footer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
	return { body, footer };
}

/** Where the new note will land, and a parent when there is one. */
export function formContext(parent: HTMLElement, text: string): void {
	parent.createDiv({ cls: 'msprj-form-context', text });
}

/** The name or title. Seeds the suggested folder and file names. */
export function formTitle(
	parent: HTMLElement,
	placeholder: string,
	onChange: (value: string) => void,
): HTMLInputElement {
	const input = parent.createEl('input', { cls: 'msprj-form-title' });
	input.type = 'text';
	input.placeholder = placeholder;
	input.addEventListener('input', () => onChange(input.value));
	window.setTimeout(() => input.focus(), 0);
	return input;
}

export function formSection(parent: HTMLElement, label: string): void {
	parent.createDiv({ cls: 'msprj-form-section', text: label });
}

/** Short controls that sit side by side, such as the three report formats. */
export function formRow(parent: HTMLElement): HTMLElement {
	return parent.createDiv({ cls: 'msprj-form-row' });
}

export function formActions(modal: Modal, footer: HTMLElement, onCreate: () => void): void {
	new ButtonComponent(footer).setButtonText('Cancel').onClick(() => {
		modal.close();
	});
	new ButtonComponent(footer)
		.setButtonText('Create')
		.setCta()
		.onClick(onCreate);
}
