# Note setups

A **Note setup** is one thing you keep notes about - your sparring sessions, a coaching client, workshops. It says which tags it covers, where the notes of those todos and meetings go, which meetings you prepare and review, and how each page looks.

You find them in **Settings → Note setups**.

## What a setup is

- **Tags**: one or more, for example `sparring` and `retro`. A setup covers an item that has one of them, or a tag nested under one: a setup on `coaching` also covers `#coaching/sabina`. A tag belongs to one setup only.
- **Kind**:
  - **Thread**: something you tend with someone. The part after the `/` is the other side: `#sparring/peter` is your sparring thread with Peter. Threads show in the Threads tab, the thread overview and "Tending threads" in the Weekly Review. See [Threads](threads.md).
  - **Loop**: a small project of its own. `#workshop/teamoffsite` is one loop of the kind `workshop`. See [Loops](loops.md).
- **Notes** (where the notes go):
  - **Own note per item**: every todo or meeting gets its own note in the project's `Todos` or `Meetings` folder.
  - **One notebook**: every meeting and todo of the setup gets a page in one note, in date order (see below).
  - A Loop setup always has its **loop note**: one note per loop in the loop's Area or Project folder.
- **Tracking**: **Prepare before** and **Review after** for the setup's meetings, see [Meetings](meetings.md).
- **Pages**: a **Meeting page**, a **Todo page** and a **Reflection page** (the page you write your reflection on after a meeting, see [Meetings](meetings.md)), and for a Loop setup a **First page** (the loop's own page at the start of its loop note).

Items no setup covers use the **Default**, pinned at the top of the list: its pages, its tracking and where its notes go. Inbox items always get a note of their own.

## The list

- **+ New note setup** starts a new one; tap a setup to edit it.
- Each row shows the name, Thread or Loop, the tags, where the notes go and what is tracked. A switched-off setup shows "(off)".
- **Delete** removes a setup at once. Notes that already exist stay where they are; their pages are filled from whatever covers the item from then on - another setup, or the Default.

## Editing a setup

At the top of the setup's page: **Save** and **Cancel**.

- **Name**: shown in the list and in the question before a note is created. Left empty, the setup is named after its tags.
- **Tags**: **+ tag** shows the tags you use, the first part of nested tags first (`sparring` of `#sparring/peter`). Tap one to add it, tap again to take it out. Tags of another setup are not shown. To add a tag you don't use yet, type it in **New tag** and tap **Add**. A loop kind is one word, like `workshop`.
- **Kind**: **Thread** or **Loop**.
- **Notes** (Thread setups): **Own note per item** or **One notebook**.
  - **Notebook name**: the note's file name. Tap a placeholder under the field to insert it where the cursor is (see below). The lines under it show what the name gives for each of the setup's tags.
  - **Folder**: empty means the Area or Project folder itself; otherwise a folder inside it, like `Meetings` or `Sparring`. It is created when the first note needs it. At most three levels and 60 characters; a folder name can't start with a dot.
- **Loop note name** (Loop setups): the loop note's file name, with the same placeholders.
- **Tracking**: **Prepare before**, **Review after**.
- **Enabled**: a switched-off setup covers nothing; its tags stay taken.

Saving is refused, with a message at the top, when a tag is already in another setup ("#retro is already in Sparring.") or the folder can't be used.

## Pages: Default layout or own layout

Under **Pages** every page has a row with a small picture of its pieces:

- **Default layout**: the page looks like the Default's page of that kind, and follows it when you change the Default. **Customize ›** gives the page its own layout, starting as a copy of the Default's page.
- **Own layout**: **Edit ›** changes it; **Use default** asks first, then removes the own layout.

Most setups keep the Default layout and never need this.

## The page layout

Left, the page as it will look, with its background; tap a piece to select it. Right, three panels:

- **Pieces**: the pieces on the page (**✕** removes one). For the selected piece, the arrows move it (step 5 or 25), and you change its font size and maximum width. **Heading** writes the piece as a Supernote heading too, so it shows in the note's table of contents - on a note of its own and on each page of a notebook. Date & title has it on from the start, and so has the Title of a Todo page; Linked file can't be a heading. In the picture a heading has a grey backing.
- **Add**: tap a piece to put it on the page (✓); tap it again to take it off. Each piece is on a page once.
  - **Title** of the item; tags are written as words without `#` (`Retro demand retro/demand`), the tags Kept GTD uses itself (`#next`, `#wf/anna` …) are left out
  - **Date & title** (Meeting, First and Reflection page): the date with the year and the title, `30.9.2026 · Retro demand retro/demand`; for a loop its main date and name
  - **Date** and **Time** (Meeting and Reflection page)
  - **Related items**: open todos and meetings that share a tag with the item - a tag about what it is about, like `#garden` or `#retro/alpha`; `#next`, `#now`, `#someday`, `#maybe` and Waiting For don't count
  - **Linked file**: a link to the file linked to the item
  - **Since last time** (Meeting page), see below
  - your own **texts**: **+ New text** writes one, for example "Agenda" or "Decisions"; **Edit** changes it. Deleting a text that is on the page asks first.
- **Background**: your templates from the MyStyle folder; the picture shows the choice at once.

**Done** goes back to the setup's page; **Save** there stores everything. A new Meeting page starts with Date & title, Time and Linked file; a Todo page with Title and Linked file; a First page with Date & title and Linked file; a Reflection page with Date & title only - add your guiding questions as your own texts, for example "What did I notice?" or "What do I try next time?".

## The Default

Tap **Default** at the top of the list. It has **Notes** (own note per item, or one notebook for everything no setup covers), **Tracking** and its pages, each with **Edit ›**. Its pages are the Default layout of every setup that uses it, Loop setups' First pages included. Its **Reflection page** starts with Date & title as a heading; the guiding questions are yours to add.

A new install starts with **One notebook** named `{name} {year}` in each project's or area's own folder: every note of a project or area goes into one file per year. This notebook is each project's and area's home notebook ([Projects and Areas](projects-and-areas.md)); the Default then also has a **Home page**, the first page of every new home notebook (Title, Scope and Latest goals). A setup whose notebook has the same name and folder shares this file.

## Heading style

At the top of **Settings → Note setups**, **Heading style** sets how Kept's headings look in all notes: **Black**, **Light grey**, **Dark grey** (the default) or **Shadow**. It applies to headings written from then on; existing headings keep their style until their page is written again.

Like the other pieces, headings are written when the note is created and again when you open the note from Kept, until the meeting is over or the todo is done. A heading you make yourself on your own handwriting or text stays; one you put on a piece Kept wrote is replaced with that piece.

## Since last time

**Since last time** is a piece for the Meeting page you add yourself. It looks at the meeting's first thread tag (such as `#retro/alpha`, see [Threads](threads.md)) and the previous meeting of that thread, and prints:

- **Agreed last time**: the todos agreed in the previous meeting, open ones first, then the done ones (✓)
- **I owe**, **Waiting for**, **Relevant**: the other open todos of the thread, as in its overview (Someday and Maybe left out)
- **Done since then**: todos of the thread ticked since the day of the previous meeting

Each todo appears once; a todo agreed last time stays under Agreed last time, Someday and Maybe included. A block shows at most 6 lines, then `… +2 more`; empty blocks are left out. Without a previous meeting the piece writes nothing.

## Placeholders in a note name

- `{tag}`: the setup's tag the item matched - `retro` for `#retro/alpha` when the setup has the tags `sparring` and `retro` (always lowercase); for a loop its kind
- `{subtag}`: the part after the `/` - `sabina` for `#coaching/sabina`; for a loop its name (always lowercase)
- `{name}`: the name of the Project or Area the item belongs to - `Leadership Program`
- `{abbr}`: that Project's or Area's abbreviation - `LP`; its name when it has none
- `{year}`: `2026`, `{quarter}`: `Q4`, `{month}`: `10`, `{day}`: `07`

A meeting uses its own date, a todo the day its note is created, a loop its main date. Without a date, the date placeholders are left out together with the `-`, `.` or `_` between them: `{year}-{month} {tag}` becomes just the tag.

Example: a setup "Coaching" on `coaching`, notebook name `Coaching {subtag} {year}`. A meeting tagged `#coaching/sabina` goes into `Coaching sabina 2026`, one tagged `#coaching/tom` into `Coaching tom 2026`, and one tagged just `#coaching` into `Coaching 2026`. With `{tag}`, one setup on `sparring` and `retro` with the name `{tag} {subtag} {year}` puts `#sparring/max` into `sparring max 2026` and `#retro/alpha` into `retro alpha 2026`. With `{abbr} {tag} {subtag} {year}`, a meeting `#sparring/peter` in the Project "Leadership Program" (abbreviation `LP`) goes into `LP sparring peter 2026`.

If you rename a Project or Area or change its abbreviation, new pages go into a note with the new name; pages that already exist stay where they are and their links keep working - the same as a new year with `{year}`.

## When several setups match

An item can carry the tags of more than one setup, for example a todo `#workshop/offsite #sparring/peter`.

- A **meeting** goes to a **Thread** setup first, a **todo** to a **Loop** setup first (if the loop is active in that Area or Project; otherwise the todo gets a note of its own). Among setups of the same kind, the list order decides.
- When they lead to different notes, the question before the note is created offers the next one as a second button, for example **In Sparring** (or **Own note**). Tap the message to see every place.
- Your choice is kept with the item, so it is asked once. The note's pages are filled from the layout of the setup you picked.

## Before a note is created

The first tap on a todo's or meeting's note icon doesn't create the note right away. The status line at the top first says what will happen, for example "Coaching: new file Meetings/Coaching sabina 2026.note" or "Sparring: new page in …". Tap the button to go ahead, or ✕ to cancel - for example to fix a misspelt tag first. Tap the message to see the full location.

The status line also asks first when:

- a page with the same title already exists in the notebook ("… already exists - link it?")
- the item's page or note file was deleted ("… not found (deleted?) - create it again?"). The old content does not come back; if you deleted it by mistake, restore the file first and tap ✕.

Once a note exists, the note icon opens it directly. A page stays where it was created: changing the tag, the date, the setup's notebook or deleting the setup later does not move it.

## Order of pages in a notebook

A notebook - and a loop note - reads like a timeline. A new page goes where it belongs in time: a meeting by its date, a todo by the day it was created. A todo you create between two meetings lands between them; items of the same day keep the order you created them in. Pages you add yourself after an item's page stay with that item: a new page goes after them, never in between. In a loop note the loop's own page stays first, in a home notebook its Home page. Pages are placed once, when they are created, and never moved later - a meeting whose date changes stays where it is.

## Finding notes again

- A note of its own is named after its item, for example `2026-10-04 - Site visit with Marco marco`, so the Supernote's file search finds it. File names leave out `#` and the other characters listed in [Your files and folders](files-and-folders.md).
- A page in a notebook gets a **keyword**: the meeting's date and title, or the todo's text, including its tags - for example `2026-10-04 Site visit with Marco #marco`. The Supernote's keyword search then finds every page about Marco. A keyword can have at most 43 characters, so a longer title is shortened for the keyword: its tags are left out (they are keywords of their own), and if it is still too long, it is cut with "…". The page is found the same way every time.
- A note of its own, and a page in a notebook, also gets the item's tags as **keywords** (without `#next`, `#wf` and the other tags Kept uses itself), for example `marco`. A note from the **Note** tab in Quick Add gets the tags of its title as keywords the same way.
- Notes and pages of meetings and todos also get a **date keyword**: the meeting's date, or the day the todo was created (if it has a `created` date), for example `2026-10-04`. The keyword search matches part of a keyword, so searching `2026-10` finds everything from October 2026.
- These keywords are kept up to date whenever you open the note from Kept, while it is still refreshed. A keyword that is only a date on such a page belongs to Kept and is replaced; tag keywords are only ever added, never removed, so keywords you add yourself stay.
- With headings switched on, the note's **table of contents** lists every meeting of a notebook by date and title.

## Coming from Tag Rules

Up to 0.14, Tag Rules did this job, one rule per kind of item. On the first start of 0.15 they become Note setups by themselves:

- Rules that share a tag become one setup; a meeting rule and a todo rule on `#sparring` are one Sparring setup with a Meeting page and a Todo page.
- A rule's pieces, texts and background become its page's own layout, so pages look as before. The Default rules become the Default's pages.
- **Every note you have stays where it is** and keeps opening as before.
- One thing changes on purpose: in a setup with a notebook, all its meetings **and** todos get pages in that notebook from now on, also those that used to get a note of their own.
- Project and Area rules are gone - they never had an effect.
- A card above the list says what was merged and what changed for new notes; **OK** clears it. Your Tag Rules stay stored unchanged, so going back to 0.14 still works.
