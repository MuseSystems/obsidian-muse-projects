import type { App } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_ID,
	MSPRJ_PRJ_AMOUNT_BUDGET,
	MSPRJ_PRJ_BILLABLE,
	MSPRJ_PRJ_TASK_TODO,
	MSPRJ_PRJ_TPL_TASK,
	MSPRJ_PRJ_TODO_DIR,
	MSPRJ_PRJ_BILLING_MODEL,
	MSPRJ_PRJ_CODE,
	MSPRJ_PRJ_COMPLETED,
	MSPRJ_PRJ_DAILY_SURFACE,
	MSPRJ_PRJ_GENERAL_ADMIN,
	MSPRJ_PRJ_HOURS_BUDGET,
	MSPRJ_PRJ_HOURS_ESTIMATED,
	MSPRJ_PRJ_NAME,
	MSPRJ_PRJ_NEXT_TASK_ID,
	MSPRJ_PRJ_OPENED,
	MSPRJ_ORG_BILLABLE,
	MSPRJ_ORG_CODE,
	MSPRJ_ORG_NAME,
	MSPRJ_OWNER,
	MSPRJ_ORG_CLOCK_FORMAT,
	MSPRJ_ORG_DURATION_FORMAT,
	MSPRJ_ORG_TODO_DIR,
	MSPRJ_DOC_TODO_DIR,
	MSPRJ_TITLE,
	MSPRJ_ORG_WEEK_START,
	MSPRJ_REPORT_ORG,
	MSPRJ_ORG_SKEL_PROJECT,
	MSPRJ_ORG_TPL_TASK,
	MSPRJ_PRJ_ORG,
	MSPRJ_PRJ_PROPOSED,
	MSPRJ_PRJ_SOW_REF,
	MSPRJ_PRJ_STARTED,
	MSPRJ_PRJ_STATUS,
	MSPRJ_PRJ_TARGET_END,
	MSPRJ_TODO,
	MSPRJ_TDO_BLOCKED_BY,
	MSPRJ_TDO_CODE,
	MSPRJ_TDO_COMPLETED,
	MSPRJ_TDO_DUE,
	MSPRJ_TDO_SCHEDULED,
	MSPRJ_TDO_STATUS,
	MSPRJ_TDO_TITLE,
	MSPRJ_TSK_BILLABLE,
	MSPRJ_TSK_BLOCKED_BY,
	MSPRJ_TSK_CODE,
	MSPRJ_TSK_COMPLETED,
	MSPRJ_TSK_DUE,
	MSPRJ_TSK_GENERAL_ADMIN,
	MSPRJ_TSK_ORG,
	MSPRJ_TSK_PROJECT_CODE,
	MSPRJ_TSK_SCHEDULED,
	MSPRJ_TSK_STATUS,
	MSPRJ_TSK_TITLE,
} from './constants';

/** Obsidian property widget types we assign (vault `.obsidian/types.json`). */
export type ObsidianPropertyType =
	| 'text'
	| 'number'
	| 'checkbox'
	| 'date'
	| 'datetime'
	| 'multitext';

/**
 * Canonical types for Muse Projects properties.
 * Registered even when values are empty/null so Properties/Bases keep the right widgets.
 */
