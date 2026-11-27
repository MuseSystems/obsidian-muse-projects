# Documents

A document is a folder whose root note has `msprj_archetype: document`. The file name is not used to detect it.

A document has no code. The title is `msprj_title`. The file name starts as `_doc-<title slug>.md`.

## Create

**New Document** is on the command palette, on a folder right-click, and on a note right-click. The templates folder does not offer it.

The form asks for a title, a folder name, a note file name, and a layout when `document/` has a named layout besides `default`. Vault default is `document/default`, then an empty folder and the built-in note.

The new folder is created inside the destination. A right-click uses the clicked folder, or the clicked note's folder. The palette uses the active note's folder when there is one.

`msprj_owner` is the managed note the command started from. An ordinary note is owned by the organization, project, or document that contains it. Empty means unowned.

`msprj_doc_todo_dir` is this document's to-do folder. An inner document uses its own value. See [To-dos](todos.md).

`msprj_id` is a UUID assigned by the plugin.

Shipped layouts are `default`, `design`, `requirements`, `test-plan`, `guide`, `msa`, and `statement-of-work`. See [Templates](templates.md).

## Subordinate notes

These notes can be created under a document or under another subordinate. The document layout does not limit which of them it may contain. None of them has its own commands beyond create.

| Command | Archetype | File name |
|---|---|---|
| **New Feature** | `feature` | `feature-<title slug>.md` |
| **New Module** | `module` | `module-<title slug>.md` |
| **New Requirement** | `requirement` | `requirement-<title slug>.md` |
| **New Test Case** | `test-case` | `test-case-<title slug>.md` |
| **New Question** | `question` | `question-<title slug>.md` |
| **New Contract Term** | `contract-term` | `contract-term-<title slug>.md` |
| **New Glossary Entry** | `glossary-entry` | `glossary-entry-<title slug>.md` |

Each note stores `msprj_archetype`, `msprj_id`, `msprj_title`, and `msprj_owner`. There is no code. `default.md` in that archetype's template folder is the vault default. Another markdown file there is a named template on the form. A missing `default.md` uses the built-in note.

The context menu offers the whole set when a document is in scope: the clicked note is a document or a subordinate, or the nearest containing entity is a document. The clicked managed note is the owner. An ordinary note inside the document is owned by the document. A clicked folder inside the document is owned by the document, and the new file defaults to that folder.

The command palette uses the active note and refuses when no document is in scope.
