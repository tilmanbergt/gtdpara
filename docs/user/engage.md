# Engage

**Engage** is the step from organising to doing. While you work in a note, it shows a small panel over the note with your next actions for what you are working on, nothing else. One tap to open it, one or two taps to decide, and it is gone again.

## Opening Engage

- The **Engage** button in the sidebar of a note or document, next to the gtdpara button.
- **Engage ›** at the top of a Project's or Area's page, a loop overview or a thread overview.

The panel is about one **owner** at a time: a Project, an Area, a loop or a thread. It answers one question: what do I do next, here? Engage follows the note you are in:

- **Engage ›** on a page: that page's Project, Area, loop or thread.
- The Engage button on a todo's note (its own note, its page in a loop note, or its page in a shared notebook): that todo becomes the one you are working on. The owner is its loop; else its thread (the todo's own thread tag, or the thread of the meeting it was agreed in); else its Project or Area.
- The Engage button on a meeting's note or page: the meeting's thread, or else its loop or its Project or Area. When todos were agreed in that meeting, Engage opens on **Agreed** (below).
- On a loop note: the loop. On any other note in a Project's or Area's folder: that Project or Area.
- On a note that belongs to none of them: the owner of the todo you were last working on.
- Nothing fits: Engage shows today's focus to choose from (or this week's, when nothing is in today's focus).

When Engage shows another owner than the one of the todo you were working on, a line at the bottom, above **Open gtdpara** and **Close**, offers the way back, for example **Continue with Measure the beds**. Tap it to return to that todo. It is offered once: if you close the panel without it, what the panel showed - the new place's next action - is the one you are working on from then on (with no next action there, nothing is). Choosing a todo in the new place does the same at once. After **Engage ›** there is no such line: you chose the owner yourself.

## What belongs to an owner

Engage holds the same todos as the overviews:

- **A thread** holds what its [thread overview](threads.md) holds: todos with the thread's tag, the plain tag (`#mieke`), todos agreed in one of its meetings and `#owe/mieke`.
- **A loop** holds its tagged todos and the todos agreed in one of its meetings, also a meeting that is still running. See [Loops](loops.md).
- **A Project or Area** holds its todos except those of its active loops, so a loop step never shows twice.

## Next here and Today next

- **Next here**, under the header, names the owner's next meeting at any distance, for example "Next here: Thu 23.10. 10:00 Sparring Mieke ›". Tap it to open the meeting's note (or create it, after the usual question); the panel closes. Without a meeting ahead the line is hidden.
- **Today next**, quiet above **Open gtdpara**, names your next meeting today with a time, from all projects, areas and the Inbox, for example "Today next: 14:00 Retro demand · in 40 min". How long until it starts shows only when it is less than three hours away. It is worked out when the panel opens or its data changes - there is no ticking clock. When it is the same meeting as Next here, it is left out and Next here says "· next today".

## Working on

The todo you are working on stands at the top under **Working on**. When you haven't chosen one and the owner has exactly one `#next`, that one stands there as **Next action** - usually a project has just one next action. With several `#next` and none chosen, Engage says **Pick your next action below.**

- A line with what matters about it: the due date (with "overdue"), or for a Waiting For who you are waiting for and when to follow up, and the meeting it was agreed in.
- The large **✓** on the right ticks it off. **Remove #next** takes `#next` away (it goes back to the plan). For a todo without `#next`, the button is **Someday** instead.
- **Note ›** opens its note, or its page in a loop note or a shared notebook. Without a note, **+ Note** creates one the usual way: the status line first asks where it goes, and nothing is created without your confirmation.
- **File: name ›** opens the file linked to it, for example a PDF.

Opening the note or the file closes the panel: the note is in front now.

## Agreed, Next and Plan

Below are up to three tabs, each with how many todos it lists, five per page:

- **Agreed**: the open todos agreed in a meeting. Its first line names the meeting, for example "Agreed in Sparring Mieke · Tue 14.10.". On a meeting's note it is that meeting, when anything was agreed in it; otherwise, for a thread or a loop, its latest meeting that is over. Tap a `#next` row to work on it, **#next** makes a planned one a next action, **Done** ticks off one you are waiting for (marked "· waiting"). Someday and Maybe are left out. The tab shows only while it lists something. A todo that is agreed and `#next` shows under Agreed and under Next.
- **Next**: the owner's other `#next` todos. Tap one to work on it: it moves up to **Working on**. **Remove #next** on a row sends it back to the plan.
- **Plan**: the owner's todos without a flow state. **#next** on a row makes it a next action - it stays where it is, so you can mark several; then choose the one to work on under **Next**. **Someday** on a row parks it.

For a thread or a loop, Next and Plan list what you owe first - todos agreed in its meetings, and `#owe/…` for a thread - then the rest, each in the order of the file. A Project or Area keeps the order of the file.

Engage opens on **Agreed** from a meeting's note with agreed todos, else on **Next** when it lists anything, otherwise on **Plan**. It switches to **Plan** whenever **Next** runs empty, and away from **Agreed** when nothing is left there.

## Also here

Waiting For, Someday and Maybe todos are never offered to work on. One line under the tabs names them, for example "Also here: 2 waiting · 1 someday   Overview ›":

- **someday** (Someday and Maybe together) opens the Weekly Review's step **Someday / Maybe**, showing only this owner's todos. See [Weekly Review](review.md).
- **Overview ›** opens the thread's or loop's overview, or the Project's or Area's page.

A count that is 0 is left out, and the line hides when both are.

After Done, Remove #next, #next or Someday, a line shows what happened, with **Undo**. Undo puts the todo back as it was, as long as the panel is open and the todo was not changed elsewhere.

## When the owner is finished

With no open todo and no meeting ahead, Engage says **Nothing left in** the owner.

- A loop offers **Close loop…** (Done or Dropped, as in the loop overview).
- **+ Add todo** opens Quick Add for the owner.
- **Select next focus ›** shows today's focus.

When nothing is left in today's focus at all, Engage says **All done in today's focus.** and offers **Select new focus ›** with this week's focus.

## Choosing another owner

Engage never moves on to another owner by itself. **Select next focus ›** lists today's focus, **Select new focus ›** this week's: a line per loop, tended thread and Project or Area that has something to pick, with how many next actions it has or "pick next". The ones closest to what you just did come first. Tap a line to work on that owner; **‹ Back** returns.

## Quick Add, marks and leaving

- **Go to** with the notebook's name, for example "Go to Garden renovation 2026 ›": when the owner is a project or area with a home notebook ([Projects and Areas](projects-and-areas.md)) and you are in another of its notes, this line opens the notebook and closes the panel.
- **+ Quick Add** at the bottom opens Quick Add for the owner. For a loop or a thread, its tag is added to what you enter. **Cancel** folds it again.
- When the owner's Project or Area has marks to process, a line says so; it opens Process marks, and Close there brings you back to Engage.
- **Open gtdpara** opens the plugin as usual, **Close** (or ✕) closes the panel.

## After Done elsewhere

When you tick off a todo on Daily, the Current tab or a thread or loop overview, and it was the last `#next` of its owner, the status line asks: "… has no next action. Pick one:" with up to three todos of the plan, and **Later**. Picking one gives it `#next`. Nothing is suggested at any other time.

Focus mode and `#now` stay as they are; see [Daily and focus mode](daily.md).
