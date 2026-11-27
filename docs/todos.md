# To-dos

A to-do is a note with `msprj_archetype: todo`. It is the informal work item. A project task is the reportable unit.

A to-do has no billable flag, no time-entry list, no organization field, and no general-admin field. Clock on a to-do whose owner is a task writes the interval on that task. See [Time](time.md).

## Number and file name

Each to-do takes **Next to-do number**, then that setting advances by one. The number is global in the vault. It is stored in `msprj_tdo_code`.

The code is `todo-00042`, plus the owning note's own code when it has one. Examples: `todo-00042-muse`, `todo-00042-eng-012`, `todo-00042-eng-012-001`. A copied code such as `msprj_tsk_project_code` is not used. No owner leaves the extra segment off.

The file name is `<code>-<title slug>.md`. Example: `todo-00042-eng-012-001-send-the-draft.md`. The card label uses the code and the title that was typed.

A failed create after the number is taken leaves a gap.

## Owner

`msprj_owner` is one wikilink, or empty. The owner is the note the command started from: an organization, a project, a document, a task, a subordinate, a contact, or a resource. A to-do cannot own a to-do. Starting from a to-do uses that to-do's owner, or leaves the new to-do unowned when that owner is missing.

A blocked-by entry can still name another to-do.

`msprj_todo` is on by default. The daily to-do lists read it. A project task with the flag on is listed the same way. See [Tasks](tasks.md).

## Create

**New To-Do** is on the command palette, on a folder right-click, and on a note right-click. A note or folder under the templates tree does not offer it.

The form asks for a title and a scheduled date. The date defaults to today. Empty is allowed. When `todo/` has a named template besides `default.md`, the form offers it. The vault default is `todo/default.md`, then the built-in note.

The folder starts as the containing entity's to-do directory when that folder exists. Otherwise it starts as the entity folder, or the clicked folder when there is no entity. The form can change the folder.

The containing entity is the innermost document, project, or organization. A folder is a document when its root holds exactly one document note. Otherwise it is a project when its root holds exactly one project note. Otherwise it is an organization when its root holds exactly one organization note. More than one document, or more than one project, skips that folder.

| Start | Owner | Starting folder |
|---|---|---|
| Document, project, or organization note | That note | That note's to-do directory, otherwise that note's folder |
| Task, subordinate, contact, resource, or other managed note inside one of those | That note | The entity's to-do directory, otherwise the entity folder |
| To-do | That to-do's owner, or empty | The entity's to-do directory when one contains it, otherwise the to-do's folder |
| Ordinary note inside one of those | That entity | The entity's to-do directory, otherwise the entity folder |
| Ordinary note outside all three | Empty | The note's folder |
| Folder inside one of those | That entity | The entity's to-do directory, otherwise the entity folder |
| Any other folder | Empty | That folder |
| No note and no folder | Empty | The form asks |

A project stores the directory on `msprj_prj_todo_dir`. An organization stores it on `msprj_org_todo_dir`. A document stores it on `msprj_doc_todo_dir`. The value on the entity note is a vault path. A sub-project, an inner document, and a child organization each use their own property. A missing, blank, or non-folder value uses the entity folder. The to-do does not copy the property.

## Fields

| Field | Role |
|---|---|
| `msprj_id` | UUID. Assigned once. |
| `msprj_tdo_title` | Display title. |
| `msprj_tdo_code` | `todo-00042` plus the owner code segment when there is one. |
| `msprj_owner` | Wikilink, or empty. |
| `msprj_tdo_status` | `backlog` on create. Same status list as a task. |
| `msprj_todo` | On by default. |
| `msprj_tdo_scheduled` | From the form. Empty allowed. |
| `msprj_tdo_due` | Empty on create. |
| `msprj_tdo_completed` | Local today when status enters `done` or `cancelled`. Cleared on exit. Moving between those two stamps today again. |
| `msprj_tdo_blocked_by` | List of references. Empty on create. A reference may name a task or a to-do. |

The first time the plugin sees a to-do, it records the status and does not invent a completion date. A later status change stamps or clears the date.

The card shows the status mark, the code and title, and scheduled and due when those dates are set. It has no billable pill. A wikilink to a to-do uses the same mark and label. Status clicks follow the task control. See [Tasks](tasks.md).

Active, Blocked, Backlog, and Completed Today include to-dos. The rules are in [Tasks](tasks.md). Those lists are not grouped.
