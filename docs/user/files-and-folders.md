# Your files and folders

Everything gtdpara knows lives in ordinary files that you can read and edit yourself.

## The folder layout

With the default settings:

- `Note/1 Projects/<project>/project.txt`
- `Note/2 Areas/<area>/area.txt`
- `Note/3 Resources/`: your reference material
- `Note/4 Archive/<year>/`: archived projects and areas, see [Closing out a project](close-out.md)
- `Note/Inbox.txt`: captured items not yet filed

Notes that gtdpara creates for todos and meetings go into `Todos` and `Meetings` folders inside the project or area.

## Inside project.txt

A project file is plain text in three parts: a short header, then sections.

```
---
kind: project
status: active
dailyFocus: true
area: Home
abbrev: GR
---

## Scope

Turn the back garden into a vegetable garden before winter.

## Tasks

- [ ] Measure the raised beds #next
- [ ] Order soil #next #due:2026-10-03
- [x] Sketch the new layout

## Meetings

- 2026-10-04 10:00-11:00 Site visit with Marco #marco
- 2026-10-21 2d Team offsite #monthly

## Weekly Goals

- 2026-W40: Beds measured and soil ordered
```

- `- [ ]` is an open todo, `- [x]` a done one, `- [-]` a cancelled one.
- A meeting line is date, then time (`10:00`, `10:00-11:00`) or length (`1d`, `2d`), then the title.
- A linked note appears at the end of a line as `→ [[Meetings/…]]`, a linked file as `+[[…]]`.
- Lines gtdpara doesn't understand are kept as they are.

## Editing by hand

You can edit these files in any text editor, for example on your computer via Supernote Cloud. (Obsidian only lists `.md` files, so it won't show them without a plugin for other file types.) Tap 🔄 in gtdpara afterwards to reload. Keep the section headings (`## Tasks`, `## Meetings`) as they are.

## What gtdpara keeps elsewhere

- **Settings** are stored inside the plugin. Profiles save them as files, see [Profiles](profiles-and-demo.md).
- **Exports** go to `EXPORT/gtdpara`: `profiles` for profile files, `debug` for logs, debug bundles and reports.
