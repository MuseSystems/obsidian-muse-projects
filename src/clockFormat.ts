/**
 * How a report prints a civil clock time.
 * `24-hour` is `14:30:05`. `12-hour` is `2:30:05 PM`.
 * Seconds stay. This does not change a duration.
 */
export const CLOCK_FORMATS = ['24-hour', '12-hour'] as const;

export type ClockFormat = (typeof CLOCK_FORMATS)[number];

export const DEFAULT_CLOCK_FORMAT: ClockFormat = '24-hour';

export const CLOCK_FORMAT_LABELS: Record<ClockFormat, string> = {
	'24-hour': '24-hour (14:30:05)',
	'12-hour': '12-hour (2:30:05 PM)',
};

/** Recognize a stored clock format. Blank and unknown values are null. */
export function parseClockFormat(value: unknown): ClockFormat | null {
	if (typeof value !== 'string') {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	return normalized === '24-hour' || normalized === '12-hour' ? normalized : null;
}

/**
 * Clock format for a report about one organization.
 * A missing or unrecognized organization value uses the plugin standard.
 * A stored value stays in force when the plugin standard later changes.
 */
export function organizationReportClockFormat(
	orgFormat: ClockFormat | null,
	standard: ClockFormat,
): ClockFormat {
	return orgFormat ?? standard;
}

const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;

/**
 * Print a civil `HH:mm:ss` time.
 * `12-hour` uses `AM`/`PM`. Midnight is `12:00:00 AM`. Noon is `12:00:00 PM`.
 * Returns null when `time` is not a real `HH:mm:ss` time.
 */
export function formatReportedClock(time: string, format: ClockFormat): string | null {
	const match = TIME_RE.exec(time);
	if (!match?.[1] || !match[2] || !match[3]) {
		return null;
	}
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	const second = Number(match[3]);
	if (hour > 23 || minute > 59 || second > 59) {
		return null;
	}
	if (format === '24-hour') {
		return `${match[1]}:${match[2]}:${match[3]}`;
	}
	const suffix = hour < 12 ? 'AM' : 'PM';
	const hour12 = hour % 12 === 0 ? 12 : hour % 12;
	return `${hour12}:${match[2]}:${match[3]} ${suffix}`;
}
