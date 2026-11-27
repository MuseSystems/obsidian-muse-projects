# Settings

**Settings → Muse Projects.**

| Setting | Stored as | Behavior |
|---|---|---|
| Templates path | `projectTemplatesPath` | Vault-relative template root. See [Templates](templates.md). **New Project** opens settings when this is empty. |
| Install starting templates | | Writes shipped template files that are missing. Files already in the folder stay. Asks for a folder when Templates path is empty. |
| Update installed templates | `updateInstalledTemplates` | Off by default. On, a file that still matches the last copy this plugin wrote is replaced, at the moment the setting is turned on and again on later loads. An edited file stays. A shipped file that has never been installed in this folder is added. A removed file stays removed until **Install starting templates** runs. |
| Standard week start | `weekStart` | Monday–Sunday, Sunday–Saturday, or Saturday–Friday. Monday–Sunday when unset. Reports that span organizations use this. A report for one organization uses that note's `msprj_org_week_start`. |
| Standard duration format | `durationFormat` | Hours and minutes (`1:30`) or decimal hours (`1.50`, hundredths of an hour). Hours and minutes when unset. A report for one organization uses `msprj_org_duration_format`. |
| Standard clock format | `clockFormat` | 24-hour (`14:30:05`) or 12-hour (`2:30:05 PM`). 24-hour when unset. Durations use the duration format. A report for one organization uses `msprj_org_clock_format`. |
| New tasks are to-dos | `taskTodoDefault` | Starting value of `msprj_prj_task_todo` on a new project, including a sub-project. Off when unset. The new-project form can change it for that project. |
| Next to-do number | `nextTodoId` | The next to-do takes this number, then the setting advances by one. The file name pads it to five digits. A value that is not an integer of 1 or greater loads as 1. |

Changing a standard week, duration, or clock setting does not change a value already stored on an organization note.
