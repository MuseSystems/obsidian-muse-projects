# Projects

A project is a note with `msprj_archetype: project`.

A project has one owner. A root project's owner is an organization note. A sub-project's owner is a project note. `msprj_prj_org` stores the code of the nearest organization above the project.

## Create

**New Project.** An organization note is required. An unknown code asks whether to create an organization. Yes opens **New Organization** with that code filled in. No clears the field and leaves the project form open.

1. Choose the destination folder. A right-click on one folder uses that folder.
2. The form asks for the project name, folder name, project code, note file name, organization code, and billable. It also asks whether new tasks are to-dos. That checkbox starts from the plugin setting **New tasks are to-dos**. A sub-project starts from that setting, not from the parent project.
3. When `project/` has a named layout besides `default`, the form offers it. The prefill is the organization's `msprj_org_skel_project` when that name is one of those layouts. Vault default uses `project/default`. Choosing vault default does not follow a stored organization layout, and vault default is not written onto the project.
4. Create copies the layout to `destination/<folder name>/`. The layout's `_prj.md` is renamed to the note file name.

The folder slug, code rules, and note file name follow the organization rules. The project note file name starts as `_prj-<code slug>-<name slug>.md`. The code must be unique among project notes. Notes under the templates path are ignored for that check.

Billable uses the form choice when one is selected. Otherwise it uses the organization's `msprj_org_billable`, or non-billable when that value is missing.

A right-click on a folder whose root holds exactly one organization note and no project note fills the organization code. A folder whose root holds exactly one project note creates the new project inside it, owned by that project. A right-click inside an organization note, or on that note in the file tree, fills the organization code and still asks for a destination. Billable, the task template, and the project layout follow that code and stay editable.

When the task-template choice differs from the organization's, the stem is stored on `msprj_prj_tpl_task`. An empty property inherits. A stored `default` stays on the vault default.

The destination picker omits the templates folder. Create refuses a destination inside it. An empty templates path opens settings.

If writing the project note fails after the layout has been copied, the new folder is deleted.

The command opens the new note.

## Fields

| Field | Role |
|---|---|
| `msprj_id` | UUID. Same rules as an organization. |
| `msprj_prj_name` | Display name. Required. |
| `msprj_prj_code` | Code. Required. Unique. |
| `msprj_owner` | Wikilink to the organization or parent project. |
| `msprj_prj_org` | Organization code copied from the nearest organization above. |
| `msprj_prj_status` | `active` on create when the template does not set it. Suggested values, not enforced: `proposal`, `pipeline`, `active`, `on-hold`, `complete`, `cancelled`. |
| `msprj_prj_next_task_id` | Next task number. Starts at 1. **New Task** takes it, then adds one. |
| `msprj_prj_billable` | Default billable value for a new task on this project. |
| `msprj_prj_task_todo` | While on, **New Task** sets `msprj_todo` on the new task. While off, **New Task** sets it off. A later edit affects tasks created after the edit. Absent means off. |
| `msprj_prj_daily_surface` | On for a root. Off for a sub-project. A sub-project can be turned on later. |
| `msprj_prj_general_admin` | Off on create when the template does not set a boolean. Tasks on a general-admin project stay on the General Admin list. The project is omitted from Active Projects. |
| `msprj_todo` | Off on create. The daily to-do lists read this flag. |
| `msprj_prj_tpl_task` | Task note template stem for this project. Empty inherits the organization, then `task/default.md`. |
| `msprj_prj_todo_dir` | Vault path of the to-do folder. A sub-project uses its own value. |
| `msprj_prj_opened` | Local date of create, when the template does not set it. |
| `msprj_prj_proposed` | Proposal or bid date. |
| `msprj_prj_started` | Work start. |
| `msprj_prj_target_end` | Target completion. Shown in the organization report's active-projects section. |
| `msprj_prj_completed` | Actual completion. |
| `msprj_prj_sow_ref` | Statement-of-work or engagement reference. |
| `msprj_prj_billing_model` | Suggested values, not enforced: `tm`, `fixed`, `retainer`. |
| `msprj_prj_hours_estimated` | Internal hours forecast. |
| `msprj_prj_hours_budget` | Contractual hours budget. |
| `msprj_prj_amount_budget` | Budget amount. USD. |

## Repair references

**Repair references** rewrites copied fields when the owner chain still resolves.

- On a project, `msprj_prj_org` is rewritten from the nearest organization above.
- On a task, `msprj_tsk_project_code`, `msprj_tsk_org`, and `msprj_tsk_general_admin` are rewritten from that chain.

A dangling link, a cycle, or a chain with no organization is left unchanged. The templates folder is skipped. A notice reports how many notes were rewritten and how many were left.

Layouts: [Templates](templates.md). Tasks: [Tasks](tasks.md).
