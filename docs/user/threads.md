# Threads

A nested tag such as `#retro/alpha` ties todos and meetings together. Its first part is the **type** (`retro`), its second part the **counterpart** (`alpha`: a person, a team, a group or a process), and both together are the **thread**. The thread overview shows everything around one thread or counterpart: what is coming up, what you owe, what you are waiting for and what was agreed in past meetings.

## Which items belong to a thread

- `#retro/alpha` belongs to the thread retro/alpha and to the counterpart alpha. A deeper tag such as `#retro/alpha/2026` belongs to the same thread.
- The plain tag `#alpha` belongs to the counterpart and shows up in every thread of it.
- `#wf/alpha` means you are waiting for alpha, see [Tags](tags.md).
- `#owe/alpha` means you promised alpha something outside a meeting.
- A plain `#retro` does not include the retro threads.

Nothing is written into your lines for this: Kept GTD reads the tags you typed.

## How a todo relates to a thread

A todo can relate to a thread in three ways, and each has its own source:

- **I owe**: you agreed to it in a meeting of the thread (the todo carries that meeting, see "Where a todo was agreed" below), or you tagged it `#owe/alpha` for a promise made outside a meeting. `#owe/alpha` works together with `#next` or a due date; a plain `#owe` means nothing special.
- **Waiting for**: `#wf/alpha`; or a plain `#wf` on a todo agreed in the thread or tagged with it.
- **Relevant**: the todo has the thread's tag or the plain `#alpha`, and none of the above applies: something to raise or act on there.

A todo shows once, in the first of Waiting for, I owe, Relevant that applies. For example, in your 1:1 with Mieke you agree to raise the budget with Sven. You add the todo from that meeting and tag it `#101/sven`:

`- [ ] Raise budget question #101/sven [meeting:: 2026-09-30 1:1 Mieke 101/mieke]`

Mieke's thread shows it under **I owe** and under her meeting of 30.9. in **Looking back**; Sven's thread shows it under **Relevant**.

## Opening the overview

Tap a nested tag in a todo or meeting, on any screen: Daily, Week, Month, Inbox, Current or the Review. A `#w/f Name` label and an `#owe/name` tag name a counterpart rather than a thread: they open **All name**, everything with that counterpart, without the switch. The overview opens over the screen; the tab bar stays.

- **‹ Daily** (the name of the tab underneath) closes it, and so does a tap on any tab. The screen behind is exactly as you left it.
- The help and the overview replace each other.
- On Daily, a plain tag such as `#alpha` still filters the list; a nested tag opens the overview instead.

## The place it covers

The overview belongs to the project or area of the row you tapped. It shows that area together with the projects assigned to it; a project with an assigned area shows its whole area. A project without an area and the Inbox each stand on their own. So `#retro/alpha` in one area is a different thread from `#retro/alpha` in another. A todo counts where it is filed: one agreed in a meeting but sent to the Inbox shows in the meeting's thread once you file it into that project or area. The header shows the tag and where you are, for example `#retro/alpha in Coaching`. **Engage ›** opens [Engage](engage.md) for the thread (not for `#wf/…` and `#owe/…`, which name a person rather than a thread).

## Thread or all of the counterpart

The switch at the top right chooses what you look at:

- `#retro/alpha`: this thread, plus items with the plain tag `#alpha`
- **All alpha**: everything with alpha in this place - every type used with it (`#review/alpha`, `#wf/alpha`, …) and `#alpha`

## Ahead

The upper list on the left:

- **Next meetings**: meetings of the thread that aren't over yet, soonest first
- **I owe**: open todos agreed in the thread's meetings or tagged `#owe/alpha`
- **Waiting for**: open todos you are waiting for alpha on
- **Agreements**: the thread's active agreements, shown after **Waiting for** (see [Agreements](agreements.md))
- **Relevant**: open todos with the thread's tag or `#alpha` that are neither of the above
- a last, quiet row such as **1 someday ›**: the thread's Someday and Maybe todos are not listed, only counted. Tap it to open the Weekly Review's step **Someday / Maybe** with just these todos, see [Weekly Review](review.md).

A list with nothing in it is left out. [Engage](engage.md) for the thread holds the same todos. Tapping one of its meetings shows the meeting's card in Quick Add's place: its prep or review tick and **Reflect** (see [Meetings](meetings.md)).

Tap a todo, meeting or agreement row to see its card in Quick Add's place, a second time to edit it (see [Quick Add](quick-add.md)); tick, note and file icons work as on every list.

## Looking back

The lower list on the left starts with a row such as `Since Wed 30.9. · 4 done`: the todos of this thread you ticked since its latest past meeting, whichever way they relate to it. Tap it to see them on the right, by the day they were done. Only todos ticked with version 0.10 or later carry the day they were done, so older ones don't show here. Without a past meeting there is no such row.

