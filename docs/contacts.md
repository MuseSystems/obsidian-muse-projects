# Contacts and resources

A contact and a resource are notes on an organization or a project. They are not document subordinates. Neither has behavior of its own. Detection is `msprj_archetype`.

| Command | Archetype | File name |
|---|---|---|
| **New Contact** | `contact` | `contact-<title slug>.md` |
| **New Resource** | `resource` | `resource-<title slug>.md` |

Each note stores `msprj_archetype`, `msprj_id`, `msprj_title`, and `msprj_owner`. There is no code. `default.md` is the vault default. Another markdown file in that folder is a named template on the form. A missing `default.md` uses the built-in note.

The shipped contact template has Role and Reach sections. The shipped resource template has Where and Notes sections. Those headings are template text.

The context menu offers both when an organization or a project is in scope: the nearest entity is an organization or a project, or the clicked note is a contact or a resource. The clicked managed note is the owner. An ordinary note inside the organization or project is owned by that entity. A clicked folder inside one is owned by that entity, and the new file defaults to that folder. Either note may own another contact or resource.

The command palette uses the active note and refuses when no organization or project is in scope. The templates folder does not offer them.

A to-do started from a contact or a resource is owned by that note.
