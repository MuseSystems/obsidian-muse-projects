# Time

Time is stored on the task, in `msprj_tsk_time_entries`. Billable is `msprj_tsk_billable` on the task. Every interval on that task shares it.

At most one interval in the vault has an empty end. Clock in and clock out do not change task status.

## Clock in

**Clock in.** The active file is used when it is a task. A to-do whose `msprj_owner` resolves to a task clocks that task and does not ask. Any other active note opens a task picker.

If that task already holds the open interval, a notice is shown and nothing is written. If another task holds the only open interval, that interval is closed and a new open interval is appended on the chosen task, both at the current stamp. If the open start is not strictly before that stamp, nothing is written.

A to-do card, a wikilink to that to-do, and the file and editor menus offer **Clock in** and **Clock out** when the owner is a task. The commands are omitted when the owner is missing, is not a task, or does not resolve.

## Clock out

**Clock out** closes the open interval at the current stamp and names the task. If nothing is open, a notice is shown. If the open start is not strictly before the stamp, nothing is written.

If more than one interval in the vault is open, clock in and clock out notice and write nothing.

## Status bar

| Open intervals | Bar |
|---|---|
| 0 | Hidden |
| 1 | Task code and elapsed time since the start, updated each second. Click clocks out. |
| 2 or more | The count and the task codes. Click shows the same notice as a refused clock out. Nothing is closed. |

Elapsed time is the difference between the open start and now.

While a task holds the only open clock, its card border is heavier and the label ends with a stopwatch. A to-do owned by that task shows the same border and stopwatch.

## Edit time

**Edit time** requires the active file to be a task. Each row has a civil date, a civil time, and an offset for the start, the same for the end when the row is closed, a note, and delete. A new row is a closed interval. The modal does not create an open interval. That remains **Clock in**.

The fields show the stored civil time and the stored offset. Save writes those values. `end` must be strictly after `start`. Overlaps are allowed. A total that sums intervals counts overlapping time more than once.

Save writes only when the list on disk still matches the list the modal opened with. If it does not, a notice is shown and nothing is written.

## Stored entry

```yaml
msprj_tsk_time_entries:
  - id: 3f1c0a5e-7b14-4d2a-8c91-6e0b4a2d91f7
    start: 2026-11-09T09:14:03-08:00
    end: 2026-11-09T11:02:41-08:00
    note: ""
```

| Key | Rule |
|---|---|
| `id` | UUID. The plugin assigns one. A missing, duplicate, or non-UUID value is replaced on write. A UUID is stored in lowercase. |
| `start` | Required. `YYYY-MM-DDTHH:mm:ss±HH:mm`. A zero offset is `+00:00`. |
| `end` | Empty while open. Otherwise the same form, strictly after `start`. |
| `note` | String. Empty on clock in and clock out. Changed in **Edit time**. |

The stamp uses the OS offset at the moment of clock in or clock out, including daylight-saving time. Duration is the difference of the instants. An interval may start in one offset and end in another. The whole interval stays on the start's civil date in reports, including the part after midnight.

A list the plugin cannot read is left unchanged. Clock in and clock out skip that note, name it, and still run against lists they can read. **Edit time** on that note can replace the list with an empty list after confirmation. That replacement discards the current value.

## Organization report

The report is a fenced code block. It does not write fields back to the note.

````markdown
```msprj-time-report
last-period
```
````

The body is one section token. An optional `org:` line names an organization code.

```text
org: MUSE
weekly
```

Which organization:

1. The `org:` line, when it is present.
2. The note itself, when it is an organization with `msprj_org_code`.
3. `msprj_report_org` on the note, when the note is not an organization.

Week start, duration format, and clock format come from that organization note. A missing or unrecognized value uses the plugin standard.

The report counts tasks whose `msprj_tsk_org` matches the organization code. Closed intervals only. An open interval is omitted. A list that cannot be read is skipped, and the block names the note and the reason.

| Section | Window |
|---|---|
| `active-projects` | Projects for the organization with status `active` and general admin off. Columns: Code, Name, Target Date (`msprj_prj_target_end`), Status, Description. Name links to the project. Description is the first body paragraph after headings, fences, lists, and link-only lines. Ordered by code. |
| `last-period` | The previous complete week for the organization's week start. Days newest first. Rows oldest start first. Days with no intervals are omitted. |
| `daily` | The 30 calendar days ending today. Dates newest first. |
| `weekly` | Weeks whose start is on or after today minus 364 days, at most 52 weeks. Newest first. |
| `projects` | The weekly window, split by project. A project's total includes time from projects it owns, and that inclusion continues up the chain. Each interval is still one row in the day and week totals, on the project that owns the task. Adding every project heading together counts descendant time again. Projects A to Z. |

A week row is labeled `Week of YYYY-MM-DD`, the first day of that week. A day heading is the date, the total, and each category that does not round to a zero duration. Detail columns are Start, End, Hours, Category, Project, and File. The file cell links to the task. When that link resolves, the task control replaces it with the status mark and `<code> - <title>`. Totals columns are Date or Week, Total Hours, Billable, and Non-billable.

Hours and minutes round to the nearest minute (`1:30`). Decimal hours round to the nearest hundredth (`1.50`). The hour count does not wrap at 24. 24-hour clock text is `HH:mm:ss`. 12-hour clock text is `h:mm:ss AM/PM`. Midnight is `12:00:00 AM`. Noon is `12:00:00 PM`.

The `client` and `employer` organization layouts include these blocks. Notes already created do not gain them.

An empty window still shows the section heading, then a paragraph. The block redraws when metadata changes. A body-only edit does not redraw it.

The container class is `.msprj-time-report`, with `data-section` set to the section token. A snippet can set `--msprj-report-title-color`, `--msprj-report-group-color`, `--msprj-report-header-rule`, and `--msprj-report-row-rule` on that class.
