import { localISODate, shiftISODate } from './dates';

/** Closed set. `monday` is Monday–Sunday. `sunday` is Sunday–Saturday. `saturday` is Saturday–Friday. */
export const WEEK_STARTS = ['monday', 'sunday', 'saturday'] as const;

export type WeekStart = (typeof WEEK_STARTS)[number];

export const DEFAULT_WEEK_START: WeekStart = 'monday';

export const WEEK_START_LABELS: Record<WeekStart, string> = {
	monday: 'Monday–Sunday',
	sunday: 'Sunday–Saturday',
	saturday: 'Saturday–Friday',
};

/** Weekday index matching `Date#getDay`. Saturday is 6. */
export function weekStartDay(start: WeekStart): 0 | 1 | 6 {
	if (start === 'sunday') {
		return 0;
	}
	if (start === 'saturday') {
		return 6;
	}
	return 1;
}

/** Recognize a stored week start. Blank and unknown values are null. */
export function parseWeekStart(value: unknown): WeekStart | null {
	if (typeof value !== 'string') {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'monday' || normalized === 'sunday' || normalized === 'saturday') {
		return normalized;
	}
	return null;
}

/**
 * Week for a report about one organization.
 * A missing or unrecognized organization value uses the plugin standard.
 * A stored value stays in force when the plugin standard later changes.
 */
export function organizationReportWeekStart(
	orgWeekStart: WeekStart | null,
	standard: WeekStart,
): WeekStart {
	return orgWeekStart ?? standard;
}

export interface CalendarWeek {
	/** First local calendar date, YYYY-MM-DD. */
	start: string;
	/** Last local calendar date, YYYY-MM-DD. Six days after `start`. */
	end: string;
}

/**
 * The seven local calendar dates that contain `isoDate`, beginning on `start`.
 * `isoDate` must be a real `YYYY-MM-DD` date. Returns null otherwise.
 */
export function weekContaining(isoDate: string, start: WeekStart): CalendarWeek | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match) {
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	const delta = (date.getDay() - weekStartDay(start) + 7) % 7;
	const weekStart = new Date(year, month - 1, day - delta);
	const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
	return { start: localISODate(weekStart), end: localISODate(weekEnd) };
}

/** The complete week before the week that contains `isoDate`. */
export function previousWeek(isoDate: string, start: WeekStart): CalendarWeek | null {
	const current = weekContaining(isoDate, start);
	if (!current) {
		return null;
	}
	const dayBefore = shiftISODate(current.start, -1);
	if (!dayBefore) {
		return null;
	}
	return weekContaining(dayBefore, start);
}
