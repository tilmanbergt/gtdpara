/**
 * A meeting's Reflection page (docs/dev/history/technical-design-meeting-reflection.md
 * §2.3, R1-R8): one page in the meeting's note, after the meeting's page and
 * the pages added to it by hand, filled from the setup's Reflection page.
 *
 * Nothing is stored about it outside the note: whether it exists is read from
 * the note's keywords (domain/reflection.ts's `reflectionPageOf`). Creating it
 * asks once (plan kind `new-reflection`); a meeting without a page gets its
 * page first, in the same step and under the same question.
 *
 * Logs carry counts and pages only, never keywords or titles (client names).
 */
import {contextTagsOf} from '../domain/flowState';
import {tagsAsWords} from '../domain/markdown';
import {meetingDisplayTitle} from '../domain/meetingTracking';
import {NoteCreateConfirm, NoteCreationPlan} from '../domain/noteCreationPlan';
import {layoutFor, NoteSetup} from '../domain/noteSetups';
import {afterItemIndex, pageMarks} from '../domain/pageOrder';
import {dateTitleText, PageLayout, PieceRenderContext, renderPieceText} from '../domain/pageLayout';
import {reflectionKeyword, reflectionPageOf} from '../domain/reflection';
import {GtdParaSettings, resolvePaths} from '../domain/settings';
import {meetingPageKeyword, stripPageAnchor} from '../domain/sharedNotePages';
import {Meeting} from '../domain/types';
import {displayPath, openPath} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {MeetingNoteInboxInput} from './meetingNoteAggregate';
import {ensureMeetingNote, existingLinkedFile, OpenOrCreateNoteOptions, populatePage} from './meetingNoteContent';
import {backgroundOf, classifyNotePath} from './noteLinks';
import {syncPageKeywords} from './noteFindability';
import {setupForLink} from './noteTargets';
import {findKeywordPage, insertPageAt, readAllKeywords, renameKeywordAt} from './sharedNotePages';

export type ReflectionState = {kind: 'none'} | {kind: 'exists'; absolutePath: string; page: number};

/** Where the meeting's page is: its note, the page, and the note as the confirm names it. */
interface MeetingPage {
  absolutePath: string;
  page: number;
  /** The file relative to the item's folder, or its display path for a link outside it. */
  file: string;
  /** A notebook's or loop note's relative file (the link's file), null for an own note. */
  linkedFile: string | null;
}

/**
 * The meeting's page, or null when it has none yet: no note link, a missing
 * file, or a notebook without its page. A notebook page is found under the
 * stored keyword or, after a rename, the current one.
 */
async function locateMeetingPage(meeting: Meeting, itemPath: string): Promise<MeetingPage | null> {
  const link = await classifyNotePath(itemPath, meeting.notePath);
  if (link.kind === 'none' || !link.exists) return null;
  if (link.kind === 'own') {
    const file = link.isAbsoluteLink ? displayPath(link.absolutePath) : stripPageAnchor(meeting.notePath);
    return {absolutePath: link.absolutePath, page: link.page ?? 0, file, linkedFile: null};
  }
  const current = meetingPageKeyword(meeting);
  const page =
    (await findKeywordPage(link.absolutePath, link.anchor.keyword)) ??
    (current !== link.anchor.keyword ? await findKeywordPage(link.absolutePath, current) : null);
  if (page === null) return null;
  return {absolutePath: link.absolutePath, page, file: link.anchor.filePath, linkedFile: link.anchor.filePath};
}

/** The reflection after `at`'s page, if there is one. */
async function reflectionAfter(at: MeetingPage): Promise<{page: number; keyword: string} | null> {
  const {keywords, totalPages} = await readAllKeywords(at.absolutePath);
  return reflectionPageOf(keywords, pageMarks(keywords, totalPages), at.page);
}

/** Reads only. 'none' when the meeting has no page yet, or no reflection after it. */
export async function findReflectionPage(meeting: Meeting, itemPath: string): Promise<ReflectionState> {
  const at = await locateMeetingPage(meeting, itemPath);
  if (!at) return {kind: 'none'};
  const found = await reflectionAfter(at);
  return found ? {kind: 'exists', absolutePath: at.absolutePath, page: found.page} : {kind: 'none'};
}

/** The Note setup whose note this is (null = the Default) - its Reflection page is the layout. */
function setupOf(meeting: Meeting, itemPath: string, settings: GtdParaSettings, linkedFile: string | null, forceOwn: boolean): NoteSetup | null {
  return setupForLink({itemPath, tags: meeting.tags, pageKind: 'meeting', settings, fileDate: meeting.date, forceOwn, linkedFile});
}

