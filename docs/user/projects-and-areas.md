# Projects and Areas

In PARA, a **project** is something with a clear end ("Garden renovation", "Team offsite"). An **area** is a responsibility without an end ("Health", "Home", "Team"). gtdpara gives each its own folder.

## Creating one

On the **Projects** or **Areas** tab, write a name into the field at the top and tap **Create Project** or **Create Area**. gtdpara creates the folder and its file. A name can't contain `\ / : * ? " < > |` or `# [ ] ^` (see [Your files and folders](files-and-folders.md)); the message says which character to remove.

You can also simply create a folder yourself - in the Supernote's file manager or on your computer - inside `1 Projects` or `2 Areas`. Every folder there is a project or area. The next time you open gtdpara it picks it up, gives it an abbreviation and creates its file.

## The Current tab

Tapping a project or area opens it on the **Current** tab:

- **Header**: name, kind and the abbreviation (tap to change it)
- **Scope**: one to three sentences about what this project or area is about. Tap to edit.
- **Focus**: daily, weekly and monthly focus, each with an optional goal for the week or month
- **Status**: Active, On Hold, Done (projects only) - and Close out… or Archive…
- **Files**: **Threads** first (it is open when the page opens), then the project's own folder (**Project Files**), **Resources** and the area's folder (**Area Files**, once one is assigned). On an area page: **Threads**, **Projects** (its projects at a glance), **Area Files** and **Resources**.
- **Todos** and **Meetings**, grouped and paged, with Quick Add above them

## Status

- **Active**: normal
- **On Hold**: paused on purpose. Stays out of pickers for new items; the Review asks now and then whether to pick it up again.
- **Done** (projects only): finished. The Review step "Done awaiting review" collects these for closing out.
- **Archived**: moved to the Archive folder.

On Hold and Done take the project or area out of focus. Putting an area on hold also puts its active projects on hold.

## Assigning a project to an area

A project can support one area. Tap **Assign to Area…** in the status section, then tap the area in the Files pane (the **Project Files** tab shows **Browse** with the areas while you pick). The area's **Projects** tab then lists the project. The project's files then also offer the area's folder. An area with active or on-hold projects can't be archived.

## Abbreviations

Every project and area gets a short abbreviation, suggested from its name (for example `GR`). You can change it; it must be unique. The Projects and Areas tabs show it after each name (`Garden renovation #GR`). Use it as a tag to file items directly - see [Quick Add](quick-add.md).

## Files and linked files

The Files pane browses the project folder, Resources and the area's folder. Tap a file to open it. The pin icon in the Resources path sets the folder this project opens in Resources by default. To link a file to a todo or meeting, see [Quick Add](quick-add.md).

Other projects and areas show in the Files pane only while you pick one:

- **Refile** and **Assign to Area…**: the **Project Files** tab turns into **Browse**, with Projects and Areas; it turns back when you are done. On an area page the **Projects** tab does this.
- Linking a file: the top of **Project Files** offers **Other Projects/Areas ›**, which opens Browse in the same tab, so you can link a file from another project or area. On an area page the **Projects** tab turns into **Project Files** (the folders of its projects) while you link a file.

When you start one of these while **Threads** or **Projects** is open, the Files pane switches to the files for the pick and back when you are done.

To open another project or area, use the Projects or Areas tab.

## Projects of an area

On an area page, the **Projects** tab lists the projects assigned to the area: active ones first, by name, then a folded row `2 on hold ▸`. Done and archived projects are not listed. Each row has two lines:

- the project's name (and `on hold` in the folded group), with **›**;
- `last 30.9. · next 14.10.`: its latest meeting and the next one (`—` when there is none), and `7 open · 2 next · w/f 12 d`: open todos, how many of them are `#next`, and how long the oldest thing you wait for has waited. A project without a todo you can act on (Someday/Maybe don't count) shows `no next action` instead of the `#next` count, as in the Review's "Stalled projects".

Tap a row to open the project. To browse the projects' folders, open the project; while you link a file, the tab shows them (see above).

## Threads

The **Threads** tab lists the counterparts of this project or area: the people, teams and series behind nested tags such as `#retro/alpha` (see [Threads](threads.md)). On a project with an area it shows the area's counterparts that this project's todos and meetings use; the tab's heading then names the area (`Threads · Coaching`), because that is where they are kept.

- **New**: counterparts you use but haven't confirmed yet. **Tend** keeps them, **Not** sets them aside. A counterpart you set aside that gets a new meeting comes back here as `back in use: name`.
- **Active**: the counterpart and, below it, `last 30.9. · next 14.10.` (its latest and next meeting) and what is open: `2 owe · w/f 18 d` (two todos you owe, the oldest thing you wait for has waited 18 days). A counterpart you only use with `#wf/name` or `#owe/name` shows `w/f only`, `owe only` or `w/f · owe only` instead of meeting dates. **▸** shows its threads (`#retro/alpha · next 14.10.`) with **+ next**, which puts the next meeting into Quick Add's Meeting tab like **+ Next retro** in the overview. **›** opens its overview.
- **n inactive ▸**: the counterparts set aside, folded. Unfolded, **Tend** takes one back.

Tap a counterpart's name to filter the Todos and Meetings on the right: only todos you owe it, wait for from it or that are relevant for it (the same three ways as in its overview), and only its meetings. A todo agreed in your 1:1 with Mieke but tagged `#101/sven` shows under both mieke and sven. A pill `mieke ✕` above Quick Add shows the filter; tap it, or the name again, to show everything.

While a counterpart is filtered, its row offers **Set inactive**. With open todos you first decide for each one under **I owe**, **Waiting for** and **Relevant**: **Done**, **Cancel** or **Keep** (Keep is preselected); **Set inactive** then applies them. With nothing open, one confirmation is enough. An inactive counterpart leaves the Weekly Review and the tag suggestions; its overview keeps working.

## Closing out and archiving

For a project the button is **Close out…**: a short wizard that checks nothing is left open, moves results to the area or Resources, can create one PDF of all the project's notes, and then archives it. For an area, **Archive…** shows where its folder goes and moves it to the Archive after you confirm. See [Closing out a project](close-out.md).
