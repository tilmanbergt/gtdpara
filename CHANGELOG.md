# Changelog

All notable changes to gtdpara are listed here, newest first.
Versions follow [Semantic Versioning](https://semver.org/) (`0.MINOR.PATCH` until 1.0):
MINOR = new features or behavior changes, PATCH = bug fixes only.

Each release has up to six sections: **New**, **Changed**, **Fixed**, **Experimental**,
**Removed** and **Upgrade notes**. Upgrade notes appear whenever a release changes how settings
or your project/area files are stored.

## [Unreleased]

### New
- **Engage**: a second sidebar button, **Engage**, opens a small panel over the note you work in.
  It shows the todo you are working on - with its due date or Waiting For, **Done**, **Remove
  #next** or **Someday**, **Note ›** (or **+ Note**) and **File: name ›** - and the other next
  actions of its project, area, loop or thread. When no `#next` is left, it offers the plan to
  pick from, five at a time. **Undo** after every action; **Select next focus ›** moves on to
  another part of today's focus, only when you ask. On a todo's note, its page in a loop note or
  in a shared notebook, that todo is the one you are working on. See the help page "Engage".
- **Engage ›** at the top of a project's or area's page, a loop overview and a thread overview
  opens Engage for it.
- **After Done**: when you tick off the last `#next` of a project, area, loop or thread on Daily,
  the Current tab or an overview, the status line offers up to three todos of its plan to make
  the next one, or **Later**.

### Fixed
- **Related items on a note** listed every `#next` todo when the note's todo had `#next` (the
  same for `#now`, `#someday`, `#maybe` and Waiting For): only tags about what an item is about,
  like `#garden` or `#retro/alpha`, relate items now. A note that is still updated when it is
  opened shows the right list the next time you open it.

## [0.15.0] — 2026-10-16

### New
- **`{name}` and `{abbr}` in note names**: the name or abbreviation of the Project or Area the
  item belongs to, for notebooks and loop notes - `{abbr} {tag} {subtag} {year}` gives
  `LP sparring peter 2026`.

### Changed
- **Tag Rules are now Note setups** (Settings → **Note setups**): one setup per thing you keep
  notes about - your sparring sessions, a coaching client, a kind of workshop. A setup has its
  tags, a kind (**Thread** or **Loop**), where its notes go (**Own note per item** or **One
  notebook**, with a free **Folder** inside the Area or Project), **Prepare before** / **Review
  after**, and a **Meeting page** and **Todo page** (plus a **First page** for loops). Each page
  uses the **Default** layout or its own. See the help page "Note setups".
- **Shared means shared**: a setup with a notebook puts all its meetings *and* todos into that
  notebook.
- **The Default** is pinned at the top of the list: its pages, its tracking and, if you like, one
  notebook for every todo and meeting no setup covers.
- **Page layouts** have a page of their own: the page preview on the left, **Pieces**, **Add** and
  **Background** on the right - the preview stays visible while you add pieces or pick a
  background.
- **Tags** are picked from the tags you use (+ tag), types first; a tag belongs to one setup only,
  and saving a tag another setup has is refused with a message.
- **When several setups match** (a todo of a loop that also carries `#sparring/peter`), a meeting
  goes to the thread first and a todo to the loop first; the question before the note is created
  offers the other place as a second button (**In Sparring**). Your choice is kept, so it is
  asked once.
- The question before a note is created names the setup ("Sparring: new page in …").
- **One Files tab** on a Project or Area page: the left pane has three tabs - Threads, Loops (or
  Projects on an Area) and **Files**. Inside Files a second row picks the place: Project, Area
  and Resources. Linking, refiling and assigning an Area switch to the right place by themselves.
- **Pages in a notebook follow the timeline**: meetings by their date, todos by the day they were
  created - between the meetings around them instead of at the end. Pages you added after an
  item's page stay with that item; a loop's own page stays first.

- **Built for Supernote's plugin firmware** (A5 X / A6 X Chauvet 2.27.42, Manta / Nomad Chauvet
  3.30.45). Lasso recognition uses the page's real coordinates: handwriting is recognized
  anywhere on the page, also across its full width; the old position workaround is gone.
