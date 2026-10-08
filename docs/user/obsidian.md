# Using gtdpara with Obsidian

You can read and edit your todos and meetings in Obsidian, with the **Tasks** and **Dataview** plugins. The Supernote and Supernote Cloud keep gtdpara's `.txt` files; in Obsidian they appear as Markdown.

## Set up the sync

1. In Obsidian, install the community plugin **Supernote Cloud Sync** and sign in to Supernote Cloud.
2. Set its **Paired folder** to the folder that holds gtdpara's Projects and Areas folders - with the default settings, the Supernote's `Note` folder.
3. Sync. In the vault the files appear as `project.md`, `area.md` and `Inbox.md`. When you sync again, the plugin uploads your edits back as `.txt`.

Only the Paired folder syncs both ways. The plugin's mirrored folders only copy from Supernote Cloud to the vault, so edits made there never reach the Supernote.

## Rules that keep it working

- Never keep both `x.txt` and `x.md` in the Paired folder, in the vault or in Supernote Cloud: the sync stops or creates duplicates.
- Don't rename or create gtdpara's data files in Obsidian. Create projects and areas on the Supernote.
- Keep the section headings `## Tasks`, `## Meetings` and `## Marks` as they are.

## The round trip

From Obsidian to the Supernote:

1. Edit in Obsidian.
2. Sync the Supernote Cloud Sync plugin.
3. Sync the Supernote.
4. Open gtdpara. If a change doesn't show up, tap **Reload all files** in Settings → Advanced.

From the Supernote to Obsidian: sync the Supernote, then the plugin.

## Settings for the Tasks plugin

- Set **Task Format** to **Dataview**. Otherwise Tasks ignores gtdpara's fields and writes its own emoji format.
- Optionally switch on the Tasks settings that set a created date on new tasks and a done date when you tick a task. They write `[created:: …]` and `[completion:: …]`, the same fields gtdpara writes.

## Writing by hand

```
## Tasks
- [ ] Send the offer #next [due:: 2026-10-15]
- [ ] Signed contract back #wf/marco [due:: 2026-10-20]

## Meetings
- 2026-10-21 10:00-11:00 Retro #retro/alpha
```

- You type tags. Fields go at the end of the line.
- gtdpara puts the fields it knows (`meeting`, `created`, `due`, `completion`) in its fixed order the next time it saves the file. Other fields stay as you wrote them.
- Leave `→ [[…]]` (the item's note) and `+[[…]]` (a linked file) as they are.
- A meeting line is the date, then the time (`10:00`, `10:00-11:00`) or the length (`1d`, `2d`), then the title. See [Your files and folders](files-and-folders.md) for the whole format.

## Two example queries

An example for the Tasks plugin - open todos in your projects due within a week:

```tasks
not done
due before in 7 days
path includes 1 Projects
```

An example for Dataview - every open Waiting For todo:

```dataview
TASK
WHERE !completed AND any(tags, (t) => t = "#wf" OR startswith(t, "#wf/"))
```
