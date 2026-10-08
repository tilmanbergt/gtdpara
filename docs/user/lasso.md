# Lasso: capture and mark for later

Select handwriting with the lasso in any note or PDF, and gtdpara turns it into todos or a meeting - right away, or later.

The lasso toolbar has two gtdpara buttons:

- **Capture Todo/Meeting** opens gtdpara with the selection recognized, ready to save.
- **Mark for later** saves the selection as a mark in one tap, without opening gtdpara. Use it when there is no time to sort, for example in a meeting.

## Capturing right away

1. Select handwriting (or a text box) with the lasso and tap **Capture Todo/Meeting**.
2. The screen **New from Lasso** shows the selection as a picture and the recognized text below it. The text appears as soon as recognition is done, usually after a few seconds. If you start typing before that, your text is kept.
3. Choose **Todo** or **Meeting**, correct the text, and pick flow chips, tags and a due date as in [Quick Add](quick-add.md).
4. **File to** shows where the item goes: the project or area the note belongs to, otherwise the Inbox. The chips offer the Inbox, that place, your focused projects and areas and the ones you saved to lately; **More…** shows all of them. Writing an abbreviation like `#GR` in the text files it there, too.
5. Save with one of the three buttons under the text.

- **Save & next** saves and goes on: to the next open mark, if there is one, otherwise to an empty form for another item.
- **Save & view** saves and opens the project or area.
- **Save & close** saves and closes gtdpara.

**Link to this page** (on by default) gives the new item a link to the page you captured from: its clip opens the note at that page. The item's own note icon still creates its own note.

When the page belongs to a meeting - the meeting's own note, a page linked to it, or its page in a shared note - a todo you save records that meeting and gets its thread tag. The grey line in Quick Add shows it first; ✕ drops it. See [Threads](threads.md).

The lasso selection is removed once something is saved. **Mark for later** on this screen turns the selection into a mark instead.

## Several todos from one selection

A list with boxes, dashes, dots or numbers in front of the lines becomes one todo per line: **Split lines** is switched on and every line is a row you can edit or remove with ✕. A line without a bullet belongs to the line above it. A first line without a bullet is a heading and is put in front of every item, for example "Team sync: book room".

- **Split lines** switches between one item and one row per line.
- **✂ Split at cursor** splits where the cursor is. If you select a part of the text first, that part becomes the next item.
- A meeting is always one item.

## Marking for later

**Mark for later** keeps a picture and the handwriting of the selection, and puts a small bookmark icon into the note so you can see what is marked. Nothing is recognized yet, so the tap is quick.

The mark is listed in the project or area the note belongs to; marks from other notes and PDFs go to the Inbox.

## Processing marks

Open marks show as a card **n marks to process** under Quick Add:

- on the **Inbox** tab: all marks,
- on the **Current** tab: the marks of that project or area,
- in the Weekly Review step **Inbox to zero**: all marks, and they count toward the step.

**Process ›** opens the marks screen. The left column lists the marks by note, each with its picture, page, date and time, and whether it has been recognized yet. Recognition starts when you open the screen and runs ahead for the next marks; each mark is recognized only once.

- Work through them with **Save & next**: the mark is done and the next one is selected. After the last one the screen closes.
- **Open page** opens the note at the marked page.
- **Discard…** removes a mark without creating anything.

When a mark is saved, its bookmark in the note becomes a check mark. When it is discarded, the bookmark is removed. In a PDF, or where the icon can't be changed safely, the icon stays as it is.

One mark creates items of one kind: several todos, or one meeting.

## Closing out and archiving

The [close-out](close-out.md) checklist warns about open marks of the project, with **Process ›** next to each. Open marks don't block archiving: they move to the Inbox and still find their note in the archive.

## Where marks are stored

A mark is one line in a `## Marks` section of the project's `project.txt`, the area's `area.txt` or `Inbox.txt`:

```
## Marks

- 2026-10-05 10:42 [[Offsite prep.note]] p3 ^m-20261005-104212-351
```

Date and time, the note, the page and an id. Deleting the line by hand discards the mark. The picture and the handwriting are kept in the plugin's own storage on the device, not in your folders, and are removed once the mark is processed.

If a picture is missing (for example after the plugin was removed and installed again), the mark still works: type the text yourself.