- **Mark for later is faster**, also as the first thing after the device or the plugin started:
  gtdpara reads the lasso first and starts nothing else until the mark is saved.

### Fixed
- Settings → About shows the version of the installed build (a beta of 0.15.0 showed 0.14.0).
- The first **Mark for later** after a start could lose the selection: no picture, no text, and
  the lasso stayed on the page.

### Removed
- Tag Rules for **Projects** and **Areas**: they never had an effect.
- The warning "gtdpara was updated, but the old version is still loaded" and its **Restart**
  button: the plugin firmware loads the new version cleanly.

### Upgrade notes
- **gtdpara 0.15.0 requires the plugin firmware**: A5 X / A6 X Chauvet 2.27.42 or later,
  Manta / Nomad Chauvet 3.30.45 or later. Update the Supernote first.
- Marks made with an older gtdpara and not processed yet are not recognized: their picture is
  shown, type the text from it.
- On the first start of 0.15.0 your Tag Rules become Note setups by themselves; a card above the
  list says what was merged and what changed for new notes (**OK** clears it). Rules that share a
  tag become one setup; their pieces, texts and backgrounds become the pages' own layouts, so
  notes look as before. Shared Default rules become the Default's notebook.
- **Every note you have stays where it is** and keeps opening; nothing is moved or renamed.
- In a setup with a notebook, todos (or meetings) that used to get a note of their own get pages
  in the notebook from now on.
- Your Tag Rules stay stored unchanged, so going back to 0.14 still works (changes made to Note
  setups don't reach 0.14). Profiles saved with 0.14 are converted when you switch to them.

## [0.14.0] — 2026-10-12

### New
- **Loops**: small projects inside an Area or Project, without a folder of their own - a workshop
  to prepare, a book to read, a trip, a purchase. A Tag Rule with the new context **Loop** makes
  its tag a kind of loop (`#workshop/<name>`); its pieces make the loop note's first page, and
  its **Loop note name** names the note, with the loop's main date in it. See the help page
  "Loops".
- **Starting a loop in Quick Add**: type only the loop's tag (`#workshop/teamoffsite`, a date
  for the main date if you like) and the button reads **+ Add loop**. Editing a todo down to a
  loop tag turns Save into **Make loop** (its due date, file and own note come along); taking
  `#someday`/`#maybe` off a bare loop tag, or filing one from the Inbox, starts the loop too.
- **Loops on the page**: an Area's Projects tab lists its loops under its Projects, a Project
  gets a **Loops** tab - each loop with its main date, next meeting and todo counts, loop tags in
  use without a loop yet under **New** (with **Track**), loop ideas and closed loops folded. The
  page's todos are grouped by loop, the loops first.
- **The loop overview**: tap a loop, or a loop tag in its Area or Project, to see its meetings and
  todos ahead and looking back, add to it in Quick Add, and edit it: **Edit** loads its tag, main
  date and file; renaming the loop or its note is asked in the status line first.
- **A file for a loop**: link a PDF, epub or any file to a loop with **+** and the clip on its row,
  or **Link file** in its overview - next to its note, which stays the place for your own notes.
- **The loop note**: one note per loop in its Area or Project folder, opened with 📓 on the loop
  row or **Note ›** in the overview; its first page comes from the Loop rule, and the loop's
  meetings and todos get their pages in it.
- **Closing loops**: **Close loop** (in the overview or the Weekly Review) asks Done or Dropped,
  and only while nothing of the loop is open - otherwise the status line says what is and offers
  **Show**. **Reopen** makes a closed loop active again.
- **Weekly Review: Open loops**: a new step after "Stalled projects" lists the loops per area and
  project and counts the ones without a next action or past their main date.
- Prep/review tracking of a meeting now applies when any matching meeting rule asks for it, not
  only the first.
- `{day}` for shared and loop note names. Without a date, date placeholders are left out with
  the `-`, `.` or `_` between them.

### Fixed
- Settings → Tag Rules: with more rules than fit on the screen, the last ones were hidden below
  it without a page arrow. Each rule now takes one fixed row (long names and tag lists are cut),
  and the list pages.

