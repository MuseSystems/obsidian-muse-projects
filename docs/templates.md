# Templates

**Templates path** is one vault folder. The plugin reads this layout inside it:

```text
organization/<layout>/
project/<layout>/
document/<layout>/
task/
todo/
feature/
module/
requirement/
test-case/
question/
contract-term/
glossary-entry/
contact/
resource/
```

A layout is a folder of files plus the note template. The organization note template is `_org.md`. The project note template is `_prj.md`. The document note template is `_doc.md`. Create copies the folder and renames that file to the new note's file name. Any other note in the layout with `msprj_archetype` set is a create error.

The folder `default` is the vault default layout. Any other folder name is a named layout. Files placed directly in `organization/`, `project/`, or `document/` are ignored.

`default.md` in a note-template folder is the vault default for that note. Any other markdown file in that folder is a named template. The create form offers named templates when one exists besides `default.md`. A missing `default.md` uses the built-in note.

A missing `default` layout, when the choice is the vault default, is an empty folder and the built-in note. A stored `default` names that folder. Create fails when that folder is absent.

The templates folder is excluded from organization, project, and task scans, and from id repair. Create refuses a destination inside it.

## Install and update

The plugin ships a copy of `templates/`. **Install starting templates** writes files that are missing from the templates folder. Files already there stay, including files that differ from the shipped copy.

**Update installed templates** replaces a file that still matches the copy this plugin last wrote. An edited file stays. A file you removed stays removed until install writes it again. A file added in a newer plugin is written when that file has never been installed in this folder.

The first-load dialog uses the same install. **Not now** records the skip and does not ask again. Settings can install later.

The installed folder contains `README.md`, which lists the shipped layouts and their folders.

## Shipped layouts

Organization:

| Layout | Contents |
|---|---|
| `default` | One-sheet. Folders: `contacts/`, `communications/`, `todos/`, `llm/`. |
| `client` | Professional services account. Adds `documents/`, `projects/`, `notes/`. The note includes the time-report blocks. |
| `employer` | An organization that employs you. Same folders as `client`. The note includes the time-report blocks. |

Each organization layout includes `llm/` with `brainstorming/`, `analysis/`, `planning/`, and `functional/`.

Project:

| Layout | Contents |
|---|---|
| `default` | Task notes live in the project folder. Also `todos/`, `documents/`, `llm/`. |
| `software` | `documentation/`, `designs/`, `requirements/`, `test-plans/`, `notes/`, `todos/`, `llm/`. |
| `services` | `documents/`, `communications/`, `notes/`, `todos/`, `llm/`. |
| `household` | `documents/`, `notes/`, `todos/`, `llm/`. |
| `self-improvement` | `documents/`, `notes/`, `todos/`, `llm/`. |

Each project layout's `llm/` folder has `brainstorming/`, `analysis/`, `planning/`, and `functional/`.

Document:

| Layout | Contents |
|---|---|
| `default` | `notes/`, `todos/`. |
| `design` | `modules/`, `features/`, `glossary/`, `notes/`, `todos/`. |
| `requirements` | `requirements/`, `questions/`, `glossary/`, `notes/`, `todos/`. |
| `test-plan` | `cases/`, `notes/`, `todos/`. |
| `guide` | `chapters/`, `glossary/`, `notes/`, `todos/`. |
| `msa` | `terms/`, `schedules/`, `notes/`, `todos/`. |
| `statement-of-work` | `terms/`, `notes/`, `todos/`. |

## Tokens

Create replaces these tokens in copied markdown, once. An unknown token is left as written.

| Token | Value |
|---|---|
| `{{title}}` | On the new note, the file name without `.md`. On any other markdown file, that file's basename. |
| `{{date}}`, `{{time}}` | Core Templates date and time formats, when those settings exist. Otherwise `YYYY-MM-DD` and `HH:mm`. |
| `{{date:FORMAT}}`, `{{time:FORMAT}}` | Moment format, same as core Templates. |
| `{{msprj_*}}` | A value create already knows, such as `{{msprj_prj_name}}`, `{{msprj_org_code}}`, or `{{msprj_tsk_code}}`. |

`title`, `date`, and `time` are reserved. Quote tokens in frontmatter. `true` and `false` stay unquoted. There is no date arithmetic, conditional, or include.

The core Templates plugin is not required.

After tokens, create writes identity fields even when the template omitted them. On an organization or a project, a template path such as `todos` in `msprj_org_todo_dir` or `msprj_prj_todo_dir` is rewritten to the vault path of that folder inside the new note's folder. The folder is created when the layout omitted it. A blank value creates no folder. The same rule applies to `msprj_doc_todo_dir` on a document.
