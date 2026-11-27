# Organizations

An organization is a note with `msprj_archetype: organization`.

## Create

**New Organization.**

1. Choose the destination folder. A right-click on one folder uses that folder and skips the picker.
2. The form asks for the name, folder name, code, note file name, billable choice, week start, duration format, and clock format. When `organization/` has a named layout besides `default`, the form offers it.
3. Create copies the layout to `destination/<folder name>/`. The layout's `_org.md` is renamed to the note file name. An empty layout writes the built-in note under that name.

The folder name starts as a slug of the name: lowercase, `[a-z0-9]` kept, any other run of characters becomes one hyphen, hyphens trimmed.

The code is stored uppercase. Allowed characters are letters, digits, hyphens, and underscores. It must start with a letter or digit. It must be unique among organization notes. A duplicate names the other note, clears the code, and returns to the form.

The note file name starts as `_org-<code slug>-<name slug>.md`. The name slug is omitted when the name produces none. A missing `.md` is added. A path is rejected.

Week start, duration format, and clock format start at the plugin standards. They are stored on the note even when they match those standards. Billable has no default. A child does not copy these from its parent.

The owner is the organization note the command started from, when it started from one. Otherwise it is the nearest organization at or above the destination. A folder whose root holds more than one organization note does not count, and the search continues upward. None leaves `msprj_owner` empty. A clicked organization note is the parent and still asks for a destination.

The form shows the destination path. The destination picker omits the templates folder. Create refuses a destination inside it.

If writing the organization note fails after the layout has been copied, the new folder is deleted.

The command opens the new note.

## Fields

| Field | Role |
|---|---|
| `msprj_id` | UUID. Assigned once. The plugin fills a missing or invalid id on load. The same id on more than one note is left unchanged and named in a notice. |
| `msprj_owner` | Wikilink to the parent organization. Empty on a root. |
| `msprj_org_name` | Display name. Required. |
| `msprj_org_code` | Code. Required. Unique. |
| `msprj_org_billable` | Billable. Required on create. |
| `msprj_org_week_start` | `monday`, `sunday`, or `saturday`. This organization's reports use it. A missing or unrecognized value uses the plugin standard until the note stores one. |
| `msprj_org_duration_format` | `hours-minutes` or `decimal-hours`. Same fallback as week start. |
| `msprj_org_clock_format` | `24-hour` or `12-hour`. Same fallback as week start. |
| `msprj_org_skel_project` | Project layout folder name. Empty means `project/default`, or an empty layout when that folder is missing. A stored `default` stays on `project/default`. |
| `msprj_org_tpl_task` | Task note template stem, such as `meeting` for `task/meeting.md`. Empty means `task/default.md`, then the built-in note. |
| `msprj_org_todo_dir` | Vault path of the to-do folder. See [To-dos](todos.md). |

A project under a child organization stores the child's code. That child's report counts the child's code. A parent report does not include a descendant organization's code.

Layouts: [Templates](templates.md). Reports: [Time](time.md).
