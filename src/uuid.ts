const UUID_V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID version 4 from the platform CSPRNG. Canonical lowercase form. */
export function newObjectId(): string {
	return crypto.randomUUID();
}

/**
 * Lowercase UUID version 4, or null when `value` is not one.
 * Hex case is not part of the id.
 */
export function canonicalObjectId(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const id = value.trim().toLowerCase();
	return UUID_V4.test(id) ? id : null;
}
