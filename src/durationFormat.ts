/**
 * How a report prints a duration.
 * `hours-minutes` is hours and minutes (`1:30`).
 * `decimal-hours` is decimal hours, in hundredths of an hour (`1.50`).
 */
export const DURATION_FORMATS = ['hours-minutes', 'decimal-hours'] as const;

export type DurationFormat = (typeof DURATION_FORMATS)[number];

export const DEFAULT_DURATION_FORMAT: DurationFormat = 'hours-minutes';

export const DURATION_FORMAT_LABELS: Record<DurationFormat, string> = {
	'hours-minutes': 'Hours and minutes (1:30)',
	'decimal-hours': 'Decimal hours (1.50)',
};

/** Recognize a stored duration format. Blank and unknown values are null. */
export function parseDurationFormat(value: unknown): DurationFormat | null {
	if (typeof value !== 'string') {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	return normalized === 'hours-minutes' || normalized === 'decimal-hours' ? normalized : null;
}

/**
 * Duration format for a report about one organization.
 * A missing or unrecognized organization value uses the plugin standard.
 * A stored value stays in force when the plugin standard later changes.
 */
export function organizationReportDurationFormat(
	orgFormat: DurationFormat | null,
	standard: DurationFormat,
): DurationFormat {
	return orgFormat ?? standard;
}

/**
 * Print a duration for a report.
 * `minutes` may be fractional (a millisecond total divided by 60000).
 * Hours and minutes round to the nearest minute (`90.5` → `1:31`).
 * Decimal hours round to the nearest hundredth of an hour (`1` → `0.02`).
 * The hour count is not limited to 24.
 * Returns null when `minutes` is not a finite number, or is negative.
 */
export function formatReportedDuration(minutes: number, format: DurationFormat): string | null {
	if (!Number.isFinite(minutes) || minutes < 0) {
		return null;
	}
	if (format === 'decimal-hours') {
		const hundredths = Math.round((minutes / 60) * 100);
		const hours = Math.floor(hundredths / 100);
		const fraction = hundredths % 100;
		return `${hours}.${String(fraction).padStart(2, '0')}`;
	}
	const rounded = Math.round(minutes);
	const hours = Math.floor(rounded / 60);
	const remainder = rounded % 60;
	return `${hours}:${String(remainder).padStart(2, '0')}`;
}
