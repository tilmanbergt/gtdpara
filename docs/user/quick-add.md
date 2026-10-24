# Quick Add and capture

Quick Add is the small form you find on Daily, Week, Month, Inbox, Current and in the Review. It adds and edits todos, meetings and notes. Where an item goes depends on the screen: on a project's Current tab it goes into that project, on Daily, Week and Month into the Inbox - unless you file it right away (see below).

The box has four rows and always keeps the same height, so the lists below it never move:

- Row 1: the tabs **Todo**, **Meeting** (and **Agreement**, **Note**) on the left, the main button on the right - **+ Add**, or **Cancel** and **Save** while you edit.
- Row 2: the text or title, and the date.
- Row 3: flow chips or the meeting's time, then tags.
- Row 4: more tags - or the grey line (see below).

A tap on a todo or meeting puts its card into the same box, see below.

While you write in the text or date field, a small strip hovers over the tabs: **All**, **Copy**, **Cut** and **Paste** for the text, -1, **Today**, +1 and +7 for the date. Tap **✕** at its end to put it away, for example to switch tabs. It comes back the next time you tap into a field.

## Adding a todo

1. Choose the **Todo** tab and write the text. Handwriting is recognized as you write.
2. Optionally tap a flow chip: **Next**, **w/f** (waiting for), **Someday** or **Maybe**.
3. Optionally set a due date. While the date field is active, a strip offers -1, Today, +1 and +7.
4. Tap **+ Add** at the top right.

Kept GTD writes the due date as `[due:: …]` at the end of the line and records the day you added the todo as `[created:: …]`, see [Tags](tags.md). When you edit a todo, its created and done dates stay; clearing the due date in Quick Add removes it.

Recently used tags fill rows 3 and 4: tap one to insert it into the text, tap a filled one to remove it. **›** and **‹** at the end of row 4 page through more. A space typed right after `#` is removed automatically, so handwritten tags are recognized.

## Adding a meeting

Choose the **Meeting** tab, write the title, set the date and the time. For the time field see [Week and Month](week-and-month.md) (for example `15-16.30` or `2d`). The small **M** next to **+ Add** marks a monthly highlight.

## The grey line: where a todo comes from

Where a todo is agreed in a meeting - in a thread overview, in the Review step **Meetings to close out**, or when you capture from a meeting's note page - Quick Add shows one grey line in its fourth row, for example `↳ from Retro alpha · Wed 30.9.`. The new todo then records that meeting at the end of its line; its tags stay as you type them. In a thread overview the line also names the thread's tag, which new todos get (for example `#retro/alpha ✕`). Each part has its own ✕: tap it to add this one todo without it. See [Threads](threads.md).

## Adding an agreement

Where Quick Add knows who an agreement is with - a thread or loop overview, a project's or area's page - it has the tab **Agreement**: the words with their tags, and **valid till**, which offers **none**, **+1 m**, **+3 m**, **end of year** and **…** for another day. See [Agreements](agreements.md).

## Adding a note

On a project's or area's Current tab, the **Note** tab creates a new Supernote note with the title you write. It is created in the folder the Files pane is showing inside the project or area. Tags in the title become the note's keywords.

## Filing directly with an abbreviation

Every project and area has a short abbreviation, for example `GR` for "Garden renovation". Write `#GR` in the text and the button changes to **+ Add to Garden renovation**: the item is created right there instead of in the Inbox, and the tag is removed from the text. The next item then starts with `#GR ` already in the field, so a run of items for one project needs the tag once; delete it to add the next item where the screen adds.

## The Inbox

Whatever you add without a project or area lands in the Inbox: from Daily, Week and Month, from a lasso capture you don't file right away, and marks from notes outside your projects and areas. The **Inbox** tab shows all of it, grouped into Next, Waiting For, Someday, Maybe and Other; **Hide done tasks** keeps it short. The Files pane on the left lets you look into your projects, areas and resources while you sort.

To empty the Inbox, tap each item and, on its card, either finish it, delete it, or move it with the arrow next to its place (or an abbreviation tag while editing, see above). The Weekly Review has a step **Inbox to zero** for exactly this.

## The card: one tap selects

Tap a todo or a meeting in a list with Quick Add: the row gets a black bar and the item's **card** takes Quick Add's place, in the same box. Everything you can do with the item at once is on its card; nothing is saved until you tap a button there. **✕** closes the card, and Quick Add comes back with whatever you had started to type.

The todo card shows:

- First row: **Todo** and its state - due, overdue, waiting for someone, someday, done or deleted; the meeting it was agreed in (for example `↳ Sparring Mieke ›`, which opens that thread's overview); ✕ and **Edit**.
- Second row: the text and its labels.
- Third row: the box to tick it done; the flow chips **w/f**, **Maybe**, **Someday** and **Next** (tap one to set it, tap the filled one to clear it); **Now** while it is Next; the note icon.
- Fourth row: where the todo lives (tap the name to open it; where a Files pane is there, the arrow next to it moves the todo to another project or area); its linked file (tap the name to open it, ✕ removes the link), or **+** and the clip to link one where a Files pane is there; at the right the trash icon, which asks first and then removes the todo from your lists - it stays in the file, marked as cancelled.

Moving an item that has a note asks first: its own note moves along into the new project's `Todos` or `Meetings` folder. A page in a shared note stays in that note, and the item keeps its link to that page.

The meeting card is described in [Meetings](meetings.md). Cards exist wherever a list has Quick Add: Daily, a project's or area's Current tab, the Inbox, the Review's Inbox step, the thread and loop overviews, and (for meetings) the day panel of Week and Month.

## Editing

**Edit** on the card, or a second tap on the selected row, opens the item in Quick Add. Change what you need, then **Save** - or **Cancel** - at the top right; **Save** brings you back to the card. Only one item is edited at a time: tapping another row saves the open edit first. With an abbreviation tag in the text, **Save** reads **Save to** followed by that project's name: it saves your changes and moves the item there in one step.

## Notes and files on a todo or meeting

Every todo and meeting can have its own handwritten note - one of Kept's most useful features. One tap creates it, already filled in: title, date and time, related open todos, a background from your templates. Next time the same tap opens it again.

- The note icon (+ with a notebook) creates a note for the todo or meeting and opens it, after you confirm what will be created in the status line; the notebook icon opens it later. How the note looks and where it goes is set by [Note setups](note-setups.md).
- The clip icon links an existing file (for example a PDF from Resources). On a todo row, tap the `+` clip, then tap the file in the Files pane; or select the todo or meeting and tap **+** and the clip on its card. A filled clip opens the linked file. To remove a link, tap ✕ next to the file's name on the card.

## Capturing handwriting with the lasso

Select handwriting in any note and tap **Capture Todo/Meeting** in the lasso toolbar: Kept recognizes it and opens the same form, with **Save & next**, **Save & view** and **Save & close**. **Mark for later** saves a selection for later without opening Kept. Open marks show as a card **n marks to process** on the Inbox tab. Both are explained in [Lasso: capture and mark for later](lasso.md).
