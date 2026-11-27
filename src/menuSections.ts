import type { Menu } from 'obsidian';

/** Clock in, clock out, and edit time. Above the primary creates when any of them apply. */
export const CLOCK_MENU_SECTION = 'muse-projects-clock';

/** Organization, Project, and Document. */
export const PRIMARY_MENU_SECTION = 'muse-projects';

/**
 * Task, to-do, contact, resource, and subordinate creates.
 * A section with no items is skipped, so this separator appears only when one applies.
 */
export const CONTEXT_MENU_SECTION = 'muse-projects-context';

/**
 * Register clock, then the primary creates, then the contextual creates.
 * Obsidian inserts these names before the blank section, which sits above Delete,
 * draws a separator around a section that has items, and skips an empty one.
 * A name that is already present is dropped, so a later call keeps this order.
 * `addSections` is on the desktop menu and absent from the published typings.
 */
export function placeMenuSections(menu: Menu): void {
	const sectioned = menu as Menu & {
		addSections?: (sections: string[]) => void;
	};
	sectioned.addSections?.([CLOCK_MENU_SECTION, PRIMARY_MENU_SECTION, CONTEXT_MENU_SECTION]);
}
