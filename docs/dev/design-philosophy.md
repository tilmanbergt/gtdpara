# gtdpara — Design Philosophy: Word, Wholeness, and Intention

> **About this document.** The values behind gtdpara and how they show up in its design - the
> lens for deciding what gets built and how it should feel. It describes the philosophy as it
> holds now, in present tense. It is not a plan, a backlog or a history: open questions and ideas
> go to the internal backlog, and the reasons for individual features live in their technical
> designs. Update it when a principle changes or a feature newly expresses one; keep it short
> enough to read in ten minutes. What is built and how is in `design-overview.md`; the user-facing
> version of these ideas is `docs/user/philosophy.md`.

## 1. The core commitment

Underneath organizing - PARA, GTD, next actions, review - the commitment this app holds is
integrity and authenticity, in the sense of Werner Erhard's and Michael Jensen's model rather
than "keep the data consistent". Integrity is being whole and complete, and it lives almost
entirely in one place: whether your word is clean. You keep it, or, when you don't, you
acknowledge that and either recommit or consciously renegotiate it. What breaks integrity isn't
missing something; it's the silent slip - the thing that quietly stopped being true without you
owning that it did.

Read this way, GTD's real offer isn't organization, it's clarity of word. A task list without a
real "next" is a list of things you might get to; nothing there is your word about anything.
"What's next" is the discipline of making your word clear enough that it can be kept, or
knowingly renegotiated, rather than just accumulated.

The distinction worth watching for is what a piece of work is done *from*: wholeness and real
choice, or obligation, shame, blame, justification. Joy is one legible signal of the first. None
of this is about never missing something - it's about being present enough to notice when you
have, and willing to own it.

**Two further factors, held as inquiry rather than structure.** The model names two more
elements: being cause in the matter (authoring your relationship to a piece of work, even when it
arrived from outside) and a larger game or purpose. gtdpara's structure reaches up to GTD's
Horizon 2 (Areas); goals, vision and purpose are not data in the app. These two factors are
questions to ask - in a review, in a note - not something the app tracks.

## 2. Editing vs. redeciding

Not every change to a task is the same kind of act:

- **Editing** - fixing a typo, rewording, correcting a mistyped date. This stays frictionless; no
  ceremony belongs here.
- **Redeciding** - changing what you are on the hook for: next, focus, due date, status. These
  renegotiate a commitment, and the interaction lets them register as that.

Status, focus and flow-state are separate controls from text editing for this reason. Marking a
task `#now` is a deliberately light example: a double-tap on the existing Next badge, not a form
or a new screen, but still a distinct gesture from typing, so it reads as "this is what I'm on
the hook for right now".

## 3. Every entry is a conscious choice

Nothing in gtdpara creates commitments on its own. There are no recurring meetings and no
repeating todos: every meeting and every todo exists because someone entered it, deliberately,
for that one occasion. A series that just continues by itself is exactly the kind of word that
nobody is actually keeping - it stays on the list whether or not it is still meant. Making each
entry by hand keeps every item on the list an active choice and a real commitment. Helpers that
make entering easy ("New from this", copying a calendar event, date nudges) are welcome; helpers
that enter things for you are not.

## 4. Spaciousness

The biggest way the app supports presence isn't a feature - it's restraint: "there is space, here
is the focus, calmly but focused," rather than a page crammed with the implicit message that
everything on it needs doing soon. Density itself is a message; a screen that fits more says,
wordlessly, that more is expected of you right now.

So the app shows less rather than shrinking more to fit: Daily shows only what matters today,
focus mode hides everything that isn't `#now`, and lists are paged, not scrolled. There is a real
tension with compact layouts that free space to hold more; when the two collide, hiding wins over
re-compacting.

## 5. Breathing as rhythm: `#now` and focus mode

Within the working day, the rhythm is picking and working through a small set:

- A task can carry `#now`, layered on top of (never instead of) `#next` - one temporary extra
  flag saying "this is what I'm on the hook for right now".
- **Focus mode is a mode of Daily, not a tab.** On, it shows only `#now` tasks (with what is
  linked to them), meetings starting within the next four hours, and the quick-add widget. Off,
  Daily is unchanged.
- Picking is the in-breath; working the set until every task is done is the out-breath. With
  nothing marked, focus mode offers the next tasks of today's focused Projects/Areas to choose
  from, and an explicit "Start focus session" commits the set. Checked-off tasks stay visible;
  the set clears only when the last one is done, with a short celebratory line and an offer to
  pick the next set.
- No clock, no timer, no suggested pause. Nothing auto-advances into the next set; the moment
  after finishing waits, unhurried, until you act or leave. **Never auto-suggest or auto-select
  the next set** - the instant the app does that, the gap stops being protected.
- **Sessions are held lightly.** There is no stored session, start time or membership list; the
  only remembered fact is whether focus mode is on. Reopening the plugin while it's on returns
  straight to it.

Rest needs no mechanism of its own. A "Rest" area tracked like other areas would trip Review's
stalled/neglected detection - backwards for something meant to be rested, not worked. The gap
after a finished set is simply unhurried and un-nudged, whether it lasts a minute or much longer.

Meetings play two roles around this. In focus mode they are context for planning time - shown
automatically within the look-ahead window, computed when the screen is entered, not kept ticking.
Around the meeting itself, preparing and reviewing are their own small commitments, made visible
by the optional prep/review marks rather than by extra tasks.

## 6. Artifact wholeness

The "whole and complete" quality extends to what the app creates for you. A note created for a
todo, meeting, project or area doesn't open as a blank orphan page: Tag Rules give it a background
and pre-filled context (title, date, related items, a link back to where it came from), so the
note is already whole rather than a fragment whose context you'd have to reconstruct later.
Closing out a project carries the same idea to its end: one consolidated, readable record.

## 7. The files are the interface

Everything gtdpara knows lives in plain files in your own folders, and those files are a real
interface, not an internal format. They are read and edited elsewhere - on the computer, or in
Obsidian through a folder sync - and that is a normal case, not an exception:

- Lines gtdpara doesn't understand are kept exactly as they are.
- The files are the truth; gtdpara's cache only remembers what it read and checks the files again
  when it is reopened.
- File names gtdpara creates avoid characters that break links elsewhere (`#`, `[`, `]`, `^`,
  and the ones file systems forbid).
- The folder layout stays readable without gtdpara: one folder per project or area, its data file
  and its notes next to it.

When gtdpara changes a file on its own - moving a note with its todo, renaming an old file name -
it says so first.

## 8. Embodied interaction

Quality of engagement matters as much as absence of clutter. The pen is the Supernote's own
gesture: handwriting lives in real notes, and the lasso turns handwriting into a todo or meeting.
Elsewhere the app uses taps, and tapping a checkbox and striking through a line are functionally
the same but experientially nothing alike - a reason to prefer real notes and pen-based flows
wherever the platform allows them.

## 9. One page, one intention

The design-audit discipline: for every screen, and every distinct element on it, name the single
intention it serves. If a second, unrelated intention has crept onto the same surface, that's the
signal a split is worth considering. Get the intention sharp first; whether that leads to
splitting or adding anything is a separate decision.

Read through this lens: Projects/Areas survey standing commitments; Inbox and capture notice
without deciding; each Review step has one job; focus mode is purely doing. Daily (focus off) and
a project's Current tab hold more than one intention - choosing, doing and noticing side by side -
which is known and accepted for now.
