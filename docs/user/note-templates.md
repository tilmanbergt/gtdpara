# Note templates (Tag Rules)

When gtdpara creates a note for a todo, a meeting, a project or an area, a **Tag Rule** decides how it looks: which background it uses and what is written onto the first page.

You find the rules in **Settings → Tag Rules**.

## How a rule is chosen

- Every rule belongs to one context: **Project**, **Area**, **Todo** or **Meeting**.
- A rule has one or more tags. It applies when the item has any of them, or a tag nested under one of them: a rule on `coaching` also applies to `#coaching/sabina`.
- Rules are checked from top to bottom; the first match wins.
- One rule per context can be the **Default**: it applies when no tagged rule matches.
- Without any matching rule the note starts blank.

## Editing a rule

Tap a rule to edit it, or **+ New tag rule** to create one.

- **Name**, **Context**, **Tags** (separated by spaces), **Default**, **Enabled**
- **Background**: tap **Change…** and pick one of your templates from the MyStyle folder
- **Pieces**: what is written onto the page. Tap **Add piece** and choose:
  - **Title** of the item; tags are written as words without `#` (`Retro demand retro/demand`), the tags gtdpara uses itself (`#next`, `#wf/anna` …) are left out
  - **Date & title** (meetings): the date with the year and the title, `30.9.2026 · Retro demand retro/demand`
  - **Date** and **Time** (meetings)
  - **Related items**: open todos and meetings that share a tag with the item
  - **Linked file**: a link to the file linked to the item
  - **Since last time** (meetings): what happened in the meeting's thread since its previous meeting, see below
  - a **static text** you write once for this rule (**+ New text**) and place on the page, for example "Agenda" or "Decisions"
- A new meeting rule starts with **Date & title**, **Time** and **Linked file**; a new todo rule with **Title** and **Linked file**.
- The preview shows where each piece sits. Select a piece and move it with the arrows; change its font size and maximum width.
- **Heading** (todo and meeting rules): below the arrows, for the selected piece. A piece with Heading on is also written as a Supernote **heading**, so it shows in the note's table of contents - on a note of its own and on each page of a shared note. Date & title has it on from the start, and so has the Title of a new todo rule; for every other piece it is off until you switch it on. Linked file can't be a heading. In the preview a heading piece has a grey backing.

**Create** or **Save** stores the rule; it is used for notes created from then on.

## Heading style

At the top of **Settings → Tag Rules**, **Heading style** sets how gtdpara's headings look in all notes: **Black**, **Light grey**, **Dark grey** (the default) or **Shadow**. It applies to headings written from then on; existing headings keep their style until their page is written again.

Like the other pieces, headings are written when the note is created and again when you open the note from gtdpara, until the meeting is over or the todo is done. Rules you had before don't write headings until you switch Heading on for a piece; a note that is still refreshed then gets its heading the next time you open it. A heading you make yourself on your own handwriting or text stays; one you put on a piece gtdpara wrote is replaced with that piece.

## Meetings only

- **Prepare before** and **Review after** switch on the preparation and review marks for matching meetings, see [Meetings](meetings.md).
- **Since last time** is a piece you add yourself; new rules don't have it. It looks at the meeting's first thread tag (such as `#retro/alpha`, see [Threads](threads.md)) and the previous meeting of that thread, and prints:
  - **Agreed last time**: the todos agreed in the previous meeting, open ones first, then the done ones (✓)
  - **I owe**, **Waiting for**, **Relevant**: the other open todos of the thread, as in its overview
  - **Done since then**: todos of the thread ticked since the day of the previous meeting
- Each todo appears once; a todo agreed last time stays under Agreed last time. A block shows at most 6 lines, then `… +2 more`; empty blocks are left out. Without a previous meeting the piece writes nothing. Like every piece it is written when the note is created and again when you open the note, until the meeting is over.

## Finding notes again

- A note of its own is named after its item, for example `2026-10-04 - Site visit with Marco marco`, so the Supernote's file search finds it. File names leave out `#` and the other characters listed in [Your files and folders](files-and-folders.md).
- A page in a shared note gets a **keyword**: the meeting's date and title, or the todo's text, including its tags - for example `2026-10-04 Site visit with Marco #marco`. The Supernote's keyword search then finds every page about Marco.
- A note of its own, and a page in a shared note, also gets the item's tags as **keywords** (without `#next`, `#wf` and the other tags gtdpara uses itself), for example `marco`. A note from the **Note** tab in Quick Add gets the tags of its title as keywords the same way.
- Notes and pages of meetings and todos also get a **date keyword**: the meeting's date, or the day the todo was created (if it has a `created` date), for example `2026-10-04`. The keyword search matches part of a keyword, so searching `2026-10` finds everything from October 2026.
- These keywords are kept up to date whenever you open the note from gtdpara, while it is still refreshed: when a meeting moves to another day, its date keyword follows on the next open. A keyword that is only a date (like `2026-10-04`) on such a page belongs to gtdpara and is replaced; tag keywords are only ever added, never removed, so keywords you add yourself stay.
- With headings switched on (see above), the note's **table of contents** lists every meeting of a shared note by date and title.

## Todos and meetings: one note or one shared note

- **Own file** (default): every todo or meeting gets its own note in the project's `Todos` or `Meetings` folder.
- **Shared file**: all matching items become pages of one note per project, for example "Team sync". Meeting pages are sorted by date. Choose the file name and whether it sits in the subfolder or the project's root.

## Splitting a shared file by tag, year, quarter or month

The **Shared file name** can contain placeholders. Tap a placeholder under the field to insert it where the cursor is:

- `{tag}`: the rule's tag the item matched - `retro` for `#retro/alpha` when the rule has the tags `sparring` and `retro` (always lowercase)
- `{subtag}`: the part after the `/` of a nested tag - `sabina` for `#coaching/sabina` (always lowercase)
- `{year}`: `2026`
- `{quarter}`: `Q4`
- `{month}`: `10`

Example: one rule "Coaching" on the tag `coaching`, file name `Coaching {subtag} {year}`. A meeting tagged `#coaching/sabina` goes into `Coaching sabina 2026`, one tagged `#coaching/tom` into `Coaching tom 2026`, and one tagged just `#coaching` into `Coaching 2026`. The line below the field shows an example.

With `{tag}`, one rule serves several kinds of meetings: a rule on the tags `sparring` and `retro` with the file name `{tag} {subtag} {year}` puts `#sparring/max` into `sparring max 2026` and `#retro/alpha` into `retro alpha 2026`.

- A meeting uses its own date; a todo uses the day its note is created.
- Once a note page exists, it stays where it is. Changing the tag, the date or the rule later does not move it.

## Before a note is created

The first tap on a todo's or meeting's note icon doesn't create the note right away. The status line at the top first says what will happen, for example "Rule Coaching: new file Meetings/Coaching sabina 2026.note" or "Rule Coaching: new page in …". Tap the button to go ahead, or ✕ to cancel - for example to fix a misspelt tag first. Tap the message to see the full location.

The status line also asks first when:

- a page with the same title already exists in the shared file ("… already exists - link it?")
- the item's page or note file was deleted ("… not found (deleted?) - create it again?"). The old content does not come back; if you deleted it by mistake, restore the file first and tap ✕.

Once a note exists, the note icon opens it directly.
