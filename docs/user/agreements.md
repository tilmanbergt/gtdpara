# Agreements

An agreement is something you settle with someone that is not a todo: "Feedback only in our 1:1s", "No calls after six", "Slides go out a day ahead". Nobody ticks it off. It holds until you change or end it, or until the date it is valid till.

Kept keeps agreements next to the todos and meetings they belong to, so you see them when they matter: in a thread's overview, in a loop's overview and on a project's or area's page.

## Who an agreement belongs to

Like a todo, an agreement belongs where its tags say:

- **A thread**: tagged with the thread, for example `#sparring/mieke`, or with the plain `#mieke`. It shows in the thread's overview, and in **All mieke**.
- **A loop**: tagged with the loop, for example `#workshop/offsite`. It shows in the loop's overview.
- **A project or area**: no thread or loop tag. It shows on its page.

It is written into the file that owns this place: for a thread the area's `area.txt` (or the project's `project.txt` when the project has no area), for a loop the file the loop lives in, for a project or area its own file. Agreements are never kept in the Inbox.

## Adding one

Quick Add has a tab **Agreement** wherever it knows who the agreement is with: in a thread or loop overview and on a project's or area's page.

1. Choose **Agreement** and write the words. Tags work as for todos.
2. Optionally tap **valid till**. A strip hovers over the tabs: **none**, **+1 m**, **+3 m**, **end of year**, and **…** to type another day. **✕** puts it away.
3. Tap **+ Add**. The status line says where it went, for example "Agreement added to Coaching".

In a thread overview the agreement gets the thread's tag and the meeting selected in **Looking back**, the same way a new todo does; the grey line in Quick Add shows both, each with its ✕. In a loop overview it gets the loop's tag.

## The card

Tap an agreement to see its card in Quick Add's place:

- **Agreement · since 14.10.** and, when it was made in a meeting, the meeting (tap it to open that meeting's thread overview)
- the words and tags
- **valid till 31.12.** (with "– over" once that day has passed), **Change** and **End**
- where it lives

**Edit** (or a second tap on the row) changes the words, tags or valid-till date. It stays the same agreement.

## Changing and ending

Agreements are never deleted: the old wording stays in your file.

- **Change**: Quick Add opens with the words of the agreement and the grey line "↳ replaces …". Write the new agreement and tap **+ Add**: the old one is ended today and the new one is added after it. **Cancel** (or the ✕ in the grey line) leaves the old one as it is.
- **End**: asks once, then marks the agreement ended today.

## Where agreements show

- **Thread and loop overviews**: a block **Agreements** in **Ahead**, after **Waiting for**. In **Looking back** a row such as **2 agreements ended ›** lists the ended ones on the right, and a past meeting lists the **Agreements made** in it.
- **A project's or area's page**: when it has agreements of its own, its todo list ends with **◇ Agreements 2 ›**. Tap it to list them in that column; **‹ Todos** goes back.

## In your files

Agreements are plain bullets in a section `## Agreements`:

```
## Agreements
- Feedback only in our 1:1s #sparring/mieke [meeting:: 2026-10-14 Sparring Mieke sparring/mieke] [created:: 2026-10-14] [valid:: 2026-12-31]
- No calls after six #mieke [created:: 2026-09-02] [ended:: 2026-10-20]
```

- `[meeting:: …]` is the meeting it was made in, `[created:: …]` the day it was added, `[valid:: …]` the day it holds until, `[ended:: …]` the day it was ended. An agreement without `ended` is active.
- There is no checkbox, so the Tasks plugin in Obsidian does not list agreements as tasks.
- You can write agreements by hand. Fields Kept doesn't know, other lines and blank lines stay as they are; a line Kept didn't change is written back exactly as you wrote it.
