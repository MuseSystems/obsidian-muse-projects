# Muse Systems Projects for Obsidian

## Summary

A lightweight, notes based system for managing organizations, projects, and documents using only Obsidian and core plugins.



### Inspiration

This entire project comes from tools I've used in the past for project management and various process, systems architecture, and development management as well as from Obsidian community plugins.  Specific inspiration has come from a number of Obsidian plugins which have shown me what Obsidian can do:

- [TaskNotes](https://tasknotes.dev/)
- [Tasks](https://publish.obsidian.md/tasks/Introduction)
- [Templater](https://silentvoid13.github.io/Templater/)
- [Day Planner](https://github.com/ivan-lednev/obsidian-day-planner)

Outside of Obsidian:

- [Sparx Enterprise Architect](https://sparxsystems.com/products/ea/)

### Rationale

I've used a number of different tools for managing projects and the various documentation and tracking requirements around them.  I've always appreciated what tools like Microsoft Project or modelling tools like Sparx Enterprise Architect offered, but rarely did I need the complex array of features and options that came with them.  This plugin aims to take ideas from the best of these large, comprehensive tools, along with ideas from Obsidian and the plugins available in that ecosystem, and bring them together into a "just right" tool for managing most of the projects that I work. 

Along with those broad strokes, I saw a need for a directed framework of standards and practices in working with generative AI tools in projects.  As LLM context windows shift, drift, and session starts create a brand new perspective which can be disjoint from the previous one, I've found that the directedness of a project and its deliverables can suffer.  By establishing a specific framework for recording discussions, decisions, and the kinds of artifacts that a typical project uses to organize across team members, we establish the means by which to keep LLM results more consistent.  This combination of knowledge base and process management is something that Obsidian is particularly well suited for, even if the deeper AI integration is really quite lacking today. 

Finally, with the advent of such powerful AI tools for design and development, relying on third party tools seems less necessary than it once did.  While I think replacing Obsidian itself, on a quality basis, is still quite a challenge and not worth the effort, replacing most plugins is feasible and desirable.  By reducing the number of community plugin dependencies, I hope to provide myself a tool which won't suffer the issues that community plugins suffer from: possible abandonment, undesired changes in direction or features, and the attack vector issues resulting from supply chain mismanagement, poor project management, or unfortunate changes in plugin maintainership.  This isn't to say that self-developed, LLM assisted development, or vibe coding doesn't bring its own challenges, but those are more under my control than that of some unknown third party.

Offering this as a publicly available plugin is simply to give another example of how Obsidian might be used.  Over the years I've benefited from the open sharing of projects like this and wanted to contribute this project in a similar spirit.  If it's useful or informative to you: enjoy!  If not... don't sweat it... it's not very expensive.  

## Expectations

### Management & Support

This project aims to create the simple project management system I intend to use to track my time and run my day across both professional and personal endeavours.  In short: it's made by me, for me.

There will not be regular support for this plugin and I'm not really looking for contributions.  If you're looking for a real usable set of tools that are aiming to gain a following and build a community, I recommend starting with the other Obsidian community plugins in the inspiration section of this readme.

Having said that.  I will leave a path to have discussions and even take PRs.  Please note, however, that there should be no expectations.  PRs will only be accepted if limited in scope to specific issues and only then with prior discussion via an issue, discussion, etc.

### Development Process

To be clear: this project is vibe coded for some definition of vibe coding.  While I do work professionally as a developer and I have many years of software development experience, I'm not at all interested in learning how to program or work with Obsidian at a low, technical level.  Mostly, the code is from Grok 4.7 Extra High (500K context), with intermittent reviews by Claude Opus 5.5 High (1M context).  While the code is generatively produced, the requirements, review, and usability testing is done by me working interactively with the AI tools.  I'm not doing large code reviews on this project as the stakes are too low and I feel that the adversarial use of different LLMs in coding and reviewing are sufficient for what I expect to get out of this project.

### Status

This project is active in the sense that I'm using the result and fixing or enhancing the plugin as I feel fit, but not on any particular schedule.  It is not a goal to develop this project beyond my needs or to build a community around it.

## Installing

Obsidian 1.15.0 or newer.

Install with [BRAT](https://github.com/TfTHacker/obsidian42-brat).

1. Install **BRAT** from Community plugins and enable it.
2. Command palette → **BRAT: Add a beta plugin for testing**. BRAT settings has the same action, **Add beta plugin**.
3. Enter [MuseSystems/obsidian-muse-projects](https://github.com/MuseSystems/obsidian-muse-projects).
4. Choose the latest release, or one release tag to stay on that tag. **Add Plugin**.
5. In Community plugins, refresh the list if **Muse Projects** is not listed, then enable it.

BRAT copies `manifest.json`, `main.js`, and `styles.css` from that GitHub release into the vault. The manifest `version` is the release number, such as `0.1.1`. The GitHub tag is that number with a `v` prefix, such as `v0.1.1`. BRAT settings can change the tracked release later.

On first load, if **Templates path** is empty and install was not skipped earlier, the plugin asks for a folder. **Install** writes the starting templates into that folder and saves the path. **Not now** leaves the built-in notes. Install later with **Settings → Muse Projects → Install starting templates**, or the command **Install starting templates**.

**New Project** requires **Templates path**. An empty path shows a notice and opens settings. When the path is set, create refuses a destination inside that folder.

## Using

Commands are in the command palette. The same creates are on a file-explorer folder menu and on a note right-click when that click supplies a destination or an owner. A multi-selection does not add them. The templates folder does not offer them.

| Command | Use |
|---|---|
| **New Organization** | Create an organization folder and note. A folder click sets the destination. An organization click sets the parent. |
| **New Project** | Create a project folder and note. Requires an organization code. A folder click sets the destination. An organization click fills the code. A project click creates a sub-project inside that project. |
| **New Task** | Create a task in a project folder. The palette uses the active project, or asks for one. |
| **New To-Do** | Create a to-do. The owner and folder come from the note or folder the command started from. |
| **New Document** | Create a document folder and note. |
| **New Contact**, **New Resource** | Create a contact or resource when an organization or a project is in scope. |
| **New Feature**, **New Module**, **New Requirement**, **New Test Case**, **New Question**, **New Contract Term**, **New Glossary Entry** | Create a subordinate note when a document is in scope. |
| **Clock in** | Open a time interval on a task. One open interval is allowed in the vault. |
| **Clock out** | Close the open interval. |
| **Edit time** | Edit intervals on the active task. |
| **Install starting templates** | Write shipped template files that are missing from the templates folder. |
| **Repair references** | Rewrite copied organization and project fields from owner links that still resolve. |

**Settings → Muse Projects** holds the templates path, report formats, the to-do counter, and the default for new tasks that are also to-dos.

Notes are recognized by the frontmatter field `msprj_archetype`, not by the file name.

Details: [docs/README.md](docs/README.md).

## Developing

This directory is the version-control root (jj, with colocated git). The enclosing vault is a local lab.

```bash
npm install
npm run dev      # watch; writes main.js
npm run build    # typecheck and production build
npm test
```

`npm run dev` rebuilds `main.js` on change and regenerates `src/bundledTemplates.gen.ts` when `templates/` changes. `npm run build` and `npm test` regenerate that file first, then typecheck. The production build minifies `main.js` and omits the inline sourcemap. That `main.js` is committed. The GitHub release BRAT installs also attaches `manifest.json`, `main.js`, and `styles.css`.

User documentation is [`docs/`](docs/README.md).

Working design notes are in `dev-notes/`. That directory is gitignored. It is not part of a release. Earlier jj commits still contain copies of those notes from before they were removed from the tree.
