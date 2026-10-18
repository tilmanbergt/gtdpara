# Projects and Areas

In PARA, a **project** is something with a clear end ("Garden renovation", "Team offsite"). An **area** is a responsibility without an end ("Health", "Home", "Team"). gtdpara gives each its own folder.

## Creating one

On the **Projects** or **Areas** tab, write a name into the field at the top and tap **Create Project** or **Create Area**. gtdpara creates the folder and its file. A name can't contain `\ / : * ? " < > |` or `# [ ] ^` (see [Your files and folders](files-and-folders.md)); the message says which character to remove.

You can also simply create a folder yourself - in the Supernote's file manager or on your computer - inside `1 Projects` or `2 Areas`. Every folder there is a project or area. The next time you open gtdpara it picks it up, gives it an abbreviation and creates its file.

## The Current tab

Every row on the Projects and Areas tabs ends with the notebook icon of its home notebook (see "Home notebooks" below). Tapping a project or area opens it on the **Current** tab:

- **Header**: name, kind and the abbreviation (tap to change it); **Notebook** opens its home notebook, or creates it (see "Home notebooks" below); **Engage ›** opens [Engage](engage.md) for this project or area
- **Scope**: one to three sentences about what this project or area is about. Tap to edit.
- **Focus**: daily, weekly and monthly focus, each with an optional goal for the week or month
- **Status**: Active, On Hold, Done (projects only) - and Close out… or Archive…
- **Files pane**: up to four tabs. On a project: **Threads** (open when the page opens), **Loops**, **Notebook** and **Files**. On an area: **Threads**, **Projects** (its projects at a glance), **Notebook** and **Files**. **Notebook** shows the home notebook with its years and contents; it is there while the Default note setup uses one notebook. Inside **Files** a second row picks the place: **Project**, **Area** (once one is assigned) and **Resources** on a project; **Area** and **Resources** on an area. **Files** opens on the page's own folder.
- **Todos** and **Meetings**, grouped and paged, with Quick Add above them. Todos are grouped Next, Waiting For, Plan (no flow state: planned, not yet next), Someday and Maybe

## Status

- **Active**: normal
- **On Hold**: paused on purpose. Stays out of pickers for new items; the Review asks now and then whether to pick it up again.
- **Done** (projects only): finished. The Review step "Done awaiting review" collects these for closing out.
- **Archived**: moved to the Archive folder.

On Hold and Done take the project or area out of focus. Putting an area on hold also puts its active projects on hold.

## Assigning a project to an area

A project can support one area. Tap **Assign to Area…** in the status section, then tap the area in the Files pane (**Files** opens with **Browse** in place of **Project**, showing the areas, while you pick). The area's **Projects** tab then lists the project. The project's files then also offer the area's folder. An area with active or on-hold projects can't be archived.

Once assigned, the button reads **Area: name ✕**. Tap the name to open the area; tap **✕** to remove the assignment. To move the project to another area, tap **✕** and then **Assign to Area…** again.

## Abbreviations

Every project and area gets a short abbreviation, suggested from its name (for example `GR`). You can change it; it must be unique. The Projects and Areas tabs show it after each name (`Garden renovation #GR`). Use it as a tag to file items directly - see [Quick Add](quick-add.md).

## Files and linked files

The Files pane browses the project folder, Resources and the area's folder. Tap a file to open it. The pin icon in the Resources path sets the folder this project opens in Resources by default. To link a file to a todo or meeting, see [Quick Add](quick-add.md).

Other projects and areas show in the Files pane only while you pick one:

- **Refile** and **Assign to Area…**: **Files** opens, and its **Project** place turns into **Browse**, with Projects and Areas; the other places are greyed out. It turns back when you are done. On an area page the **Projects** tab does this.
- Linking a file: **Files** opens on **Project**; the top of its list offers **Other Projects/Areas ›**, which opens Browse in the same place, so you can link a file from another project or area. On an area page the **Projects** tab turns into **Project Files** (the folders of its projects) while you link a file.

When you start one of these while **Threads**, **Loops** or **Projects** is open, the Files pane switches to the files for the pick and back to that tab when you are done.

To open another project or area, use the Projects or Areas tab.

## Projects of an area

On an area page, the **Projects** tab lists the projects assigned to the area: active ones first, by name, then a folded row `2 on hold ▸`. Done and archived projects are not listed. Each row has two lines:

- the project's name (and `on hold` in the folded group), with **›**;
- `last 30.9. · next 14.10.`: its latest meeting and the next one (`—` when there is none), and `7 open · 2 next · w/f 12 d`: open todos, how many of them are `#next`, and how long the oldest thing you wait for has waited. A project without a next action - no `#next` todo and nothing you wait for; planned, Someday and Maybe todos don't count - shows `no next action` instead of the `#next` count, as in the Review's "Stalled projects". Loops show it the same way.

Tap a row to open the project. To browse the projects' folders, open the project; while you link a file, the tab shows them (see above).

## Threads

The **Threads** tab lists the counterparts of this project or area: the people, teams and series behind nested tags such as `#retro/alpha` (see [Threads](threads.md)). On a project with an area it shows the area's counterparts that this project's todos and meetings use; the tab's heading then names the area (`Threads · Coaching`), because that is where they are kept.

