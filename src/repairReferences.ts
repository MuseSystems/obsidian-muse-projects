import { App, Notice, TFile } from 'obsidian';
import {
	MSPRJ_ARCHETYPE,
	MSPRJ_PRJ_ORG,
	MSPRJ_TSK_GENERAL_ADMIN,
	MSPRJ_TSK_ORG,
	MSPRJ_TSK_PROJECT_CODE,
	isProjectArchetype,
	isTaskArchetype,
} from './constants';
import { derivedProjectOrgCode, derivedTaskFacts } from './ownership';
import { chainFromFile } from './ownershipResolve';
import { isUnderTemplatesPath } from './projectIndex';
import { repairNotice, type RepairCounts } from './repairNotice';
import { adminNeedsWrite, orgNeedsWrite } from './taskListFields';

export type { RepairCounts };

/**
 * Rewrite derived fields from owner chains that still satisfy the rules.
 * A dangling link, a cycle, or a chain with no organization is left unchanged.
 */
export async function repairDerivedReferences(
	app: App,
	templatesPath: string,
): Promise<RepairCounts> {
	let repaired = 0;
	let unresolved = 0;
	for (const file of app.vault.getMarkdownFiles()) {
		if (isUnderTemplatesPath(file.path, templatesPath)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) continue;
		if (isProjectArchetype(fm[MSPRJ_ARCHETYPE])) {
			const outcome = await repairProject(app, file, fm);
			if (outcome === 'repaired') repaired += 1;
			if (outcome === 'unresolved') unresolved += 1;
		} else if (isTaskArchetype(fm[MSPRJ_ARCHETYPE])) {
			const outcome = await repairTask(app, file, fm);
			if (outcome === 'repaired') repaired += 1;
			if (outcome === 'unresolved') unresolved += 1;
		}
	}
	return { repaired, unresolved };
}

export async function runRepairReferences(app: App, templatesPath: string): Promise<void> {
	const counts = await repairDerivedReferences(app, templatesPath);
	new Notice(repairNotice(counts));
}

type Outcome = 'repaired' | 'unchanged' | 'unresolved';

async function repairProject(
	app: App,
	file: TFile,
	fm: Record<string, unknown>,
): Promise<Outcome> {
	const walked = chainFromFile(app, file);
	if (!walked.ok) return 'unresolved';
	const orgCode = derivedProjectOrgCode(walked.ancestors);
	if (!orgCode) return 'unresolved';
	if (!orgNeedsWrite(fm[MSPRJ_PRJ_ORG], orgCode)) return 'unchanged';
	await app.fileManager.processFrontMatter(file, (live) => {
		if (!isProjectArchetype(live[MSPRJ_ARCHETYPE])) return;
		const again = chainFromFile(app, file);
		if (!again.ok) return;
		const code = derivedProjectOrgCode(again.ancestors);
		if (!code || !orgNeedsWrite(live[MSPRJ_PRJ_ORG], code)) return;
		live[MSPRJ_PRJ_ORG] = code;
	});
	return 'repaired';
}

async function repairTask(
	app: App,
	file: TFile,
	fm: Record<string, unknown>,
): Promise<Outcome> {
	const walked = chainFromFile(app, file);
	if (!walked.ok) return 'unresolved';
	const facts = derivedTaskFacts(walked.ancestors);
	if (!facts) return 'unresolved';
	if (!taskNeedsWrite(fm, facts)) return 'unchanged';
	await app.fileManager.processFrontMatter(file, (live) => {
		if (!isTaskArchetype(live[MSPRJ_ARCHETYPE])) return;
		const again = chainFromFile(app, file);
		if (!again.ok) return;
		const next = derivedTaskFacts(again.ancestors);
		if (!next || !taskNeedsWrite(live, next)) return;
		live[MSPRJ_TSK_PROJECT_CODE] = next.projectCode;
		live[MSPRJ_TSK_ORG] = next.orgCode;
		live[MSPRJ_TSK_GENERAL_ADMIN] = next.generalAdmin;
	});
	return 'repaired';
}

function taskNeedsWrite(
	fm: Record<string, unknown>,
	facts: { projectCode: string | null; orgCode: string; generalAdmin: boolean },
): boolean {
	return (
		orgNeedsWrite(fm[MSPRJ_TSK_PROJECT_CODE], facts.projectCode) ||
		orgNeedsWrite(fm[MSPRJ_TSK_ORG], facts.orgCode) ||
		adminNeedsWrite(fm[MSPRJ_TSK_GENERAL_ADMIN], facts.generalAdmin)
	);
}
