import type { SubordinateArchetypeId } from './constants';

export interface SubordinateKind {
	/** Frontmatter value and note-template folder. */
	id: SubordinateArchetypeId;
	/** Menu label after "New". */
	label: string;
	icon: string;
}

/** Fixed set. The context menu offers every entry when a document is in scope. */
export const SUBORDINATES: readonly SubordinateKind[] = [
	{ id: 'feature', label: 'Feature', icon: 'lucide-sparkles' },
	{ id: 'module', label: 'Module', icon: 'lucide-boxes' },
	{ id: 'requirement', label: 'Requirement', icon: 'lucide-list-checks' },
	{ id: 'test-case', label: 'Test Case', icon: 'lucide-flask-conical' },
	{ id: 'question', label: 'Question', icon: 'lucide-circle-help' },
	{ id: 'contract-term', label: 'Contract Term', icon: 'lucide-scale' },
	{ id: 'glossary-entry', label: 'Glossary Entry', icon: 'lucide-book-open' },
];

export function subordinateKind(id: SubordinateArchetypeId): SubordinateKind {
	const found = SUBORDINATES.find((kind) => kind.id === id);
	if (!found) {
		throw new Error(`Unknown subordinate archetype: ${id}`);
	}
	return found;
}
