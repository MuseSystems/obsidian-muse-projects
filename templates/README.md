# Muse templates

This folder is a Muse Projects template root. Set **Templates path** to this folder.

```text
organization/<layout>/         organization layouts (`default` is the vault default)
project/<layout>/              project layouts (`default` is the vault default)
document/<layout>/             document layouts (`default` is the vault default)
task/                          task note templates
todo/                          to-do note templates
feature/                       feature note templates
module/                        module note templates
requirement/                   requirement note templates
test-case/                     test case note templates
question/                      question note templates
contract-term/                 contract term note templates
glossary-entry/                glossary entry note templates
contact/                       contact note templates
resource/                      resource note templates
```

A layout is a folder of stock files plus the note template. The organization note template is `_org.md` at the layout root. The project note template is `_prj.md`. The document note template is `_doc.md`. Create copies the folder and renames that file to the new note's file name. Any other note with `msprj_archetype` set is a create error. The folder `default` is the vault default layout. Any other folder is a named layout.

Subordinate notes, contacts, and resources are single files, the same shape as `task/` and `todo/`. `default.md` is the vault default. Another file in that folder is a named template.

`msprj_org_todo_dir`, `msprj_prj_todo_dir`, and `msprj_doc_todo_dir` on the note name a folder inside the layout (`todos` in the shipped layouts). Create stores the vault path of that folder on the new note.

`default` is the organization one-sheet: a prospect, a company under research, or one you might apply to. The note has Relationship, What they do, Why they matter, and Open questions. Its folders are `contacts/`, `communications/`, `todos/`, and `llm/`. `client` is a professional services account. `employer` is an organization that employs you. Those two add `documents/`, `projects/`, and `notes/`, and their notes include the time-report blocks.

`default` is the project layout. Task notes are created in the project folder. `todos/` and `documents/` are the other catches, and `llm/` holds model collaboration notes. `software` splits that document catch into `documentation/`, `designs/`, `requirements/`, and `test-plans/`, and adds `notes/`. `services` is a professional services engagement, with `documents/`, `communications/`, and `notes/`. `household` is work on a place. `self-improvement` is a practice. Those two have `documents/` and `notes/`. Each of these five includes `llm/` with `brainstorming`, `analysis`, `planning`, and `functional`.

`default` is the simple document. Its folders are `notes/` and `todos/`. `design` is a product structure. The note has Intent, Structure, Decisions, and Open questions. Its folders are `modules/`, `features/`, `glossary/`, `notes/`, and `todos/`. `requirements` is what the product must do. The note has Scope, Requirements, Out of scope, and Open questions. Its folders are `requirements/`, `questions/`, `glossary/`, `notes/`, and `todos/`. `test-plan` is what will be shown. The note has Coverage, Environment, Cases, and Open questions. Its folders are `cases/`, `notes/`, and `todos/`. `guide` is reader-facing documentation. The note has Audience and How to read this. Its folders are `chapters/`, `glossary/`, `notes/`, and `todos/`. `msa` is a framework agreement. The note has Parties, Framework, Order process, Term, and Open terms. Its folders are `terms/`, `schedules/`, `notes/`, and `todos/`. `statement-of-work` is the scope of one engagement. The note has Scope, Deliverables, Assumptions, Acceptance, and Open terms. Its folders are `terms/`, `notes/`, and `todos/`.

Markdown in a layout receives the same tokens as the new note. `{{title}}` on the new note is the chosen file name without `.md`. On any other markdown file it is that file's basename.