### Upgrade notes
- Area and Project files can get a `## Loops` section. Older versions keep it untouched.

## [0.13.0] — 2026-10-10

### New
- **Projects tab** on an area page, after Threads: the area's projects at a glance - active
  ones, then the ones on hold folded - each with its latest and next meeting, open todos, how
  many are `#next` (or `no next action`) and the oldest Waiting For. Tap one to open it.
- **Headings in notes.** A **Heading** switch on every text piece of a todo or meeting Tag Rule
  writes that piece as a Supernote heading, so it shows in the note's table of contents - on
  notes of their own and on every page of a shared note. Existing rules don't change until you
  switch it on.
- **Date & title** piece for meeting rules: `30.9.2026 · Retro demand retro/demand`, a heading
  from the start. New meeting rules start with Date & title, Time and Linked file; new todo
  rules with Title (as a heading) and Linked file.
- **Heading style** in Settings → Tag Rules: Black, Light grey, Dark grey (default) or Shadow.
- **Date keywords**: notes and pages of meetings get the meeting's date as a keyword
  (`2026-10-04`), todos their creation date. When a meeting moves, its keyword follows the next
  time you open the note.
- Pages in **shared notes** now also get the item's tags as keywords, like notes of their own.

### Changed
- An area page's Files tabs are now **Threads | Projects | Area Files | Resources**. The
  **Project Files** tab of an area is gone; its projects' folders show in the Projects tab while
  you link a file, and Browse while you refile.
- On a project page, tapping **Area: name** opens the area. To move the project to another
  area, tap **✕** and then **Assign to Area…** again.
- **Threads tab**: tapping a counterpart's name opens its overview. The new **Filter** pill on
  its row shows only its todos and meetings on the right (**Filter ✕** shows everything again).
  The **›** button is gone.
- The **Title** piece of a note writes tags as words without `#` (`Retro demand retro/demand`);
  gtdpara's own tags such as `#next` or `#wf/anna` are left out. Todo notes used to leave out
  every tag.

### Fixed
- Tapping a thread tag such as `#retro/alpha` in a meeting on a project or area page often
  seemed to do nothing. The screen is now redrawn when the overview opens.

## [0.12.0] — 2026-10-08

### New
- **Tending threads.** The people, teams and series behind nested tags such as `#retro/alpha`
  (counterparts) are now tended per area (with its projects) or per project without an area. A
  counterpart you use for the first time is **new**: you decide **Tend** or **Not**, nothing is
  decided for you. Counterparts used only with `#wf/name` or `#owe/name` are marked `w/f only`,
  `owe only` or `w/f · owe only`. The Inbox has none.
- **Threads tab** on the Current page, the first of the Files tabs and open when you open a
  project or area: new, active and inactive counterparts with their latest and next meeting and
  what you owe or wait for. Tap a counterpart to show only its todos and meetings (a todo agreed
  with one person but tagged for another shows under both); **▸** shows its threads with
  **+ next**; **›** opens its overview. Linking a file, refiling or assigning an area switches
  to the files and back to Threads when you are done.
- **Set inactive** first goes through the counterpart's open todos under I owe, Waiting for and
  Relevant: Done, Cancel or Keep each one. Inactive counterparts leave the Review and the tag
  suggestions in Quick Add; their overview keeps working. One that gets a new meeting comes back
  as `back in use`.
- **Review step "Tending threads"**, after "Meetings to close out": per area and project its
  counterparts, the new ones on top; on the right Quick Add with **+ Next retro**, Tend / Not or
  **Open overview ›** and **Set inactive**, and a short summary. The overview opens over the
  Review and **‹ Review** returns to the step.
- **Since last time**, a new piece for meeting Tag Rules: on the meeting's note, what was agreed
  in the thread's previous meeting, what you owe, wait for and should raise, and what got done
  since - each todo once, at most 6 lines per block.

### Changed
- The Current page's Files pane has no **Browse** tab any more. While you refile or assign an
  area, the **Project Files** tab shows Browse; while you link a file, **Other Projects/Areas ›**
  at the top of Project Files opens it. Open other projects and areas from the Projects and
  Areas tabs.
- The Review tab shows its ● mark until you have marked the new step **Reviewed** once.

