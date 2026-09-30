# gtdpara

**A calm GTD + PARA workspace for the Supernote.** Tasks, meetings and notes are filed as plain
text in your own Projects / Areas / Resources / Archive folders, so you can read and edit them
anywhere, with or without the plugin.

> Status: hobby project, first public release in preparation (0.1.0). Expect rough edges.
> Issues and ideas are welcome.

<!-- Screenshots: Daily, Project, Review (docs/user/images/) — coming with 0.1.0 -->

## Why gtdpara

- **Your files, not a database.** Every Project and Area is a folder. Its todos and meetings live
  in a small plain-text file inside it (`project.txt` / `area.txt`). Nothing is locked into the
  plugin; any text editor can open it.
- **GTD and PARA, made for e-ink and handwriting.** Capture with the lasso, file into a
  Project/Area, review weekly. Screens are paged instead of scrolled, with no notifications and
  no timers.
- **Keep your word clean.** gtdpara is built around a simple idea from Erhard and Jensen's work on
  integrity: say clearly what you are on the hook for, then keep it or consciously renegotiate
  it. `#next`, focus and `#now` exist to make that visible, not to pile up more to do.
- **Room for rest.** Nothing auto-suggests the next task. The gap after finishing something is
  yours.

## Features at a glance

- **Daily, Week and Month** views with meetings, due todos and next actions from what you focus on
- **Focus mode** (`#now`): only the few things you are doing right now
- **Quick Add** for todos, meetings and notes, with tags, due dates and refiling
- **Projects & Areas** with status, scope, abbreviations and linked files
- **Inbox + lasso capture** from handwriting
- **Weekly Review** hub with one clear step at a time
- **Note templates** (Tag Rules): new notes come with a background and pre-filled context
- **Project close-out**: a short wizard before archiving, with an optional PDF of all notes
- Experimental **Google Calendar** (ICS link) and **Gmail** (IMAP, in the Weekly Review) integrations

The **[user guide](docs/user/index.md)** explains every view and setting, and the ideas behind
them. The same pages are built into the plugin: tap **?** in the tab bar. See [CHANGELOG.md](CHANGELOG.md)
for what changed in each version, including which features are still experimental.

## Install

1. Download the latest `gtdpara-x.y.z.snplg` from
   [Releases](https://github.com/tilmanbergt/gtdpara/releases/latest).
2. Copy it to your Supernote and install it as a plugin (requires a firmware with plugin support).
3. Open gtdpara from the plugin sidebar in a note, then check **Settings → Folders**.

Updating: install the newer `.snplg` over the existing one. Read the *Upgrade notes* in the
changelog first.

## Help and bug reports

- Questions and ideas: [GitHub Discussions](https://github.com/tilmanbergt/gtdpara/discussions)
- Bugs: [open an issue](https://github.com/tilmanbergt/gtdpara/issues/new/choose) and include
  the version from Settings → About
- Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md)
- Privacy and network access: see [PRIVACY.md](PRIVACY.md)

## For developers

Architecture, design documents and build instructions are in [docs/dev/](docs/dev/README.md).

## License

[MIT](LICENSE) © 2026 Tilman Bergt. Built with React Native and Ratta's `sn-plugin-lib`.
gtdpara is an independent project and not affiliated with Ratta or Supernote.
