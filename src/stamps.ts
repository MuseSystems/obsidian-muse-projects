/**
 * Extended ISO 8601 stamps with a numeric offset.
 * Canonical write form: YYYY-MM-DDTHH:mm:ss±HH:mm
 */

export interface ParsedStamp {
	/** Epoch milliseconds, including a fractional second when the source had one. */
	instant: number;
	canonical: string;
	date: string;
	time: string;
	offset: string;
}

const STAMP_RE =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|z|[+-]\d{2}(?::?\d{2})?)$/;

function pad(value: number, width = 2): string {
	return String(value).padStart(width, '0');
}

/** East-of-UTC minutes, formatted ±HH:mm. Zero is +00:00. */
export function formatOffset(eastMinutes: number): string {
	const sign = eastMinutes < 0 ? '-' : '+';
	const abs = Math.abs(eastMinutes);
	const hours = Math.floor(abs / 60);
	const minutes = abs % 60;
	return `${sign}${pad(hours)}:${pad(minutes)}`;
}

/** OS offset at `now`, as ±HH:mm. */
export function currentOffsetString(now: Date = new Date()): string {
	return formatOffset(-now.getTimezoneOffset());
}

function parseOffset(raw: string): number | null {
	if (raw === 'Z' || raw === 'z') {
		return 0;
	}
	const match = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(raw);
	if (!match?.[1] || !match[2]) {
		return null;
	}
	const hours = Number(match[2]);
	const minutes = match[3] ? Number(match[3]) : 0;
	if (hours > 23 || minutes > 59) {
		return null;
	}
	const total = hours * 60 + minutes;
	return match[1] === '-' ? -total : total;
}

function fractionMillis(frac: string | undefined): number {
	if (!frac) {
		return 0;
	}
	const millis = Number(frac.padEnd(3, '0').slice(0, 3));
	return Number.isFinite(millis) ? millis : 0;
}

function formatParts(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	eastMinutes: number,
): string {
	const date = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
	const time = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
	return `${date}T${time}${formatOffset(eastMinutes)}`;
}

/**
 * Resolve Z, ±HH, ±HHMM, ±HH:mm, and fractional seconds.
 * A zone-less string does not resolve.
 */
export function parseStamp(value: unknown): ParsedStamp | null {
	if (typeof value !== 'string') {
		return null;
	}
	const match = STAMP_RE.exec(value.trim());
	if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5] || !match[6] || !match[8]) {
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6]);
	if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
		return null;
	}
	const eastMinutes = parseOffset(match[8]);
	if (eastMinutes === null) {
		return null;
	}
	const millis = fractionMillis(match[7]);
	const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, millis);
	const check = new Date(asUtc);
	if (
		check.getUTCFullYear() !== year ||
		check.getUTCMonth() !== month - 1 ||
		check.getUTCDate() !== day
	) {
		return null;
	}
	const instant = asUtc - eastMinutes * 60_000;
	const canonical = formatParts(year, month, day, hour, minute, second, eastMinutes);
	return {
		instant,
		canonical,
		date: canonical.slice(0, 10),
		time: canonical.slice(11, 19),
		offset: canonical.slice(19),
	};
}

/** Floor the current time to a whole second and stamp the OS offset. */
export function stampNow(now: Date = new Date()): string {
	const floored = new Date(Math.floor(now.getTime() / 1000) * 1000);
	const eastMinutes = -floored.getTimezoneOffset();
	return formatParts(
		floored.getFullYear(),
		floored.getMonth() + 1,
		floored.getDate(),
		floored.getHours(),
		floored.getMinutes(),
		floored.getSeconds(),
		eastMinutes,
	);
}

/** Build a canonical stamp from the edit-modal fields. */
export function composeStamp(date: string, time: string, offset: string): ParsedStamp | null {
	return parseStamp(`${date.trim()}T${time.trim()}${offset.trim()}`);
}

/** Elapsed instant, as h:mm:ss. Hours are not wrapped. Negative spans read as 0:00:00. */
export function formatElapsed(milliseconds: number): string {
	const total = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}