### Upgrade notes
- `## Threads` is a new section in `area.txt`, and in `project.txt` of a project without an area,
  written the first time you tap Tend, Not or Set inactive: one line per counterpart,
  `- mieke: active`. Older versions keep the section as it is and ignore it. Nothing else in
  your files changes.

## [0.11.0] — 2026-10-08

### New
- **Threads.** Tap a nested tag such as `#retro/alpha` in any todo or meeting, or a `#w/f Name`
  label, to open its overview over the screen: next meetings, what you owe (agreed in its
  meetings), what you are waiting for, what is relevant (tagged with it), and every past meeting
  with what was agreed in it and how much of it is done. A "Since" row lists what you ticked
  since the latest meeting.
  A switch shows the whole counterpart (`All alpha`) instead of one thread; a `#w/f Name` label
  or an `#owe/name` tag opens the whole counterpart right away. The overview covers
  the project or area you tapped in, together with its area and that area's projects. **‹** with
  the tab's name, or any tab, closes it; the screen behind stays as it was.
- **+ Next retro** in the overview copies the thread's latest meeting to the next date, keeping
  the time between the last two meetings.
- Todos agreed in a meeting record it at the end of the line (`[meeting:: 2026-09-30 Retro
  alpha retro/alpha]`); no tag is added, so a todo agreed with one person can be tagged for
  another: from the overview's Quick Add, from the Review step **Meetings to close out**, and
  from a lasso capture or mark on a meeting's note page. A grey line in Quick Add
  (`↳ from Retro alpha · Wed 30.9.`) shows this before you save; ✕ drops it for that todo.
- `#owe/name` marks a promise made outside a meeting; it shows under **I owe** in that
  person's thread overview and combines with `#next`, `#someday` or a due date. `OWE` can't be
  an abbreviation.
- Tag Rules: the shared file name can contain `{tag}`, the rule tag the item matched, so one
  rule on `sparring` and `retro` names its files `sparring max 2026` and `retro alpha 2026`.
- New help pages **Threads** and **Using gtdpara with Obsidian**.

### Changed
- On Daily, a nested tag opens its thread overview instead of filtering the list; plain tags
  still filter.
- Tags in todo and meeting rows show as you typed them (upper and lower case kept); they were
  shown in lowercase where they could be tapped.

### Upgrade notes
- New todos agreed in a meeting end in a `[meeting:: …]` field, before `[created:: …]`. 0.10.0
  already reads and keeps this field, so going back loses nothing. Nothing in your files is
  converted.

## [0.10.0] — 2026-10-08

### Changed
- Todo lines use a plain syntax that Obsidian's Tasks and Dataview plugins understand: you type
  tags, gtdpara writes fields at the end of the line. A due date is written as
  `[due:: 2026-10-15]` instead of `#due:2026-10-15`.
- Waiting For is written as `#wf/lena`, or `#wf` without a name, instead of
  `#waiting-for:lena`. The label stays `#w/f Lena`. `WF` can't be used as an abbreviation.
- New todos record the day they were added (`[created:: …]`); checking a todo done records the
  day (`[completion:: …]`), unchecking removes it. Editing a todo keeps both dates.
- Fields you add yourself at the end of a todo line (for example `[priority:: high]`) are kept.
- The demo space uses the new syntax.

### Upgrade notes
- Your files stay `project.txt`, `area.txt` and `Inbox.txt`, and nothing is converted on its own.
  Older lines with `#due:…` or `#waiting-for:…` keep working as before; a line is rewritten in the
  new syntax only when gtdpara saves it after you edit that todo.
- Only new todos get a created date, and only todos checked from now on get a done date; gtdpara
  never makes up dates for existing todos.
- To see the fields in Obsidian's Tasks plugin, set its **Task Format** to **Dataview**. Edits
  made in Obsidian reach the Supernote only through the Supernote Cloud Sync plugin's Paired
  folder; see **Your files and folders** in the help.

## [0.9.0] — 2026-10-07

