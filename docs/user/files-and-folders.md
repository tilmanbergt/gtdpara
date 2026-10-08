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

The names of files gtdpara creates leave out `\ / : * ? " < > |` (not allowed in file names) and `# [ ] ^`, which break links in Obsidian. They are replaced by a space, so `Plan [v2] #team` becomes `Plan v2 team`. Project and area names can't contain these characters at all. Files you named yourself are left as they are. Notes created by older versions of gtdpara can still have such names: **Run Integrity Check** in Settings → Advanced lists them, and **Fix file names** renames them all at once and updates their links (see [Settings](settings.md)).

## The Inbox folder

The Inbox has its own folder inside the Areas folder, so the `Note` folder holds only your PARA folders. gtdpara doesn't treat it as an area: it isn't listed on the Areas tab or in focus and refile. You can change its name in Settings, see [Settings](settings.md).

Up to version 0.1.0 the Inbox lived directly in `Note` (`Inbox.txt` plus `Todos` and `Meetings` folders). Versions 0.2 to 0.8 moved these into the Inbox folder on their first start; from 0.9.0 on gtdpara no longer does. If you still have them in `Note`, move them into the Inbox folder by hand; **Run Integrity Check** in Settings → Advanced points them out.

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

- [ ] Measure the raised beds #next [created:: 2026-09-28]
- [ ] Order soil #next [created:: 2026-09-28] [due:: 2026-10-03]
- [ ] Quote for the fence #wf/marco [due:: 2026-10-06]
- [x] Sketch the new layout [created:: 2026-09-20] [completion:: 2026-09-27]

## Meetings

- 2026-10-04 10:00-11:00 Site visit with Marco #marco
- 2026-10-21 2d Team offsite #monthly

## Weekly Goals

- 2026-W40: Beds measured and soil ordered
```

- `- [ ]` is an open todo, `- [x]` a done one, `- [-]` a cancelled one.
- A meeting line is date, then time (`10:00`, `10:00-11:00`) or length (`1d`, `2d`), then the title.
- On screen, dates are shown as day and month (`4.10.`, with the year when it isn't this year) and times in 24 hours (`9:30`); in the files they stay `2026-10-04` and `09:30`.
- A linked note appears at the end of a line as `→ [[Meetings/…]]`, a linked file as `+[[…]]`. A link to a page, from a lasso capture, ends in `#page=3`.
- A todo line ends in fields that gtdpara writes: `[created:: …]`, `[due:: …]` and `[completion:: …]`, in this order, after the links. A field you add yourself at the end of the line, for example `[priority:: high]`, is kept. In the middle of the text, `[key:: value]` is just text.
- Older lines with `#due:2026-10-03` or `#waiting-for:marco` are read as before. A line gets the new form only when you edit that todo; nothing is converted on its own.
- A `## Marks` section lists open lasso marks, one per line, see [Lasso](lasso.md).
- Lines gtdpara doesn't understand are kept as they are.

## Editing by hand

You can edit these files in any text editor, for example on your computer via Supernote Cloud. (Obsidian only lists `.md` files, so it won't show them without a plugin for other file types.) Afterwards, open gtdpara again: it reads the files that changed. If a change doesn't show up (a sync can keep a file's old time and size), tap **Reload all files** in Settings → Advanced. Keep the section headings (`## Tasks`, `## Meetings`, `## Marks`) as they are.

## Obsidian

The fields at the end of a todo line are in the format of the Obsidian **Tasks** plugin when its setting **Task Format** is **Dataview**; the **Dataview** plugin reads them too. With the default Task Format, Tasks ignores them.

- Tasks and Dataview only read files that Obsidian treats as Markdown. gtdpara's files stay `project.txt`, `area.txt` and `Inbox.txt`, so Obsidian reads these fields only if something on the Obsidian side presents those files as Markdown.
- Edits you make in Obsidian reach the Supernote only through the **Paired folder** of the Supernote Cloud Sync plugin, which syncs both ways. Its other, mirrored folders only copy from Supernote Cloud to your vault, so a change made there never reaches the device.

## What gtdpara keeps elsewhere

- **Settings** are stored inside the plugin. Profiles save them as files, see [Profiles](profiles-and-demo.md).
- **Pictures and handwriting of lasso marks** are kept in the plugin's own storage until the mark is processed, see [Lasso](lasso.md).
- **Exports** go to `EXPORT/gtdpara`: `profiles` for profile files, `debug` for logs, debug bundles and reports.