/** First-time note plans: with them the meeting's page is new, and the confirm says both pages are added. */
const NEW_NOTE_KINDS: ReadonlyArray<NoteCreationPlan['kind']> = ['new-own-file', 'new-shared-file', 'new-page'];

/**
 * Opens the reflection, creating it after one confirmation - with the
 * meeting's page first when it has none. Returns the possibly-updated meeting
 * (a new `notePath` when its page was created); the caller persists it when
 * `changed`. `cancelled` when the user tapped ✕: nothing was written.
 */
export async function openOrCreateReflectionPage(
  meeting: Meeting,
  itemPath: string,
  settings: GtdParaSettings,
  inbox: MeetingNoteInboxInput | null,
  options: OpenOrCreateNoteOptions = {},
): Promise<{meeting: Meeting; changed: boolean; cancelled: boolean}> {
  const forceOwn = options.forceOwnTarget ?? false;
  const keyword = reflectionKeyword(meeting);
  let at = await locateMeetingPage(meeting, itemPath);

  if (at) {
    const found = await reflectionAfter(at);
    if (found) {
      // Lazy rename, like a meeting page's keyword (shared-note design §6).
      if (found.keyword !== keyword) await renameKeywordAt(at.absolutePath, found.page, found.keyword, keyword);
      log('reflectionPage: open', `page=${found.page}`);
      await openPath(at.absolutePath, found.page);
      return {meeting, changed: false, cancelled: false};
    }
  }

  let updated = meeting;
  let changed = false;
  if (!at) {
    // The meeting's page first, under one question for both pages (R3, R6).
    const confirm = options.confirmCreate;
    const confirmBoth: NoteCreateConfirm | undefined = confirm
      ? plan => confirm(NEW_NOTE_KINDS.includes(plan.kind) ? {...plan, kind: 'new-reflection', withMeetingPage: true} : plan)
      : undefined;
    const ensured = await ensureMeetingNote(meeting, itemPath, settings, inbox, {...options, confirmCreate: confirmBoth});
    if (!ensured) return {meeting, changed: false, cancelled: true};
    updated = ensured.meeting;
    changed = ensured.anchor.changed;
    at = await locateMeetingPage(updated, itemPath);
    if (!at) throw new Error("The meeting's page was not found after creating it.");
  } else if (options.confirmCreate) {
    const setup = setupOf(meeting, itemPath, settings, at.linkedFile, forceOwn);
    const plan: NoteCreationPlan = {kind: 'new-reflection', file: at.file, absolutePath: at.absolutePath, setupName: setup?.name ?? null};
    if ((await options.confirmCreate(plan)) === null) {
      log('reflectionPage: cancelled');
      return {meeting, changed: false, cancelled: true};
    }
  }

  const meetingPage = at.page;
  const layout = layoutFor(setupOf(updated, itemPath, settings, at.linkedFile, forceOwn), 'review', settings.noteSetupDefaults);
  const page = await insertPageAt(
    at.absolutePath,
    file => afterItemIndex(pageMarks(file.keywords, file.totalPages), meetingPage),
    keyword,
    backgroundOf(layout),
  );
  log('reflectionPage: created', `meetingPage=${meetingPage}`, `page=${page}`, `withMeetingPage=${changed}`);
  await fillReflectionPage(updated, at.absolutePath, page, layout, settings);
  await openPath(at.absolutePath, page);
  return {meeting: updated, changed, cancelled: false};
}

/**
 * Writes the new reflection page's content: the meeting's tags as keywords (no
 * date keyword - the page belongs to the meeting, R5), then the pieces of the
 * Reflection page with their headings. Written once; nothing refreshes it.
 */
async function fillReflectionPage(meeting: Meeting, notePath: string, page: number, layout: PageLayout | null, settings: GtdParaSettings): Promise<void> {
  await syncPageKeywords(notePath, page, {date: null, tags: contextTagsOf(meeting.tags)});
  if (!layout) return;
  const linked = layout.pieces.some(p => p.type === 'link') ? await existingLinkedFile(resolvePaths(settings), meeting.linkedFile) : null;
  const title = tagsAsWords(meetingDisplayTitle(meeting));
  const ctx: PieceRenderContext = {
    title,
    date: meeting.date,
    time: meeting.time || undefined,
    dateTitle: dateTitleText(meeting.date, title),
    linkedFileName: linked?.fileName,
  };
  const pieceContent = layout.pieces.map(piece => renderPieceText(piece, ctx));
  await populatePage(notePath, layout, pieceContent, linked?.absolutePath ?? null, page, settings.noteHeadingStyle);
}