### Changed
- Review's Focus reset step shows a Week | Month switch with the same focus panel as the Week and Month tabs, instead of its own list.
- One date format everywhere: day and month without leading zeros (`6.10.`, `6.10.2027` for another
  year) and 24-hour times without a leading zero (`9:05`). Day headings read `Tue 6.10.`. This also
  applies to the date and time pieces written into new meeting notes; files keep `2026-10-06`.

### Removed
- The one-time move of the Inbox out of `Note` (from 0.1.0 to the Inbox folder under Areas).

### Fixed
- Integrity Check now also checks archived projects and areas in the Archive's year folders
  (where close-out puts them), including a close-out that was interrupted after the folder move.

### Upgrade notes
- **Upgrading straight from 0.1.0 is no longer supported.** Install any version from 0.2 to 0.8
  first (it moves the Inbox), or move `Inbox.txt` and its `Todos` and `Meetings` folders from
  `Note` into `Note/2 Areas/0 Inbox` yourself. **Run Integrity Check** points out anything left.
- Tag Rules are stored under a new name in the settings. This happens automatically on the first
  start; profile files saved by earlier versions still load.

## [0.8.0] — 2026-10-06

### New
- **Mark for later**: a second lasso button saves a selection in one tap, without opening gtdpara, and
  puts a small bookmark icon into the note. Process the marks later: a card **n marks to process** on
  the Inbox and Current tabs and in the Review's Inbox to zero opens them, with the picture of each
  mark and its recognized text. A saved mark's bookmark becomes a check mark. See the new help page
  *Lasso: capture and mark for later*.
- **Several todos from one lasso**: a list with boxes, dashes, dots or numbers becomes one todo per
  line, each row editable and removable; **✂ Split at cursor** splits by hand.
- Lasso capture uses the Quick Add chips (flow, tags, due date) and **File to** chips for the
  destination, with **Save & next**, **Save & view** and **Save & close**.
- The close-out checklist warns about open marks; archiving moves them to the Inbox.
- Integrity check: lasso marks whose note is gone.

### Changed
- A capture's **Link to this page** now becomes the item's linked file (the clip) and opens the note
  at that page; before, it was set as the item's own note.
- Lasso capture opens faster: recognition starts right away while the screen loads.

### Fixed
- The second lasso capture on a page often recognized nothing: handwriting low on the page was
  outside the area the recognizer looked at.

### Upgrade notes
- Project, area and Inbox files can get a new `## Marks` section with one line per open mark. Older
  versions keep it untouched.
- A linked file can end in `#page=3` (a link to a page from a lasso capture). Older versions can't
  open such a link; going back to an older version, remove the `#page=…` part by hand.

## [0.7.0] — 2026-10-05

### Changed
- **Waiting for todos show on Daily**, from every project, area and the Inbox, last in their group -
  until their date, if they have one: then they stay off Daily until that day.
- **Todos show text labels instead of small icons**: `#next`, `#now`, `#w/f Lena`, `#due 5.10.` (with
  `!` when overdue), always visible, no tapping to read them. Double-tap `#next` to mark a todo `#now`.
  A long title is shortened with … so the labels always fit.
- The **Projects** and **Areas** tabs show each abbreviation after the name, and their rows are a bit
  taller, so taps land on the right one.

### Fixed
- The **waiting for name** in a todo row could be cut off or drawn under the next row.

## [0.6.0] — 2026-10-04

### New
- The **Integrity Check** finds notes with old file names that break links in Obsidian (`#`, `[`, `]`,
  `^`) and offers **Fix file names**: one confirmation renames them all and updates their links.

### Changed
- **Opening gtdpara only reads the files that changed** since it last read them, for example in
  Obsidian or on your computer - faster, and screens no longer redraw when nothing changed.
  **Reload all files** still reads everything.
- The **Integrity Check** also reports a project close-out that was interrupted before the project was
  archived.

### Fixed
- **Moving a todo or meeting to another project, area or the Inbox moves its note with it** (after
  asking) - Refile, a project tag in Quick Add, Inbox filing and the close-out checklist. Before, the
  link pointed into the new folder where the note wasn't. A page in a shared note stays where it is
  and the item keeps its link to that page.
- **Reload all files** no longer throws away changes in Settings you haven't saved yet.

## [0.5.0] — 2026-10-03

