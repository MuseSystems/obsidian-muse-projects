import type { OrgResourceArchetypeId } from './constants';

export interface OrgResourceKind {
	/** Frontmatter value and note-template folder. */
	id: OrgResourceArchetypeId;
	/** Menu label after "New". */
	label: string;
	icon: string;
}

/** Fixed set. The context menu offers every entry when an organization or a project is in scope. */
export const ORG_RESOURCES: readonly OrgResourceKind[] = [
	{ id: 'contact', label: 'Contact', icon: 'lucide-user' },
	{ id: 'resource', label: 'Resource', icon: 'lucide-library' },
];

export function orgResourceKind(id: OrgResourceArchetypeId): OrgResourceKind {
	const found = ORG_RESOURCES.find((kind) => kind.id === id);
	if (!found) {
		throw new Error(`Unknown resource archetype: ${id}`);
	}
	return found;
}