When agreements of the thread were ended, a row such as **1 agreement ended ›** follows; tap it to list them on the right.

Below it is one row per past meeting, newest first. Its second line says what came out of it, for example `3 agreed · 1 done · 2 open, oldest 12 d`: how many todos were agreed in the meeting, how many are done, how many are still open, and how many days the oldest open one has waited.

Tap a meeting to look at it on the right; at first the latest one is selected. The right side shows its title and date, **Open note** (or **+ Note** to create one), **Reflect ›** (or **Reflection ›** once it exists) for its [Reflection page](meetings.md), and the todos agreed in it: the open ones first, then the done ones by the day they were done. The **Agreements made** in the meeting come last.

## Adding from the overview

Quick Add on the right adds to the selected past meeting (with the **Since** row selected, it adds to the project or area you opened the overview from, without a meeting). A grey line says so, for example:

`↳ from Retro alpha · Wed 30.9.`

The new todo goes into the meeting's project or area and records the meeting at the end of the line.

New todos also get the thread's tag, shown in the same grey line, for example `↳ from Retro alpha · Wed 30.9. ✕   #retro/alpha ✕`. In **All alpha** (and in a `#wf/…` or `#owe/…` overview) it is the plain `#alpha`. A tag you typed yourself is not added twice.

Each part has its own ✕: tap it to add this one todo without it. Without the meeting, the todo goes into the project or area you opened the overview from (or the Inbox). This applies to todos and agreements, not to meetings.

The **Agreement** tab adds an agreement with the same tag and meeting. It goes into the file of the area (or of the project without an area) the thread is tended in, see [Agreements](agreements.md).

## + Next retro

The header of **Ahead** offers **+ Next retro**: it copies the thread's latest meeting - title with its tags, time and length - to the next date and puts it into Quick Add's Meeting tab. The next date is the latest meeting's date plus the time between the last two meetings (a week when there is only one), moved on until it is today or later. A meeting already planned counts as the latest, so you never get one before it. Check the date and tap **+ Add**; the meeting goes into the same project or area as the latest one. In **All alpha** there is one button per type.

## Where a todo was agreed

A todo agreed in a meeting carries the meeting at the end of its line, for example `[meeting:: 2026-09-30 Retro alpha retro/alpha]`: the meeting's date and title, written without `#` so Obsidian doesn't count the meeting's tags as tags of the todo. Kept writes it, always with the grey line in Quick Add first, from:

- Quick Add in the thread overview
- the Review step **Meetings to close out**, see [Weekly Review](review.md)
- the lasso, when you capture from a page of a meeting's note or process a mark made there: the meeting's own note, a page linked to the meeting, or its page in a shared note, see [Lasso](lasso.md)

When you rename a meeting later, Kept still finds its todos by the meeting's date and its thread tag, which the line names (`retro/alpha` above). Lines in other files are never rewritten.

## Tending counterparts

The counterparts you work with belong to an area together with its projects, or to a project without an area. `#101/mieke` in the Atruvia area and in one of its projects is one counterpart; the same name in another area is a different one. Only nested tags whose type is a tag of one of your Thread setups (see [Note setups](note-setups.md)), and `#wf/name` and `#owe/name`, make counterparts; other nested tags such as `#tax/2026` don't.

A counterpart you use for the first time is **new**: Kept asks you, in the Weekly Review's **Tending threads** and on the Current page's **Threads** tab, whether to **Tend** it (it stays active) or **Not** (it is set aside, inactive). Nothing is decided for you. Your answer is one line in the area's file (`area.txt`), or in the project's file for a project without an area:

`## Threads`
`- mieke: active`
`- sven: inactive`

You can edit these lines by hand. A counterpart used only with `#wf/name` or `#owe/name` (no meetings) is tended like the others but marked `w/f only`, `owe only` or `w/f · owe only`, so a one-off promise or waiting-for stands out from an ongoing relationship. The Inbox has no counterparts of its own: it is meant to be emptied soon.

**Set inactive** (on the Threads tab or in the Review) first goes through the counterpart's open todos under I owe, Waiting for, Relevant and Someday / Maybe: Done, Cancel or Keep each one. An inactive counterpart leaves the Review and the tag suggestions; its overview and history keep working. When it gets a new meeting, it comes back as `back in use: name` with Tend / Not.

See [Projects and Areas](projects-and-areas.md) for the Threads tab and [Weekly Review](review.md) for the step.

## Since last time on a meeting note

A Meeting page can have the piece **Since last time**: on the meeting's note it prints what happened in the meeting's thread since the previous meeting of that thread - what was agreed then, what you owe, wait for and should raise, and what got done since. See [Note setups](note-setups.md).

## Naming shared notes by type

One Note setup can serve several types: with the tags `sparring` and `retro` and the notebook name `{tag} {subtag} {year}`, `#retro/alpha` meetings go into `retro alpha 2026`. See [Note setups](note-setups.md).