### New
- A todo's or meeting's **own note gets its tags as keywords**, like a note from Quick Add, so the
  Supernote's keyword search finds it.

### Changed
- **🔄 has moved to Settings → Advanced → Reload all files.** It reads all projects, areas and the Inbox
  again, for every tab at once, instead of only the tab you are on.
- File names gtdpara creates no longer contain `#`, `[`, `]` or `^` (also for notes and attachments from
  Gmail), so links to them work in Obsidian. Existing files keep their names.
- A new project or area name can't contain `#`, `[`, `]`, `^` or the characters file names can't hold;
  the message names the character.

### Fixed
- Meeting lists with dates no longer cut the time short on days 10 to 31.
- The Review's **Week ahead** count matches the week the step shows, including multi-day meetings
  that started earlier and meetings in the Inbox.

### Upgrade notes
- A Tag Rule whose **Shared file name** contains `[`, `]` or `^` now makes a file name without them, so new
  pages go into a new file. Pages already in the old file stay there. Rename the old file or the rule's
  file name if you want them together.

## [0.4.0] — 2026-10-02

### New
- **Nested tags** like `#coaching/sabina`. A Tag Rule on `coaching` also applies to every
  `#coaching/...` tag.
- **Shared files split by tag and date.** The Tag Rule's "Shared file name" understands
  `{subtag}`, `{year}`, `{quarter}` and `{month}` - for example `Coaching {subtag} {year}` collects
  each client's sessions in their own file per year. Tap a placeholder to insert it.

### Changed
- **The note icon asks before creating a note.** The status line says which file or page will be
  created (and by which Tag Rule), so a misspelt tag can be fixed first. It also asks before
  recreating a deleted note or page, and before linking to a page that already exists.
- Once a page in a shared file exists, it stays in that file, even if the rule's file name is
  changed later.
- A deleted own note can be created again from the note icon, instead of showing an error.
- Removing a tag chip in Quick Add no longer cuts that tag out of a longer tag (`#team` out of
  `#team-jf`).

### Upgrade notes
- Text like `#foo/bar` used to carry the tag `foo` followed by plain text `/bar`; it now carries the
  nested tag `foo/bar`. Tag Rules on `foo` still apply. A Daily filter on `#foo` no longer shows
  these items - tap `#foo/bar` instead.

## [0.3.0] — 2026-10-01

### Changed
- **gtdpara now tells you about every change to your files.** Moves, overwrites and deletes are
  shown before they happen and confirmed afterwards. Archiving an area from the Weekly Review now
  asks first, like it does on the area's Current tab.
- **Deleting only after you confirm it.** When an area is archived into an Archive folder that
  already exists, the confirmation names the area's then-empty folder; it is deleted only if you
  also allow it in the Supernote's permission prompt. Otherwise it stays, and gtdpara says so.
- **Create again** in the close-out's PDF step asks before replacing the existing PDF.
- Temporary files of a close-out PDF are kept in gtdpara's private folder instead of a hidden
  folder in `Note`.
- Diagnostic notes about Supernote calls are no longer written as separate files to
  `EXPORT/gtdpara/debug`; they go into the log, which is written to a file only while
  **Debug logging** is on.
- Clearer permission prompts for Google Calendar and Gmail.

### Fixed
- A note created with Quick Add (and any file gtdpara creates or moves) now appears in the Files
  pane right away, without navigating away and back.
- A missing file-read permission now shows the Supernote's permission prompt when folders are
  first listed, instead of an unclear error.

### Upgrade notes
- gtdpara now declares the **Delete files** permission. It is only requested after you confirmed a
  delete; see Help → Troubleshooting → Permission prompts.
- Many small files named like `abc123-001-openPath-OK.txt` in `EXPORT/gtdpara/debug` come from
  earlier versions and can be deleted. So can a hidden `.gtdpara_tmp` folder in `Note`, if an
  earlier PDF export was interrupted.

## [0.2.0] — 2026-10-01

### Changed
- **The Inbox now has its own folder inside Areas** (`2 Areas/0 Inbox`), so your `Note` folder
  only holds the PARA folders. Everything about the Inbox works as before; it is not shown as an
  area. The folder name can be changed in **Settings → Folders** (renaming it there moves the
  folder).
