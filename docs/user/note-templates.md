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
  - **Title** of the item
  - **Date** and **Time** (meetings)
  - **Related items**: open todos and meetings that share a tag with the item
  - **Linked file**: a link to the file linked to the item
  - a **static text** you write once for this rule (**+ New text**) and place on the page, for example "Agenda" or "Decisions"
- The preview shows where each piece sits. Select a piece and move it with the arrows; change its font size and maximum width.

**Create** or **Save** stores the rule; it is used for notes created from then on.

## Meetings only

- **Prepare before** and **Review after** switch on the preparation and review marks for matching meetings, see [Meetings](meetings.md).

## Finding notes again

- A note of its own is named after its item, for example `2026-10-04 - Site visit with Marco marco`, so the Supernote's file search finds it. File names leave out `#` and the other characters listed in [Your files and folders](files-and-folders.md).
- A page in a shared note gets a **keyword**: the meeting's date and title, or the todo's text, including its tags - for example `2026-10-04 Site visit with Marco #marco`. The Supernote's keyword search then finds every page about Marco.
- A note of its own also gets the item's tags as **keywords** (without `#next`, `#wf` and the other tags gtdpara uses itself), for example `marco`. A note from the **Note** tab in Quick Add gets the tags of its title as keywords the same way.

## Todos and meetings: one note or one shared note

- **Own file** (default): every todo or meeting gets its own note in the project's `Todos` or `Meetings` folder.
- **Shared file**: all matching items become pages of one note per project, for example "Team sync". Meeting pages are sorted by date. Choose the file name and whether it sits in the subfolder or the project's root.

## Splitting a shared file by tag, year, quarter or month

The **Shared file name** can contain placeholders. Tap a placeholder under the field to insert it where the cursor is:

- `{subtag}`: the part after the `/` of a nested tag - `sabina` for `#coaching/sabina` (always lowercase)
- `{year}`: `2026`
- `{quarter}`: `Q4`
- `{month}`: `10`

Example: one rule "Coaching" on the tag `coaching`, file name `Coaching {subtag} {year}`. A meeting tagged `#coaching/sabina` goes into `Coaching sabina 2026`, one tagged `#coaching/tom` into `Coaching tom 2026`, and one tagged just `#coaching` into `Coaching 2026`. The line below the field shows an example.

- A meeting uses its own date; a todo uses the day its note is created.
- Once a note page exists, it stays where it is. Changing the tag, the date or the rule later does not move it.

## Before a note is created

The first tap on a todo's or meeting's note icon doesn't create the note right away. The status line at the top first says what will happen, for example "Rule Coaching: new file Meetings/Coaching sabina 2026.note" or "Rule Coaching: new page in …". Tap the button to go ahead, or ✕ to cancel - for example to fix a misspelt tag first. Tap the message to see the full location.

The status line also asks first when:

- a page with the same title already exists in the shared file ("… already exists - link it?")
- the item's page or note file was deleted ("… not found (deleted?) - create it again?"). The old content does not come back; if you deleted it by mistake, restore the file first and tap ✕.

Once a note exists, the note icon opens it directly.
