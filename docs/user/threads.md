# Threads

A nested tag such as `#retro/alpha` ties todos and meetings together. Its first part is the **type** (`retro`), its second part the **counterpart** (`alpha`: a person, a team, a group or a process), and both together are the **thread**. The thread overview shows everything around one thread or counterpart: what is coming up, what you owe, what you are waiting for and what was agreed in past meetings.

## Which items belong to a thread

- `#retro/alpha` belongs to the thread retro/alpha and to the counterpart alpha. A deeper tag such as `#retro/alpha/2026` belongs to the same thread.
- The plain tag `#alpha` belongs to the counterpart and shows up in every thread of it.
- `#wf/alpha` means you are waiting for alpha, see [Tags](tags.md).
- `#owe/alpha` means you promised alpha something outside a meeting.
- A plain `#retro` does not include the retro threads.

Nothing is written into your lines for this: gtdpara reads the tags you typed.

## How a todo relates to a thread

A todo can relate to a thread in three ways, and each has its own source:

- **I owe**: you agreed to it in a meeting of the thread (the todo carries that meeting, see "Where a todo was agreed" below), or you tagged it `#owe/alpha` for a promise made outside a meeting. `#owe/alpha` works together with `#next`, a due date or `#someday`; a plain `#owe` means nothing special.
- **Waiting for**: `#wf/alpha`; or a plain `#wf` on a todo agreed in the thread or tagged with it.
- **Relevant**: the todo has the thread's tag or the plain `#alpha`, and none of the above applies: something to raise or act on there.

A todo shows once, in the first of Waiting for, I owe, Relevant that applies. For example, in your 1:1 with Mieke you agree to raise the budget with Sven. You add the todo from that meeting and tag it `#101/sven`:

`- [ ] Raise budget question #101/sven [meeting:: 2026-09-30 1:1 Mieke 101/mieke]`

Mieke's thread shows it under **I owe** and under her meeting of 30.9. in **Looking back**; Sven's thread shows it under **Relevant**.

## Opening the overview

Tap a nested tag in a todo or meeting, on any screen: Daily, Week, Month, Inbox, Current or the Review. A `#w/f Name` label opens the overview for `#wf/name`. The overview opens over the screen; the tab bar stays.

- **‹ Daily** (the name of the tab underneath) closes it, and so does a tap on any tab. The screen behind is exactly as you left it.
- The help and the overview replace each other.
- On Daily, a plain tag such as `#alpha` still filters the list; a nested tag opens the overview instead.

## The place it covers

The overview belongs to the project or area of the row you tapped. It shows that area together with the projects assigned to it; a project with an assigned area shows its whole area. A project without an area and the Inbox each stand on their own. So `#retro/alpha` in one area is a different thread from `#retro/alpha` in another. The header shows the tag and where you are, for example `#retro/alpha in Coaching`.

## Thread or all of the counterpart

The switch at the top right chooses what you look at:

- `#retro/alpha`: this thread, plus items with the plain tag `#alpha`
- **All alpha**: everything with alpha in this place - every type used with it (`#review/alpha`, `#wf/alpha`, …) and `#alpha`

## Ahead

The upper list on the left:

- **Next meetings**: meetings of the thread that aren't over yet, soonest first
- **I owe**: open todos agreed in the thread's meetings or tagged `#owe/alpha`, Someday and Maybe included
- **Waiting for**: open todos you are waiting for alpha on
- **Relevant**: open todos with the thread's tag or `#alpha` that are neither of the above

A list with nothing in it is left out.

Tap a row to edit it in Quick Add; tick, note and file icons work as on every list.

## Looking back

The lower list on the left has one row per past meeting, newest first. Its second line says what came out of it, for example `3 agreed · 1 done · 2 open, oldest 12 d`: how many todos were agreed in the meeting, how many are done, how many are still open, and how many days the oldest open one has waited.

Tap a meeting to look at it on the right; at first the latest one is selected. The right side shows its title and date, **Open note** (or **+ Note** to create one), and the todos agreed in it: the open ones first, then the done ones by the day they were done.

## Adding from the overview

Quick Add on the right adds to the selected past meeting. A grey line says so, for example:

`↳ from Retro alpha · Wed 30.9.`

The new todo goes into the meeting's project or area and records the meeting at the end of the line. Its tags stay as you type them: add `#retro/alpha` only if you also want it under **Relevant** there, or another thread's tag for where you will raise it. Tap ✕ on the grey line to add this one todo without it; it then goes into the project or area you opened the overview from (or the Inbox).

## + Next retro

The header of **Ahead** offers **+ Next retro**: it copies the thread's latest meeting - title with its tags, time and length - to the next date and puts it into Quick Add's Meeting tab. The next date is the latest meeting's date plus the time between the last two meetings (a week when there is only one), moved on until it is today or later. A meeting already planned counts as the latest, so you never get one before it. Check the date and tap **+ Add**; the meeting goes into the same project or area as the latest one. In **All alpha** there is one button per type.

## Where a todo was agreed

A todo agreed in a meeting carries the meeting at the end of its line, for example `[meeting:: 2026-09-30 Retro alpha retro/alpha]`: the meeting's date and title, written without `#` so Obsidian doesn't count the meeting's tags as tags of the todo. gtdpara writes it, always with the grey line in Quick Add first, from:

- Quick Add in the thread overview
- the Review step **Meetings to close out**, see [Weekly Review](review.md)
- the lasso, when you capture from a page of a meeting's note or process a mark made there: the meeting's own note, a page linked to the meeting, or its page in a shared note, see [Lasso](lasso.md)

When you rename a meeting later, gtdpara still finds its todos by the meeting's date and its thread tag, which the line names (`retro/alpha` above). Lines in other files are never rewritten.

## Naming shared notes by type

One Tag Rule can serve several types: with the tags `sparring` and `retro` and the shared file name `{tag} {subtag} {year}`, `#retro/alpha` meetings go into `retro alpha 2026`. See [Note templates](note-templates.md).
