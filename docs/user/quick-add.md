# Quick Add and capture

Quick Add is the small form you find on Daily, Week, Month, Inbox, Current and in the Review. It adds and edits todos, meetings and notes. Where an item goes depends on the screen: on a project's Current tab it goes into that project, on Daily, Week and Month into the Inbox - unless you file it right away (see below).

## Adding a todo

1. Choose the **Todo** tab and write the text. Handwriting is recognized as you write.
2. Optionally tap a flow chip: **Next**, **w/f** (waiting for), **Someday** or **Maybe**.
3. Optionally set a due date. While the date field is active, a strip offers -1, Today, +1 and +7.
4. Tap **+ Add**.

gtdpara writes the due date as `[due:: …]` at the end of the line and records the day you added the todo as `[created:: …]`, see [Tags](tags.md). When you edit a todo, its created and done dates stay; clearing the due date in Quick Add removes it.

A row of recently used tags lets you insert a tag with one tap. A space typed right after `#` is removed automatically, so handwritten tags are recognized.

## Adding a meeting

Choose the **Meeting** tab, write the title, set the date and the time. For the time field see [Week and Month](week-and-month.md) (for example `15-16.30` or `2d`). The small **M** marks a monthly highlight.

## The grey line: where a todo comes from

Where a todo is agreed in a meeting - in a thread overview, in the Review step **Meetings to close out**, or when you capture from a meeting's note page - Quick Add shows one grey line above its buttons, for example `↳ from Retro alpha · Wed 30.9.`. The new todo then records that meeting at the end of its line; its tags stay as you type them. Tap ✕ on the line to add this one todo without the link. See [Threads](threads.md).

## Adding a note

On a project's or area's Current tab, the **Note** tab creates a new Supernote note with the title you write. It is created in the folder the Files pane is showing inside the project or area. Tags in the title become the note's keywords.

## Filing directly with an abbreviation

Every project and area has a short abbreviation, for example `GR` for "Garden renovation". Write `#GR` in the text and the button changes to **+ Add to Garden renovation**: the item is created right there instead of in the Inbox, and the tag is removed from the text.

## The Inbox

Whatever you add without a project or area lands in the Inbox: from Daily, Week and Month, from a lasso capture you don't file right away, and marks from notes outside your projects and areas. The **Inbox** tab shows all of it, grouped into Next, Waiting For, Someday, Maybe and Other; **Hide done tasks** keeps it short. The Files pane on the left lets you look into your projects, areas and resources while you sort.

To empty the Inbox, open each item and either finish it, cancel it, or move it with **Refile** (or an abbreviation tag, see above). The Weekly Review has a step **Inbox to zero** for exactly this.

## Editing

Tap a todo or meeting in any list to open it in Quick Add. Change what you need, then **Save** - or **Cancel**. Only one item is edited at a time.

- The trash icon removes the item from your lists. It stays in the file, marked as cancelled.
- **Refile** moves it to another project or area; pick the target in the Files pane. With an abbreviation tag in the text, the button reads **File:** followed by that project's name and moves it directly. If the item has a note, gtdpara asks first: its own note moves along into the new project's `Todos` or `Meetings` folder. A page in a shared note stays in that note, and the item keeps its link to that page.
- **New from this** (meetings) starts a new meeting with the same title, for example the next session of a series.

## Notes and files on a todo or meeting

Every todo and meeting can have its own handwritten note - one of gtdpara's most useful features. One tap creates it, already filled in: title, date and time, related open todos, a background from your templates. Next time the same tap opens it again.

- The note icon (+ with a notebook) creates a note for the todo or meeting and opens it, after you confirm what will be created in the status line; the notebook icon opens it later. How the note looks and where it goes is set by [Tag Rules](note-templates.md).
- The clip icon links an existing file (for example a PDF from Resources). Tap the `+` clip, then tap the file in the Files pane. A filled clip opens the linked file. To remove a link, edit the item and tap ✕ next to the clip.

## Capturing handwriting with the lasso

Select handwriting in any note and tap **Capture Todo/Meeting** in the lasso toolbar: gtdpara recognizes it and opens the same form, with **Save & next**, **Save & view** and **Save & close**. **Mark for later** saves a selection for later without opening gtdpara. Open marks show as a card **n marks to process** on the Inbox tab. Both are explained in [Lasso: capture and mark for later](lasso.md).
