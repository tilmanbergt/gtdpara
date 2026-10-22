# Meetings

A meeting has a date, an optional time or length, and a title that can carry tags. Meetings live in the file of their project or area, or in the Inbox.

## Where meetings show up

- **Daily**: today and tomorrow
- **Week**: the week grid; tap a day for the full list
- **Month**: only monthly highlights (the **M** mark); tap a day for all its meetings
- **Current**: all meetings of that project or area, upcoming and past

## The meeting row and its card

A meeting row shows the time, the title (tap a tag in it as anywhere else), where the meeting lives, a small prep/review mark (see below), the note icon and - only when a file is linked - the clip, which opens that file.

Tap the title, or the small mark, to select the meeting: the row gets a black bar and the meeting's **card** takes Quick Add's place, in the same box. Tap **Edit** on the card - or the row a second time - to change its title, date or time; **Save** brings you back to the card. **✕** closes the card; Quick Add comes back with whatever you had started to type. This works wherever a meeting list has Quick Add: Daily, the day panel of Week and Month, a project's or area's Meetings, the Inbox, the Review's Inbox step and the Ahead list of a thread or loop overview.

The card shows:

- First row: **Meeting** and whether it is ahead, today, over or cancelled; the meeting's thread (for example `#sparring/mieke ›`), which opens the thread overview; ✕ and **Edit**.
- Second row: the title with its tags, and when.
- Third row: **P** before the meeting or **R** after it, when the meeting's Note setup tracks that (see below) - tap to tick, filled means done, tap again to undo; **M** for a monthly highlight; the note icon; once the meeting is over, the **Reflect** icon (a loop turning back with a question mark; filled once the reflection page exists, see below); the linked file's name (tap it to open it, ✕ removes the link), or **+** and the clip to link a file where a Files pane is there to pick from (a project's or area's page, the Inbox).
- Fourth row: where the meeting lives (tap the name to open it; where a Files pane is there, the arrow next to it moves the meeting to another project or area), **New from this** (two pages: a new meeting with the same title, date and time, for example the next session of a series) and **Cancel meeting** (a calendar with a cross; it asks first, and the meeting stays in the file, marked as cancelled).

2-line rows show a monthly highlight as a small M.

## Meeting notes

Tap the note icon on a meeting to create its note; the status line first says which file or page will be created (see [Note setups](note-setups.md)). gtdpara fills it according to the Meeting page of the matching [Note setup](note-setups.md), or the Default's: for example title, date, time and the open todos that share a tag with the meeting. Until the end of the meeting (for a meeting without a time: the end of its day), this information is refreshed each time you open the note from gtdpara. After that the note is left as it is.

Instead of one note per meeting, a Note setup can put all its meetings and todos as pages into one notebook per project, for example one "Team sync" note with a page per meeting.

## Preparation and review

For meetings that need preparing or following up, switch on **Prepare before** and/or **Review after** in the meeting's Note setup (or in the Default, for meetings no setup covers). The meeting row then shows a small mark:

- **P** before the meeting, until you tick it (it becomes `#prepped`)
- **R** after the meeting, until you tick it (it becomes `#reviewed`)
- a check mark when the current phase is done

You tick it on the meeting's card: select the meeting, then tap **P** or **R**. When you edit a meeting, its title shows without `#prepped` and `#reviewed`, and **Save** keeps the tick as it is.

Past meetings that still need a review appear in the Review step **Meetings to close out** (last 7 days).

## Reflection page

After a meeting, you may want to reflect on it in your own handwriting: how did it go, what did I notice, what do I try next time. Every meeting that is over (and not cancelled) can have one **Reflection page** for that. It is not a todo and not a review: nothing counts it and nothing reminds you of it, and writing it never ticks `#reviewed`.

Tap the **Reflect** icon on the selected meeting's card. The first time, the status line asks, for example "Sparring: reflection page in Meetings/sparring mieke 2026.note, after the meeting's page" - tap **Add page**. When the meeting has no page yet, it says "…: pages for the meeting and its reflection in …" and **Add pages** creates both. After that the icon is filled and opens the page.

- **Where it goes**: in the meeting's note, after the meeting's page and every page you added to it by hand, before the next meeting's or todo's page. In a meeting's own note it is the last page.
- **What is on it**: the Reflection page of the meeting's Note setup, or the Default's - at first just the date and title as a heading. Add your guiding questions as texts of your own, see [Note setups](note-setups.md).
- **Finding it**: its keyword is `reflection` with the meeting's date and title (for example `reflection 2026-10-14 Sparring Mieke`), plus the meeting's tags. When you rename the meeting, the keyword follows the next time you open the page from gtdpara.
- **Part of the meeting**: on the reflection page, Engage and lasso capture treat it as the meeting's page - todos you capture there were agreed in that meeting, and Engage opens on **Agreed** (see [Engage](engage.md)).

You also reach it from the Review step **Meetings to close out**, from a past meeting in a thread overview, and from Engage on the meeting's page ("Reflect on this meeting ›").

## Cancelling and repeating

The trash icon in the edit form cancels a meeting; it stays in the file, marked as cancelled. gtdpara has no repeating meetings: for a series, use **New from this** to create the next one with the same title, and give the series its own tag (for example `#team-sync`). With a nested tag such as `#retro/alpha`, the series becomes a thread: its overview offers **+ Next retro**, which picks the next date for you, see [Threads](threads.md).

## From Google Calendar

With the experimental Google Calendar integration you can copy calendar events into gtdpara meetings. See [Google Calendar and Gmail](integrations.md).
