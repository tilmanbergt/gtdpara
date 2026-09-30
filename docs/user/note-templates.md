# Note templates (Tag Rules)

When gtdpara creates a note for a todo, a meeting, a project or an area, a **Tag Rule** decides how it looks: which background it uses and what is written onto the first page.

You find the rules in **Settings → Tag Rules**.

## How a rule is chosen

- Every rule belongs to one context: **Project**, **Area**, **Todo** or **Meeting**.
- A rule has one or more tags. It applies when the item has any of them.
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

- A note of its own is named after its item, for example `2026-10-04 - Site visit with Marco #marco`, so the Supernote's file search finds it.
- A page in a shared note gets a **keyword**: the meeting's date and title, or the todo's text, including its tags - for example `2026-10-04 Site visit with Marco #marco`. The Supernote's keyword search then finds every page about Marco.
- A note from the **Note** tab in Quick Add gets the tags of its title as keywords.

## Todos and meetings: one note or one shared note

- **Own file** (default): every todo or meeting gets its own note in the project's `Todos` or `Meetings` folder.
- **Shared file**: all matching items become pages of one note per project, for example "Team sync". Meeting pages are sorted by date. Choose the file name and whether it sits in the subfolder or the project's root.
