# Tasks

A task is a note with `msprj_archetype: task`. Tasks are flat. A task belongs to one project. Breakdown is a sub-project.

Task notes are created in the project folder, next to the project note.

The file name is `task-<code-lower>-<title slug>.md`. Example: `task-eng-012-001-draft-sow.md`. The code itself has no `task-` prefix. The code is `<project code>-<id>` with the id padded to three digits. Example: `ENG-012-001`. The id comes from the project's `msprj_prj_next_task_id`.

## Create

**New Task.**

The palette uses the active note when it resolves to a project. Otherwise it asks for a project. A right-click on a folder shows the command when that folder's root contains exactly one project note. A right-click in a project note, or on that note in the file tree, uses that project. The task file is still written in the project folder.

The form asks for a title, a scheduled date, and billable. The scheduled date defaults to today. Empty is allowed. The date must be `YYYY-MM-DD` when it is set. Billable starts from the project's `msprj_prj_billable`.

`msprj_todo` is not on the form. It is copied from the project's `msprj_prj_task_todo`. Absent on the project means off.

When `task/` has a named template besides `default.md`, the form offers it. The prefill is the project's `msprj_prj_tpl_task`, otherwise the organization's `msprj_org_tpl_task`, otherwise `task/default.md`. The choice applies to that task only. A stored `default` stays on the vault default.

The built-in note and `task/default.md` use a heading `<code> - <title>`. Create inserts that heading when the rendered note has none.

## Fields

| Field | Role |
|---|---|
| `msprj_id` | UUID. Assigned once. |
| `msprj_tsk_title` | Display title. |
| `msprj_tsk_code` | Allocated code, such as `ENG-012-001`. |
| `msprj_owner` | Wikilink to the project. |
| `msprj_tsk_project_code` | Project code copied from the project. |
| `msprj_tsk_org` | Organization code copied from the organization above that project. |
| `msprj_tsk_general_admin` | Copied from the project's `msprj_prj_general_admin`. |
| `msprj_tsk_status` | `backlog` on create. Also `active`, `blocked`, `done`, `cancelled`. |
| `msprj_tsk_completed` | Local today when status enters `done` or `cancelled`. Cleared when status leaves those two. Moving from one of them to the other stamps today again. |
| `msprj_tsk_scheduled` | Date from the form. Empty allowed. |
| `msprj_tsk_due` | Empty on create. |
| `msprj_tsk_billable` | From the form. |
| `msprj_todo` | From the project's `msprj_prj_task_todo`. The daily to-do lists read it. |
| `msprj_tsk_blocked_by` | List of task references. Empty on create. Edit it in Properties. |
| `msprj_tsk_time_entries` | Empty list on create. See [Time](time.md). |

A task created after startup keeps the completion date it was created with. The date changes on the next status transition. **Repair references** rewrites the copied project code, organization code, and general-admin flag. See [Projects](projects.md).

## Status control

On the task note, a card is drawn under Properties. It shows a status mark, the heading `<code> - <title>`, and pills for the task code, the project name when it resolves (otherwise the project code), scheduled and due when those dates are set, and billable when the task is billable.

A click on the mark moves:

| From | To |
|---|---|
| `backlog` | `active` |
| `active` | `done` |
| `done` | `backlog` |
| `blocked`, `cancelled`, empty, or any other value | `backlog` |

Right-click the card for the full status list, **Clock in** or **Clock out**, and **Edit time**. The current status is checked. Clock does not change status.

The mark is an empty circle for `backlog`, a dot for `active`, a dash for `blocked`, a filled circle for `done`, and an x for `cancelled`. Any other value is a dashed circle, and the card shows that text. A `done` or `cancelled` card strikes the title.

A wikilink to a task note, with no heading or block, is replaced by the mark and `<code> - <title>`. The title opens the task. A heading link or an embed stays an ordinary link or embed.

In a Bases view of type **Task cards** (`msprj-task-cards`), each task in the query is the same card, without a border until that task holds the open clock. A click opens the task. Modifier-click and middle-click open it in a new tab. On the task note's own card, a click does not open another copy.

While that task holds the only open clock, the card border is heavier and the label ends with a stopwatch.

The file explorer and the editor menu on a task note offer the same clock, edit time, and status items.

A snippet can restyle the control. The control sets `data-status` to the stored status. Each pill sets `data-pill` to `code`, `project`, `scheduled`, `due`, `billable`, or `status` for an unknown value. Classes are `.msprj-task-control.is-card`, `.msprj-task-control.is-link`, `.msprj-task-mark`, `.msprj-task-title`, and `.msprj-task-pill`. The mark color is `--msprj-status-color`.

## Daily lists

The plugin does not create a daily note. Daily notes stay with the core Daily Notes plugin. A base selects the rows. Grouping in the table is the grouping for that base. The **Task cards** view renders task and to-do rows.

An open blocker is a `msprj_tsk_blocked_by` or `msprj_tdo_blocked_by` entry that resolves to a task or a to-do whose status is not `done` or `cancelled`.

| List | Rule |
|---|---|
| Time | Status `active`, or an open interval in `msprj_tsk_time_entries`. General admin excluded. Group by `msprj_tsk_org`. |
| General Admin | `msprj_tsk_general_admin`, status not `done` or `cancelled`. Group by `msprj_tsk_project_code`. |
| Active | `msprj_todo`. Status `active`, or `backlog` with scheduled or due on or before today. No open blocker. |
| Blocked | `msprj_todo`. Status not `done` or `cancelled`, and status `blocked` or an open blocker. |
| Backlog | `msprj_todo`. Status `backlog`, no open blocker, and neither scheduled nor due on or before today. |
| Completed Today | `msprj_todo`. Status `done` or `cancelled`, and the completed date is the daily note's `date`. |
| Active Projects | Project status `active`, `msprj_prj_daily_surface` on, general admin off. Group by `msprj_prj_org`. |

A task with `msprj_todo` on and status `active` is on Time and on Active. To-do rows read `msprj_tdo_*` on a to-do and `msprj_tsk_*` on a flagged task. Tasks on a child project stay on these lists.

Completed Today reads the embedding note's `date`. An empty date uses today.