- The Integrity Check also reports Inbox files left in `Note` by an unfinished move.

### Upgrade notes
- On the first start, gtdpara moves `Note/Inbox.txt` and the `Todos` and `Meetings` folders next to
  it into `Note/2 Areas/0 Inbox` once, and shows a short message. Links to notes in those folders
  are updated in the Inbox and in all active projects and areas (not in archived ones).
- If an area named `0 Inbox` already exists, or a file would be overwritten, nothing is moved and
  the Inbox keeps working from `Note`. Choose another Inbox folder name in Settings → Folders; the
  move is tried again.
- New setting **Inbox folder** (default `0 Inbox`); it switches with the profile.

## [0.1.0] — 2026-09-30

First public release.

### New
- **PARA folders as the source of truth.** Projects, Areas, Resources and Archive are plain
  folders in your Supernote `Note` directory. Each Project/Area keeps its todos and meetings in a
  human-readable plain-text file (`project.txt` / `area.txt`) you can open in any text editor.
- **Daily** view: today's and tomorrow's meetings, due/overdue and `#next` todos from your
  focused Projects/Areas, grouped by Project/Area; context-tag filter.
- **Focus mode** (`#now`): mark the few todos you are on the hook for right now and work only
  on those, with nothing else on screen.
- **Week** and **Month** tabs: meeting grid per day, weekly/monthly focus and goals, monthly
  meeting highlights.
- **Quick Add** everywhere: todos, meetings (with time and length) and standalone
  notes; tags, due dates, refile to another Project/Area, quick-file via Project/Area
  abbreviations (e.g. `#AT`).
- **Projects & Areas**: create, status (Active / On Hold, and Done for projects), archive, scope
  description, short abbreviation, optional Area assignment for Projects, linked files.
- **Project close-out**: a short wizard before archiving a project - checklist, where results go,
  an optional PDF of all its notes with a table of contents; "Quick archive" skips the PDF.
- **Inbox** and **lasso capture**: turn handwriting into a todo or meeting and file it.
- **Tags**: `#next`, waiting-for, someday/maybe, due dates, free context tags (people, topics).
- **Weekly Review** hub: Inbox to zero, stalled/neglected/on-hold projects, week ahead,
  meetings to close out, unfocused next actions; each step with its own count and last-reviewed date.
- **Note templates ("Tag Rules")**: new linked notes get a background and pre-filled content
  (title, date, related todos, static texts, linked file) based on context and tags.
- **Meeting prep/review tracking**: optional "prepare before" / "review after" marks per meeting.
- **Integrity check**: finds broken links, duplicate headings and similar file problems.
- **Settings → About**: version and build, device, and "What's new" (these release notes).
  After an update, a short notice points to it once.
- **Reporting problems**: "Debug logging" writes the plugin's log to a file, and "Export debug
  bundle" saves one text file (version, device, settings summary without names, recent log) to
  `EXPORT/gtdpara/debug` for attaching to a GitHub issue. Passwords, calendar links and
  e-mail addresses are removed from it.
- **Settings → Advanced**: Experimental switches plus the tools (Integrity Check, performance
  tracing, keep tabs in memory).
- **Profiles**: switch between complete configurations (folders, Tag Rules, review state,
  integrations), stored as files in `EXPORT/gtdpara/profiles` that you can copy and share.
  A marker in the tab bar shows when a profile other than Production is active.
- **Demo space**: one tap creates a small fictional setup in `Note/gtdpara-demo` with its own
  profile - for trying gtdpara out, testing, or reproducing a problem without your real data.
- **Help**: tap **?** in the tab bar for the user guide, starting at the page for the current
  tab; the screen behind stays as it was. The same pages are in `docs/user/` on GitHub.

### Experimental
Switch on in Settings → Advanced. They depend on outside services and may be slow or break:
- **Google Calendar**: shows your calendar via its private ICS link in Daily, Week, Month, Inbox,
  a project's or area's Current tab and the Review; copy events into meetings.
- **Gmail**: a Gmail inbox step in the Weekly Review (IMAP with an app password): create todos
  from emails, archive, save email text as a note.