- **New**: counterparts you use but haven't confirmed yet. **Tend** keeps them, **Not** sets them aside. A counterpart you set aside that gets a new meeting comes back here as `back in use: name`.
- **Active**: the counterpart and, below it, `last 30.9. · next 14.10.` (its latest and next meeting) and what is open: `2 owe · w/f 18 d` (two todos you owe, the oldest thing you wait for has waited 18 days). A counterpart you only use with `#wf/name` or `#owe/name` shows `w/f only`, `owe only` or `w/f · owe only` instead of meeting dates. **▸** shows its threads (`#retro/alpha · next 14.10.`) with **+ next**, which puts the next meeting into Quick Add's Meeting tab like **+ Next retro** in the overview.
- **n inactive ▸**: the counterparts set aside, folded. Unfolded, **Tend** takes one back.

Tap a counterpart's name to open its overview (see [Threads](threads.md)).

Tap **Filter** on its row to filter the Todos and Meetings on the right: only todos you owe it, wait for from it or that are relevant for it (the same three ways as in its overview), and only its meetings. A todo agreed in your 1:1 with Mieke but tagged `#101/sven` shows under both mieke and sven. The row's pill turns into **Filter ✕** and a pill `mieke ✕` above Quick Add shows the filter; tap either to show everything.

While a counterpart is filtered, its row offers **Set inactive**. With open todos you first decide for each one under **I owe**, **Waiting for** and **Relevant**: **Done**, **Cancel** or **Keep** (Keep is preselected); **Set inactive** then applies them. With nothing open, one confirmation is enough. An inactive counterpart leaves the Weekly Review and the tag suggestions; its overview keeps working.

## Home notebooks

Every project and area has one obvious place to write: its **home notebook**. It is the notebook of the **Default** note setup, made for that project or area - with the standard name `{name} {year}`, "Garden renovation 2026.note" in the project's own folder. One tap takes you there; then gtdpara gets out of the way.

The home notebook exists only while the Default uses **One notebook** (Settings → Note setups → Default → Notes). With **Own note per item** there are no notebook icons, no Notebook tab and no "Go to" line. The Inbox has no home notebook.

### The notebook icon

A small notebook icon sits at the end of every row on the **Projects** and **Areas** tabs, on the focus rows of **Daily**, on the focus cards of **Week** and **Month**, and as **Notebook** at the top of a project's or area's page.

- **Plain notebook**: the notebook exists. A tap opens it on the page you last looked at in Supernote.
- **Notebook with +**: it doesn't exist yet. A tap asks first - "new file Garden renovation 2026.note" with **Create** - then creates it and opens its first page. Afterwards the status line names the new file and its folder.
- **A new year**: with `{year}` in the name, this year's notebook may be missing while last year's is there. Then the status line offers **Create 2027** and **Open 2026**.

Creating a note only works when gtdpara was opened from a note (a limit of the Supernote).

### The Home page

A new home notebook starts with a **Home page**: the project's or area's name as a heading, its **Scope**, and its latest monthly and weekly goal ("October 2026: …", "Week 43: …"). It is written once, when the notebook is created; after that it is your page. The Home page always stays page 1: the pages of todos and meetings go after it.

A todo's or meeting's note that is the first one in the Default notebook creates the notebook in the same way, with the Home page first and the todo's or meeting's page after it. A note setup whose notebook has the same name and folder as the Default's puts its pages into the same file.

You can change the Home page's layout in Settings → Note setups → Default → **Home page**. Besides Title and static texts it offers **Scope** and **Latest goals**.

### The Notebook tab

A project's or area's page has a **Notebook** tab next to Threads and Loops (Projects on an area):

- the notebook's name with **Open** (the page you last looked at)
- a chip for every year that has a notebook, this year first; a missing current year shows as **+ 2027** and creates it. The chip you choose decides what Open and the contents show.
- **Contents**: the headings of the notebook in page order, "p.4  Kick-off with agency · 2.9." - tap one to open the notebook on that page
- without any notebook: what it will be, and **+ Create notebook**

### Contents (experimental)

The pages gtdpara made are listed by what they belong to: the Home page by the project's name, a todo's or meeting's page by the todo or meeting. Other headings show the typed text under them; a heading on handwriting shows as **Handwritten heading**. The list is read again when the notebook changed, for example after you wrote in it and came back.

Contents can be switched off in Settings → Advanced → **Notebook contents**. Then the tab shows the name, the years and Open.

### Engage: Go to the notebook

In [Engage](engage.md), when you work in another note of a project or area - a todo's own note, for example - one line **Go to Garden renovation 2026 ›** takes you to its home notebook and closes the panel. Inside the notebook itself the line isn't shown. Engage never creates a notebook.

### When you rename a project or area

gtdpara keeps the name of each project and area in its file (`name:` at the top). When you rename the folder elsewhere - in the file manager or on your computer - this year's notebook still has the old name. When you open the project's or area's page, the status line asks:

"Leadership is now People Leadership. Rename Leadership 2026.note to People Leadership 2026.note?" **Rename** · **Not now**

**Rename** renames this year's notebook and updates every link into it: the notes of todos and meetings, page links and marks. Notebooks of earlier years keep their names. **Not now** asks again the next time gtdpara starts. **Run Integrity Check** (Settings → Advanced) also lists such renamed folders.

## Closing out and archiving

For a project the button is **Close out…**: a short wizard that checks nothing is left open, moves results to the area or Resources, can create one PDF of all the project's notes, and then archives it. For an area, **Archive…** shows where its folder goes and moves it to the Archive after you confirm. See [Closing out a project](close-out.md).
