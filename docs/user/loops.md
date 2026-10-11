# Loops

A **loop** is a todo that needed more than one step: a team workshop with a room to book, invites and an agenda; a book to read; a trip; a new e-bike that first needs a few offers. A loop is a small project that lives inside an Area or a Project, without a folder of its own. Its todos stay on the Area's page, and the loop keeps them together until you close it.

Threads you tend, loops you close: a thread (see [Threads](threads.md)) is an ongoing relationship, a loop has an end.

## Kinds of loops

A loop is named by a nested tag, `#<kind>/<name>`, for example `#workshop/teamoffsite` or `#read/deepwork`. The kinds come from your Tag Rules: a rule with the context **Loop** on the tag `workshop` makes every `#workshop/<name>` a loop. Each kind can have its own note template, see [Note templates](note-templates.md).

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

On an Area's or Project's page, the **Projects** tab lists the loops after the projects, each marked ○, sorted by main date. Each row shows the main date, the next meeting and the open, next and waiting-for todos; the note icon opens the loop note (or creates it from the Loop rule), the clip opens the linked file.

- **New** lists loop tags that are used on a `#next` or due todo, or on a meeting, but have no loop yet: **Track** starts the loop, **Not** leaves it a tag.
- **Someday** lists the loop ideas, **closed** the loops you closed.
- The page's todos are grouped by loop, the loops first, then the other todos.

## In your files

The loops of an Area or Project are listed in its file, under `## Loops`:

`- workshop/teamoffsite: active, 2026-11-14, [[Offsite brief.pdf]]`

The status (`active`, `done` or `dropped`), then the main date and the linked file, both optional. You can read and change these lines in Obsidian like the rest of the file.