export const MSPRJ_PROPERTY_TYPES: Record<string, ObsidianPropertyType> = {
	[MSPRJ_ARCHETYPE]: 'text',
	[MSPRJ_ID]: 'text',
	[MSPRJ_OWNER]: 'text',
	[MSPRJ_PRJ_NAME]: 'text',
	[MSPRJ_PRJ_CODE]: 'text',
	[MSPRJ_ORG_NAME]: 'text',
	[MSPRJ_ORG_CODE]: 'text',
	[MSPRJ_ORG_BILLABLE]: 'checkbox',
	[MSPRJ_ORG_WEEK_START]: 'text',
	[MSPRJ_ORG_DURATION_FORMAT]: 'text',
	[MSPRJ_ORG_CLOCK_FORMAT]: 'text',
	[MSPRJ_ORG_TODO_DIR]: 'text',
	[MSPRJ_DOC_TODO_DIR]: 'text',
	[MSPRJ_TITLE]: 'text',
	[MSPRJ_REPORT_ORG]: 'text',
	[MSPRJ_ORG_SKEL_PROJECT]: 'text',
	[MSPRJ_ORG_TPL_TASK]: 'text',
	[MSPRJ_PRJ_ORG]: 'text',
	[MSPRJ_PRJ_STATUS]: 'text',
	[MSPRJ_PRJ_NEXT_TASK_ID]: 'number',
	[MSPRJ_PRJ_DAILY_SURFACE]: 'checkbox',
	[MSPRJ_PRJ_GENERAL_ADMIN]: 'checkbox',
	[MSPRJ_PRJ_BILLABLE]: 'checkbox',
	[MSPRJ_PRJ_TASK_TODO]: 'checkbox',
	[MSPRJ_PRJ_TPL_TASK]: 'text',
	[MSPRJ_PRJ_TODO_DIR]: 'text',
	[MSPRJ_PRJ_OPENED]: 'date',
	[MSPRJ_PRJ_PROPOSED]: 'date',
	[MSPRJ_PRJ_STARTED]: 'date',
	[MSPRJ_PRJ_TARGET_END]: 'date',
	[MSPRJ_PRJ_COMPLETED]: 'date',
	[MSPRJ_PRJ_SOW_REF]: 'text',
	[MSPRJ_PRJ_BILLING_MODEL]: 'text',
	[MSPRJ_PRJ_HOURS_ESTIMATED]: 'number',
	[MSPRJ_PRJ_HOURS_BUDGET]: 'number',
	[MSPRJ_PRJ_AMOUNT_BUDGET]: 'number',
	[MSPRJ_TSK_TITLE]: 'text',
	[MSPRJ_TSK_CODE]: 'text',
	[MSPRJ_TSK_PROJECT_CODE]: 'text',
	[MSPRJ_TSK_ORG]: 'text',
	[MSPRJ_TSK_GENERAL_ADMIN]: 'checkbox',
	[MSPRJ_TSK_STATUS]: 'text',
	[MSPRJ_TSK_COMPLETED]: 'date',
	[MSPRJ_TSK_SCHEDULED]: 'date',
	[MSPRJ_TSK_DUE]: 'date',
	[MSPRJ_TSK_BILLABLE]: 'checkbox',
	[MSPRJ_TSK_BLOCKED_BY]: 'multitext',
	[MSPRJ_TODO]: 'checkbox',
	[MSPRJ_TDO_TITLE]: 'text',
	[MSPRJ_TDO_CODE]: 'text',
	[MSPRJ_TDO_STATUS]: 'text',
	[MSPRJ_TDO_COMPLETED]: 'date',
	[MSPRJ_TDO_SCHEDULED]: 'date',
	[MSPRJ_TDO_DUE]: 'date',
	[MSPRJ_TDO_BLOCKED_BY]: 'multitext',
};

interface MetadataTypeManagerLike {
	setType: (property: string, type: string) => void | Promise<void>;
	getType?: (property: string) => string;
}

function getMetadataTypeManager(app: App): MetadataTypeManagerLike | null {
	const mgr = (app as unknown as { metadataTypeManager?: MetadataTypeManagerLike })
		.metadataTypeManager;
	return mgr ?? null;
}

/** Ensure vault property types match the Muse Projects schema. */
export async function ensureMsprjPropertyTypes(app: App): Promise<void> {
	const mgr = getMetadataTypeManager(app);
	if (!mgr?.setType) {
		console.warn(
			'Muse Projects: metadataTypeManager.setType unavailable; property types not registered.',
		);
		return;
	}

	for (const [property, type] of Object.entries(MSPRJ_PROPERTY_TYPES)) {
		if (mgr.getType?.(property) === type) {
			continue;
		}
		await Promise.resolve(mgr.setType(property, type));
	}
}
