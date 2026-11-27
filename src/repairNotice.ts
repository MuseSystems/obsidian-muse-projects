export interface RepairCounts {
	repaired: number;
	unresolved: number;
}

export function repairNotice(counts: RepairCounts): string {
	const repaired = countNote(counts.repaired, 'Repaired');
	const unresolved = countNote(counts.unresolved, 'Left');
	if (counts.repaired === 0 && counts.unresolved === 0) {
		return 'Owner references already match.';
	}
	if (counts.unresolved === 0) return `${repaired}.`;
	if (counts.repaired === 0) {
		return `${unresolved} with an owner chain that cannot be recovered.`;
	}
	return `${repaired}. ${unresolved} with an owner chain that cannot be recovered.`;
}

function countNote(count: number, verb: string): string {
	return `${verb} ${count} ${count === 1 ? 'note' : 'notes'}`;
}
