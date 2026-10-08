# Tags

Tags are words with a `#` in front, written straight into a todo or meeting. They are plain text, so they also work when you edit the files by hand.

## Flow tags for todos

Each todo has at most one of these. The chips in Quick Add set them for you.

- `#next`: the next physical step. Shows on Daily when its project or area is in focus. Label: `#next`.
- `#wf/name`: you are waiting for someone, for example `#wf/lena`, or just `#wf` without a name. Shows on Daily until you get it (label `#w/f Lena`); give it a due date to keep it off Daily until that day. You also find them in the **Waiting For** group of their project, area or the Inbox. The older form `#waiting-for:lena` still works; gtdpara writes `#wf/lena` the next time you edit the todo in Quick Add.
- `#someday` and `#maybe`: parked ideas. Never on Daily; a project with only these counts as stalled in the Review.

## Due dates

A due date is not a tag but a field at the end of the line: `[due:: 2026-10-15]`. Quick Add writes it for you. Todos due today, tomorrow or earlier show on Daily. The label reads `#due 15.10.`, with `!` when overdue. For a Waiting for todo the date is when to follow up: it shows on Daily from that day on.

An older `#due:2026-10-15` tag still counts as the due date. When you edit the todo in Quick Add or set its due date in the Review, gtdpara removes the tag and writes the field.

## Dates gtdpara records

You type tags; gtdpara writes fields. Besides the due date it records two dates on a todo, at the end of the line:

- `[created:: 2026-10-07]`: the day the todo was added
- `[completion:: 2026-10-09]`: the day it was checked done; unchecking removes it again

Todos added with older versions get no created date, and a todo checked before this version gets no completion date: gtdpara never makes up a date. See [Your files and folders](files-and-folders.md) for how the line is built and how Obsidian reads it.

## Now

`#now` marks what you are doing right now, on top of `#next`. It drives [focus mode](daily.md).

## Context tags

Any other tag is a context tag: a person (`#lena`), a topic (`#budget`) or a recurring meeting (`#team-sync`). Tap a plain context tag on Daily to see only matching items. Note templates can react to context tags - see [Tag Rules](note-templates.md).

## Nested tags

A tag can have parts separated by `/`, for example `#coaching/sabina`. It is one tag: one chip in Quick Add. Obsidian reads the same syntax as a nested tag.

- A Tag Rule on `coaching` also applies to `#coaching/sabina`, `#coaching/tom` and so on. The part after the `/` can choose the shared file, see [Tag Rules](note-templates.md).
- Tapping a nested tag in any list opens its thread overview: everything around `#coaching/sabina` - upcoming meetings, open todos, what you wait for and what was agreed in past meetings. See [Threads](threads.md). On Daily, a nested tag does not filter the list; a plain tag does.

## Project and area abbreviations

A tag that matches a project's or area's abbreviation (for example `#GR`) is shown in capitals. It lets you file an item directly into that project from Quick Add, and as a Daily filter it shows all of that project's items. Abbreviations are not case-sensitive.

## Tags the app sets itself

- `#prepped` and `#reviewed`: meeting preparation and review, see [Meetings](meetings.md)
- `#monthly`: the meeting is a monthly highlight

These words, the flow words, `wf` and `now` can't be used as abbreviations.
