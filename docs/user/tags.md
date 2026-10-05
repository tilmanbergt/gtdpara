# Tags

Tags are words with a `#` in front, written straight into a todo or meeting. They are plain text, so they also work when you edit the files by hand.

## Flow tags for todos

Each todo has at most one of these. The chips in Quick Add set them for you.

- `#next`: the next physical step. Shows on Daily when its project or area is in focus. Label: `#next`.
- `#waiting-for:name`: you are waiting for someone, for example `#waiting-for:lena`. Shows on Daily until you get it (label `#w/f Lena`); give it a due date to keep it off Daily until that day. You also find them in the **Waiting For** group of their project, area or the Inbox.
- `#someday` and `#maybe`: parked ideas. Never on Daily; a project with only these counts as stalled in the Review.

## Due dates

`#due:2026-10-15` sets a due date. Quick Add writes it for you. Todos due today, tomorrow or earlier show on Daily. The label reads `#due 15.10.`, with `!` when overdue. For a Waiting for todo the date is when to follow up: it shows on Daily from that day on.

## Now

`#now` marks what you are doing right now, on top of `#next`. It drives [focus mode](daily.md).

## Context tags

Any other tag is a context tag: a person (`#lena`), a topic (`#budget`) or a recurring meeting (`#team-sync`). Tap a context tag on Daily to see only matching items. Note templates can react to context tags - see [Tag Rules](note-templates.md).

## Nested tags

A tag can have parts separated by `/`, for example `#coaching/sabina`. It is one tag: one chip in Quick Add, one tap target on Daily. Obsidian reads the same syntax as a nested tag.

- A Tag Rule on `coaching` also applies to `#coaching/sabina`, `#coaching/tom` and so on. The part after the `/` can choose the shared file, see [Tag Rules](note-templates.md).
- On Daily, tapping `#coaching/sabina` shows only items with exactly that tag; tapping `#coaching` does not include the nested ones.

## Project and area abbreviations

A tag that matches a project's or area's abbreviation (for example `#GR`) is shown in capitals. It lets you file an item directly into that project from Quick Add, and as a Daily filter it shows all of that project's items. Abbreviations are not case-sensitive.

## Tags the app sets itself

- `#prepped` and `#reviewed`: meeting preparation and review, see [Meetings](meetings.md)
- `#monthly`: the meeting is a monthly highlight

These words, the flow words and `now` can't be used as abbreviations.
