# Your files and folders

Everything gtdpara knows lives in ordinary files that you can read and edit yourself.

## The folder layout

With the default settings:

- `Note/1 Projects/<project>/project.txt`
- `Note/2 Areas/<area>/area.txt`
- `Note/2 Areas/0 Inbox/Inbox.txt`: captured items not yet filed
- `Note/3 Resources/`: your reference material
- `Note/4 Archive/<year>/`: archived projects and areas, see [Closing out a project](close-out.md)

Notes that gtdpara creates for todos and meetings go into `Todos` and `Meetings` folders inside the project or area, and for the Inbox inside its folder `0 Inbox`.

## File names

The names of files gtdpara creates leave out `\ / : * ? " < > |` (not allowed in file names) and `# [ ] ^`, which break links in Obsidian. They are replaced by a space, so `Plan [v2] #team` becomes `Plan v2 team`. Project and area names can't contain these characters at all. Files you named yourself are left as they are.

## The Inbox folder

The Inbox has its own folder inside the Areas folder, so the `Note` folder holds only your PARA folders. gtdpara doesn't treat it as an area: it isn't listed on the Areas tab or in focus and refile. You can change its name in Settings, see [Settings](settings.md).

Up to version 0.1.0 the Inbox lived directly in `Note` (`Inbox.txt` plus `Todos` and `Meetings` folders). The first start of a newer version moves these into the Inbox folder once and says so. If an area with the same name already exists, nothing is moved, the Inbox keeps working from `Note`, and you're asked to choose another name for the Inbox folder.

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

You can edit these files in any text editor, for example on your computer via Supernote Cloud. (Obsidian only lists `.md` files, so it won't show them without a plugin for other file types.) Afterwards, tap **Reload all files** in Settings → Advanced so gtdpara reads them again. Keep the section headings (`## Tasks`, `## Meetings`) as they are.

## What gtdpara keeps elsewhere

- **Settings** are stored inside the plugin. Profiles save them as files, see [Profiles](profiles-and-demo.md).
- **Exports** go to `EXPORT/gtdpara`: `profiles` for profile files, `debug` for logs, debug bundles and reports.
