# Loops

A **loop** is a todo that needed more than one step: a team workshop with a room to book, invites and an agenda; a book to read; a trip; a new e-bike that first needs a few offers. A loop is a small project that lives inside an Area or a Project, without a folder of its own. Its todos stay on the Area's page, and the loop keeps them together until you close it.

Threads you tend, loops you close: a thread (see [Threads](threads.md)) is an ongoing relationship, a loop has an end.

## Kinds of loops

A loop is named by a nested tag, `#<kind>/<name>`, for example `#workshop/teamoffsite` or `#read/deepwork`. The kinds come from your Note setups: a setup of the kind **Loop** on the tag `workshop` makes every `#workshop/<name>` a loop. Each kind has its own pages for the loop note, see [Note setups](note-setups.md).

- Only the full tag counts: `#workshop/teamoffsite`. A plain `#teamoffsite` is just a tag.
- A loop belongs to exactly one Area or Project: the one its line is in. The Inbox never holds loops.

## Starting a loop

Type only the loop's tag into Quick Add, for example `#workshop/teamoffsite`. The button turns into **+ Add loop**, and the date field becomes the loop's **main date**: the day it is all about, like the workshop day. A file you attach becomes the loop's linked file. After the tap, the status line says the loop has started.

- `#next` or `#now` don't change this: a todo that is only a loop tag is the loop.
- With `#someday` or `#maybe`, it stays a todo: a **loop idea**, such as `#read/oldshatterhand #someday`. When you take someday or maybe off - in Quick Add or in the Weekly Review - it becomes the loop.
- A todo with words and a loop tag, like `Book room #workshop/teamoffsite`, is a todo of that loop.
- A todo you already have can become a loop: edit it and replace its text with the loop's tag. **Save** turns into **Make loop**; its due date becomes the main date, and its own note and linked file come along.
- In the Inbox, a loop tag on its own stays a todo; it becomes the loop when you file it into an Area or Project.
- If the loop already exists, **+ Add** stays grey: type some words to add a todo of it.

## Where loops show

On an Area's page, the **Projects** tab lists the loops after the projects; a Project's page has a **Loops** tab for its own loops. Both list them, each marked ○, sorted by main date. Each row shows the main date, the next meeting and the open, next and waiting-for todos; the note icon opens the loop note (or creates it from the Loop setup), the clip opens the linked file. Tap a loop to open its overview.

- **Linking a file** to a loop - the book's PDF or epub, the offer, the brief: tap **+** and the clip on a loop without a file, or **Link file** in its overview. The Files pane asks you to pick a file, like linking a file to a todo; tap it. To link another one, remove the file in **Edit** (✕) first: a loop has one linked file. Its note is separate - the place for your own notes.

- **New** lists loop tags that are used on a `#next` or due todo, or on a meeting, but have no loop yet: **Track** starts the loop.
- **Someday** lists the loop ideas, **closed** the loops you closed.
- The page's todos are grouped by loop, the loops first, then the other todos.

## The loop overview

Tap a loop row, or a loop tag in any todo or meeting of its Area or Project, to see everything of the loop:

- The header: the loop's name and kind, where it lives, and its main date with the days to go. **File ›** opens the linked file (**Link file** while it has none), **Edit** loads the loop into Quick Add, **Engage ›** opens [Engage](engage.md) for the loop.
- **Ahead**: the loop's next meetings, then its open todos - first the ones agreed in its meetings (also one that is still running), then the ones waiting for someone, then the rest. Someday and Maybe todos are only counted, in a last row such as **1 someday ›**, which opens the Weekly Review's step **Someday / Maybe** with just these todos. **+ Next workshop** (the loop's kind) fills Quick Add with the next meeting, copied from the last one.
- **Looking back**: its past meetings, each with what was agreed in it, and what was done since the last one. A past meeting also offers **Reflect ›** for its [Reflection page](meetings.md).
- Quick Add on the right adds to the loop: a new todo or meeting gets the loop's tag on its own and goes to the loop's Area or Project.

A todo is one of the loop's when it has the loop's tag, or was agreed in one of the loop's meetings - past, running or ahead. [Engage](engage.md) for the loop holds the same todos, and its Area or Project leaves them out.

## The loop note

Every loop has one note, from start to end, in its Area's or Project's folder. Its name comes from the Loop setup (see [Note setups](note-setups.md)), for example `2026-11 workshop teamoffsite`.

- The 📓 on a loop row, or **Note ›** in the overview, opens it. The first time, the status line asks, then the note is created: its first page is the loop's own, filled from the Loop setup's First page.
- A todo of the loop gets its note as a page in the loop note. A meeting does too, unless it also carries the tag of a Thread setup - `#jf`, say: a meeting goes to the thread first. When both are possible, the question before the note is created offers the other place as a second button; the meeting still shows in the loop. Pages follow the timeline after the loop's page, see [Note setups](note-setups.md).
- Prep and review tracking applies when any setup matching the meeting asks for it.

## Editing a loop

**Edit** in the overview loads the loop into Quick Add: its tag, its main date and its linked file. Change them and tap **Save loop**.

- A new name, like `#workshop/offsite` instead of `#workshop/teamoffsite`, renames the loop: the status line asks first, then every todo and meeting of the loop gets the new tag.
- When the loop note's name changes with it - with the default name, when the main date moves to another month - the status line asks before the note is renamed. Links to it follow.
- Declining a question saves nothing.

## Closing a loop

A loop ends as **Done** (it reached its end) or **Dropped** (it stops here). **Close loop** in the overview or in the Weekly Review asks which one.

- A loop closes only when it has no open todo and no meeting ahead. Otherwise the status line says what is still open - `2 open todos, 1 upcoming meeting` - and **Show** opens the loop. Finish or cancel them, file them elsewhere, or take the loop's tag off.
- Its note and its todos stay where they are. Closed loops stay readable: the Projects tab lists them folded, the overview shows them as closed, and **Reopen** makes one active again.
- Loops are never deleted.

## In the Weekly Review

The step **Open loops** lists your loops per area and project, and points at the ones without a next action or past their main date. See [Weekly Review](review.md).

## In your files

The loops of an Area or Project are listed in its file, under `## Loops`:

`- workshop/teamoffsite: active, 2026-11-14, [[Offsite brief.pdf]]`

The status (`active`, `done` or `dropped`), then the main date and the linked file, both optional. You can read and change these lines in Obsidian like the rest of the file.
