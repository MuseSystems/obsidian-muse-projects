import { AbstractInputSuggest, App } from 'obsidian';
import { listOrganizations, type OrganizationNote } from './orgIndex';

export class OrganizationSuggest extends AbstractInputSuggest<OrganizationNote> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly templatesPath: string,
		private readonly onChoose?: (org: OrganizationNote) => void,
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): OrganizationNote[] {
		const organizations = listOrganizations(this.app, this.templatesPath);
		const q = query.toLowerCase().trim();
		if (!q) {
			return organizations;
		}
		return organizations.filter(
			(org) => org.code.toLowerCase().includes(q) || org.name.toLowerCase().includes(q),
		);
	}

	renderSuggestion(org: OrganizationNote, el: HTMLElement): void {
		el.setText(org.name === org.code ? org.code : `${org.code} — ${org.name}`);
	}

	selectSuggestion(org: OrganizationNote): void {
		this.setValue(org.code);
		this.onChoose?.(org);
		this.close();
	}
}
