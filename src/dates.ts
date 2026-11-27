/** Local calendar date as YYYY-MM-DD (Obsidian date property friendly). */
export function localISODate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function todayLocalISODate(now: Date = new Date()): string {
	return localISODate(now);
}

/** True when `isoDate` is a real calendar day, not only the YYYY-MM-DD shape. */
export function isCalendarDate(isoDate: string): boolean {
	return shiftISODate(isoDate, 0) !== null;
}

/**
 * Move a real `YYYY-MM-DD` date by a number of calendar days.
 * Negative `days` moves backward. Returns null when `isoDate` is not a real date.
 */
export function shiftISODate(isoDate: string, days: number): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match?.[1] || !match[2] || !match[3] || !Number.isFinite(days)) {
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	date.setDate(date.getDate() + days);
	return localISODate(date);
}
