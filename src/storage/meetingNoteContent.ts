/**
 * Builds and writes note-creation content (docs/dev/technical-design-meeting-
 * notes.md §5, docs/dev/history/technical-design-note-templates.md §4/§5): the
 * per-piece textboxes a page layout describes - always regenerated from
 * scratch, never merged/diffed against what was there before (the "always
 * regenerate, discard edits" decision).
 *
 * One population path (docs/dev/history/technical-design-linked-file-piece.md):
 * `populatePage` - one element per non-empty piece, positioned/
 * sized from that piece's own x/y/fontSize/maxWidth. A `link` piece becomes a
 * tappable link element to the item's `linkedFile` (only when that file still
 * exists); a layout without a `link` piece writes no link at all. A page
 * without a layout (a blank Default page) gets no content. Older notes still carrying a
 * legacy marker get it cleaned up on their next refresh
 * (isNoteTemplateManagedElement recognises both).
 *
 * The file name is narrower than its content (it is not meeting-only);
 * §4/§8 name `storage/noteTemplateContent.ts` as the intended name.
 *
 * `refreshMeetingNoteBlock` and `refreshTodoNoteBlock` take the layout of
 * the page's Note setup (storage/noteTargets.ts's `layoutForLink`,
 * docs/dev/history/technical-design-note-setups.md §4.4), render its pieces
 * and call `populatePage`. Both gate the
 * *re*-populate-on-open path on a freeze rule (domain/meetingTime.ts's
 * `isMeetingAutoUpdateFrozen` / domain/pageLayout.ts's
 * `isTodoAutoUpdateFrozen`) via an `isInitialPopulation` option that only
 * the note-*creation* call sites set - see either freeze function's own doc
 * comment for why creation always bypasses it.
 *
 * Built entirely on the file-level `supernote/fileSystem.ts` wrappers
 * (getElements/insertElements/deleteElements/createElement), never
 * PluginNoteAPI's insertText/insertTextLink convenience calls - see §5.1 for
 * why (no userData field on those; no file-path param, suggesting an
 * implicit "currently open in the NOTE app" requirement this feature's
 * trigger can't satisfy).
 *
 * Shared Note Pages (docs/dev/history/technical-design-shared-note-pages.md §5/§12):
 * `deleteStaleManagedElements`, `buildLinkElement` and `populatePage`
 * take a `page` parameter, defaulting to `0` where optional, so own-note
 * call sites need no page. `refreshMeetingNoteBlock`/`refreshTodoNoteBlock`
 * expose it as `options.page` (also defaulting to `0`).
 *
 * `openOrCreateMeetingNote`/`openOrCreateTodoNote` at the bottom of this file
 * are the single entry point every screen's note-icon tap calls (§6-§8).
 * They live here rather than in `storage/noteLinks.ts` to avoid an import
 * cycle: this file imports `resolveNotePath`/`createLinkedNote` from
 * noteLinks.ts, and the entry points need `refreshMeetingNoteBlock`/
 * `refreshTodoNoteBlock` from this file. `storage/sharedNotePages.ts` stays
 * the page engine and knows nothing about Task/Meeting or which note a
 * setup picks.
 *
 * Textbox metrics + per-piece max width
 * (docs/dev/history/technical-design-textbox-metrics.md): `populatePage`
 * builds each rect via `storage/notePieceMetrics.ts`'s `measureNotePieceRect`
 * (real on-device text measurement, content-fit width, capped at each
 * piece's own `maxWidthPx` - see domain/pageLayout.ts's `NotePiece`) and
 * the element itself via `supernote/noteElements.ts`'s `buildTextboxElement`.
 */
import {linkTypeForExtension, notePieceUserData} from '../domain/meetingNoteBlock';
import {itemDateKeyword, staleManagedNums} from '../domain/noteFindability';
import {isMeetingAutoUpdateFrozen, todayIso} from '../domain/meetingTime';
import {meetingDisplayTitle} from '../domain/meetingTracking';
import {tagsAsWords} from '../domain/markdown';
import {
  dateTitleText,
  isTodoAutoUpdateFrozen,
  PageLayout,
  pieceMaxWidthPx,
  PieceRenderContext,
  renderPieceText,
} from '../domain/pageLayout';
import {layoutFor} from '../domain/noteSetups';
import {NoteCreationPlan} from '../domain/noteCreationPlan';
import {joinNotePath, meetingPageKeyword, parseSharedNoteAnchor, todoPageKeyword} from '../domain/sharedNotePages';
import {DEFAULT_SETTINGS, GtdParaSettings, NoteHeadingStyle, ResolvedParaPaths, resolvePaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {
  createElement,
  deleteElements,
  Element,
  ELEMENT_TYPE_LINK,
  fileExists,
  getElements,
  insertElements,
  openPath,
} from '../supernote/fileSystem';
import {buildTextboxElement} from '../supernote/noteElements';
import {log} from '../utils/log';
import {contextTagsOf} from '../domain/flowState';
import {getCachedData, getCachedInbox} from './dataCache';
import {ThreadInboxInput} from './threadAggregate';
import {linkedFileStatus, resolveLinkedFilePath} from './linkedFiles';
import {MeetingNoteInboxInput, relatedItemsFor} from './meetingNoteAggregate';
import {buildSinceLast} from './sinceLast';
import {
  MEETINGS_SUBFOLDER,
  meetingNoteBaseName,
  resolveNotePath,
  TODOS_SUBFOLDER,
  todoNoteBaseName,
} from './noteLinks';
import {applyPieceHeadings, syncPageKeywords} from './noteFindability';
import {measureNoteLinkRect, measureNotePieceRect} from './notePieceMetrics';
import {errorMessage} from '../utils/errorMessage';
import {ItemNoteAnchorResolution, resolveItemNote} from './itemNotePlan';
import {ensureLoopNoteFile, loopNoteOf} from './loopNotes';
import {layoutForLink} from './noteTargets';

/**
 * `linkedFile`'s bare file name (e.g. "Kickoff deck.pdf" from
 * ".../Resources/Kickoff deck.pdf") - what `showText`/`fullText` are built
 * from (§3.4). storage/linkedFiles.ts's own path-splitting logic
 * (`relativeLocation`) does the same lastIndexOf('/') split but isn't
 * exported (it's paired there with a `root` prefix-check this doesn't
 * need), so this is a small local re-derivation rather than a reused import.
 */
function fileNameOf(absolutePath: string): string {
  const lastSlash = absolutePath.lastIndexOf('/');
  return lastSlash === -1 ? absolutePath : absolutePath.slice(lastSlash + 1);
}

/**
 * The item's `linkedFile`, resolved to an absolute path + bare file name -
 * or `null` when the item has no linked file OR the file doesn't exist any
 * more (docs/dev/history/technical-design-linked-file-piece.md §1.4: the link is
 * skipped then). One folder listing (storage/linkedFiles.ts's
 * linkedFileStatus), only for items that actually carry a link.
 */
async function existingLinkedFile(
  paths: ResolvedParaPaths,
  linkedFile: string | undefined,
): Promise<{absolutePath: string; fileName: string} | null> {
  if (!linkedFile) return null;
  const absolutePath = resolveLinkedFilePath(paths, linkedFile);
  if ((await linkedFileStatus(paths, linkedFile)) !== 'ok') {
    log('note refresh: linked file missing, link piece skipped:', absolutePath);
    return null;
  }
  return {absolutePath, fileName: fileNameOf(absolutePath)};
}

/**
 * Builds the link element for a `link` piece (docs/dev/technical-design-linked-
 * file-piece.md §4/§5): positioned at the piece's own `x`/`y`, sized from the
 * real text via measureNoteLinkRect (content-fit width + icon allowance,
 * measured height + underline allowance, never past the piece's max width or
 * the page edge), marked with the piece's own per-index userData like every
 * other piece.
 *
 * `page` (docs/dev/history/technical-design-shared-note-pages.md) is the page
 * THIS link element lives on within `notePath` - unrelated to `destPage`
 * below, which is the page the link JUMPS TO inside the *linked* file
 * (always 0, that file's own first page, regardless of where this element
 * itself sits).
 */
async function buildLinkElement(params: {
  linkedFileAbsolutePath: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  maxWidthPx: number;
  userData: string;
  page: number;
}): Promise<Element> {
  const {linkedFileAbsolutePath, text, x, y, fontSize, maxWidthPx, userData, page} = params;
  const rect = await measureNoteLinkRect(text, x, fontSize, maxWidthPx);
  const linkElement = await createElement(ELEMENT_TYPE_LINK);
  linkElement.userData = userData;
  linkElement.pageNum = page;
  linkElement.layerNum = 0;
  linkElement.link = {
    category: 0,
    X: x,
    Y: y,
    width: rect.width,
    height: rect.height,
    page,
    style: 0,
    linkType: linkTypeForExtension(linkedFileAbsolutePath),
    destPath: linkedFileAbsolutePath,
    destPage: 0,
    fontSize,
    fullText: text,
    showText: text,
    italic: 0,
    controlTrailNums: [],
  };
  return linkElement;
}

/**
 * Step 1 of populatePage below: reads `page` and deletes every
 * element this feature ever wrote, plus titles that cover only those
 * (domain/noteFindability.ts's staleManagedNums), leaving everything else -
 * handwriting, the user's own textboxes and their titles - untouched. The
 * one-line log (ours vs. foreign counts) is deliberate: it is what shows on
 * `adb logcat` whether our `userData` markers actually survive the NOTE app
 * saving the page between two opens (if "ours" stayed 0 on a re-open, pieces
 * would pile up as duplicates instead of being replaced).
 */
async function deleteStaleManagedElements(notePath: string, page: number): Promise<void> {
  const existing = await getElements(page, notePath);
  const staleNums = staleManagedNums(existing);
  log('note refresh: page', page, 'has', existing.length, 'elements - ours (replaced):', staleNums.length, 'foreign (kept):', existing.length - staleNums.length);
  if (staleNums.length > 0) {
    await deleteElements(notePath, page, staleNums);
  }
}

/**
 * (Re)builds `notePath`'s `page` from `layout`'s pieces
 * (docs/dev/history/technical-design-note-templates.md §4). Steps: read every
 * existing element on `page`, delete any carrying ANY marker this feature
 * has ever used (isNoteTemplateManagedElement - not just the per-piece
 * markers, so an older note's legacy fixed block or auto-appended "Link:"
 * element gets cleaned up too), then build and insert the fresh set in one
 * `insertElements` call so a failure partway can't leave a half-written
 * note.
 *
 * `page` defaults to `0` (docs/dev/history/technical-design-shared-note-pages.md
 * §5) - an own note lives on page 0; a shared-target note passes its
 * resolved page explicitly.
 *
 * `pieceContent[i]` is `layout.pieces[i]` already rendered to text (the
 * caller - refreshMeetingNoteBlock below - builds this via
 * domain/pageLayout.ts's renderPieceText, since which fields feed a piece
 * is context-specific and this function shouldn't need to know that). A
 * piece whose rendered text is `''` (an unset `time`, a `related` piece
 * with nothing to show) gets no element at all - same "omit rather than
 * show empty" convention (a `link` piece is empty when the item has no
 * linked file or the file is missing).
 *
 * Of the settings only the heading style is needed (`headingStyle`) -
 * positioning is fully piece-driven, and the background (storage/
 * noteLinks.ts's backgroundOf) is set at note-*creation* time, not here.
 *
 * Last, the pieces with the Heading switch on get their title elements
 * (storage/noteFindability.ts's applyPieceHeadings,
 * docs/dev/history/technical-design-projects-findable-notes.md §2.6) - after
 * the content, and without failing the note when that part goes wrong.
 *
 * `linkedFileAbsolutePath` is only read by a `link` piece (
 * docs/dev/history/technical-design-linked-file-piece.md) - the caller passes it only when the file
 * exists, and sets the matching `linkedFileName` on the render context, so a
 * `link` piece's text is non-empty exactly when this is set. No link is
 * written for a layout without a `link` piece.
 */
export async function populatePage(
  notePath: string,
  layout: PageLayout,
  pieceContent: string[],
  linkedFileAbsolutePath: string | null = null,
  page = 0,
  headingStyle: NoteHeadingStyle = DEFAULT_SETTINGS.noteHeadingStyle,
): Promise<void> {
  await deleteStaleManagedElements(notePath, page);

  const elements: Element[] = [];
  const linkElements = new Set<Element>();

  for (let index = 0; index < layout.pieces.length; index++) {
    const piece = layout.pieces[index];
    const text = pieceContent[index] ?? '';
    if (!text) continue;

    if (piece.type === 'link') {
      if (!linkedFileAbsolutePath) continue;
      const linkElement = await buildLinkElement({
        linkedFileAbsolutePath,
        text,
        x: piece.x,
        y: piece.y,
        fontSize: piece.fontSize,
        maxWidthPx: pieceMaxWidthPx(piece),
        userData: notePieceUserData(index),
        page,
      });
      linkElements.add(linkElement);
      elements.push(linkElement);
      continue;
    }

    const rect = await measureNotePieceRect(text, piece.x, piece.fontSize, pieceMaxWidthPx(piece));

    const textboxElement = await buildTextboxElement({
      text,
      x: piece.x,
      y: piece.y,
      width: rect.width,
      height: rect.height,
      fontSize: piece.fontSize,
      userData: notePieceUserData(index),
      pageNum: page,
    });
    elements.push(textboxElement);
  }

  if (elements.length === 0) return;
  try {
    await insertElements(notePath, page, elements);
  } catch (e) {
    // Safety net: the host rejects the WHOLE insert when it doesn't accept a
    // link element (e.g. a link type that doesn't match the target file),
    // which would cost the note all of its content. Retry
    // once without link elements so the rest of the note still arrives; the
    // failure itself stays in the log. Nothing to retry when there was no link.
    const withoutLinks = elements.filter(el => !linkElements.has(el));
    if (withoutLinks.length === elements.length) throw e;
    log('note refresh: insert with link failed, retrying without link:', errorMessage(e));
    if (withoutLinks.length > 0) {
      await insertElements(notePath, page, withoutLinks);
    }
  }
  await applyPieceHeadings(notePath, page, layout, pieceContent, headingStyle);
}

/**
 * The per-screen-callable wrapper (§6) behind every note create/open
 * (docs/dev/history/technical-design-note-templates.md §5).
 *
 * Takes the Meeting page layout of the setup the note belongs to
 * (`linkedLayout`). When there is one, renders every piece via
 * domain/pageLayout.ts's renderPieceText (building a PieceRenderContext
 * from this Meeting + its related todos) and calls populatePage. Without
 * one (a blank Default page) nothing is written, same as Todos
 * (docs/dev/history/technical-design-linked-file-piece.md §4: the user's
 * setups decide the layout).
 *
 * `inbox` is an explicit optional 4th param, defaulting to `null` - non-
 * Inbox screens call this with 3 args; InboxScreen.tsx/
 * ReviewScreen.tsx pass their own already-loaded Inbox.txt tasks as the 4th
 * arg. No-ops (does nothing, doesn't throw) when `meeting.notePath` is
 * empty - defensive, since every real call site only calls this once a note
 * is linked, but every other storage function around this one takes the
 * same "a hand-edited/incomplete record doesn't throw" posture rather than
 * assuming a caller invariant always holds.
 *
 * `options.isInitialPopulation`: every `handleOpenNote`
 * call site leaves this `false` (the default) - the auto-update freeze rule
 * (`isMeetingAutoUpdateFrozen`) applies, and this no-ops once the meeting is
 * frozen, leaving whatever content is already on the page alone. Every
 * `handleCreateNote` call site passes `true` right after linking a fresh
 * note, so the note's initial content always gets written regardless of how
 * frozen the meeting already is at that moment.
 *
 * `options.page` (docs/dev/history/technical-design-shared-note-pages.md §5):
 * defaults to `0` (an own note). A shared-target Meeting's resolved page is
 * passed explicitly by the open-or-create entry point - this function itself has no notion of shared vs. own targets, it
 * only writes to whichever page it's told.
 */
export async function refreshMeetingNoteBlock(
  meeting: Meeting,
  itemPath: string,
  settings: GtdParaSettings,
  inbox: MeetingNoteInboxInput | null = null,
  options: {isInitialPopulation?: boolean; page?: number} = {},
): Promise<void> {
  if (!meeting.notePath) return;
  if (!options.isInitialPopulation && isMeetingAutoUpdateFrozen(meeting)) return;

  const page = options.page ?? 0;
  const notePath = await resolveNotePath(itemPath, meeting.notePath);
  const paths = resolvePaths(settings);

  // Keywords don't depend on a setup (§2.7 of the findable-notes design).
  await syncPageKeywords(notePath, page, {date: itemDateKeyword(meeting), tags: contextTagsOf(meeting.tags)});

  const layout = linkedLayout(itemPath, meeting.notePath, notePath, {tags: meeting.tags, pageKind: 'meeting', settings, fileDate: meeting.date});
  if (!layout) return;

  const items = getCachedData()?.items ?? [];
  const relatedTodos = relatedItemsFor(items, inbox, meeting.tags);
  const linked = layout.pieces.some(p => p.type === 'link') ? await existingLinkedFile(paths, meeting.linkedFile) : null;

  const ctx: PieceRenderContext = {
    title: tagsAsWords(meetingDisplayTitle(meeting)),
    date: meeting.date,
    dateTitle: dateTitleText(meeting.date, tagsAsWords(meetingDisplayTitle(meeting))),
    // '' means "no time given" (Meeting.time's own convention) - left
    // unset on ctx rather than passed through as '', so renderPieceText's
    // `ctx.time ?? ''` for a `time` piece and its "meeting only, only when
    // set" contract (domain/pageLayout.ts) both read the same way
    // whether the meeting has no time or the layout has no time piece.
    time: meeting.time || undefined,
    relatedItems: relatedTodos.map(t => ({text: t.task.text})),
    linkedFileName: linked?.fileName,
    sinceLast: layout.pieces.some(p => p.type === 'sinceLast') ? buildSinceLast(meeting, itemPath, items, sinceLastInbox()) : null,
  };
  const pieceContent = layout.pieces.map(piece => renderPieceText(piece, ctx));
  await populatePage(notePath, layout, pieceContent, linked?.absolutePath ?? null, page, settings.noteHeadingStyle);
}

/**
 * The layout of the page `storedNotePath` links to: the page kind's layout of
 * the setup whose note this is (storage/noteTargets.ts's `layoutForLink`).
 * `resolvedPath` is `resolveNotePath`'s reading of the link - a shared page
 * when it is the anchor's file, else the item's own note.
 */
function linkedLayout(
  itemPath: string,
  storedNotePath: string,
  resolvedPath: string,
  input: {tags: readonly string[]; pageKind: 'meeting' | 'todo'; settings: GtdParaSettings; fileDate: string},
): PageLayout | null {
  const anchor = parseSharedNoteAnchor(storedNotePath);
  const linkedFile = anchor && resolvedPath === joinNotePath(itemPath, anchor.filePath) ? anchor.filePath : null;
  return layoutForLink({...input, itemPath, forceOwn: false, linkedFile});
}

/** The shared Inbox as the thread aggregates take it (the "Since last time" piece resolves provenance against it too). */
function sinceLastInbox(): ThreadInboxInput | null {
  const inbox = getCachedInbox();
  const path = getCachedData()?.paths.inboxFolder;
  return inbox && path ? {path, tasks: inbox.tasks, meetings: inbox.meetings} : null;
}

/**
 * The Todo counterpart to `refreshMeetingNoteBlock` above
 * (docs/dev/history/technical-design-note-templates.md) - same shape, same
 * call contract (`handleCreateNote` passes `options.isInitialPopulation:
 * true`; `handleOpenNote` leaves it `false`), called from the matching
 * handlers in ProjectDataPanel.tsx's TodosSection, DailyView.tsx,
 * ReviewScreen.tsx and InboxScreen.tsx.
 *
 * No Todo page layout (a blank Default page) means `populatePage` is never
 * called at all: the note stays blank - the same as for Meetings.
 *
 * `ctx.title` is `tagsAsWords(task.text)`, as for a Meeting: context tags
 * stay as words without `#`, gtdpara's own (`#next`, `#wf/…`) go (see
 * domain/markdown.ts's `tagsAsWords`). `ctx.relatedItems`
 * reuses the same `relatedItemsFor` aggregate the Meeting path uses, tagged
 * with this task's own `tags` and excluding this task's own `notePath` so
 * it never lists itself (see storage/meetingNoteAggregate.ts's doc
 * comment on `excludeNotePath`). No `date`/`time` fields are set on `ctx` -
 * those piece types are meeting-only (domain/pageLayout.ts's
 * `PIECE_PAGES`), so a Todo page's Add list never offers them in the first
 * place.
 *
 * `options.page` - same meaning and default as
 * `refreshMeetingNoteBlock`'s own (see that function's doc comment).
 */
export async function refreshTodoNoteBlock(
  task: Task,
  itemPath: string,
  settings: GtdParaSettings,
  inbox: MeetingNoteInboxInput | null = null,
  options: {isInitialPopulation?: boolean; page?: number} = {},
): Promise<void> {
  if (!task.notePath) return;
  if (!options.isInitialPopulation && isTodoAutoUpdateFrozen(task)) return;

  const page = options.page ?? 0;
  const notePath = await resolveNotePath(itemPath, task.notePath);
  const paths = resolvePaths(settings);

  await syncPageKeywords(notePath, page, {date: itemDateKeyword(task), tags: contextTagsOf(task.tags)});

  const layout = linkedLayout(itemPath, task.notePath, notePath, {tags: task.tags, pageKind: 'todo', settings, fileDate: todayIso()});
  if (!layout) return;

  const items = getCachedData()?.items ?? [];
  const relatedTodos = relatedItemsFor(items, inbox, task.tags, task.notePath);
  const linked = layout.pieces.some(p => p.type === 'link') ? await existingLinkedFile(paths, task.linkedFile) : null;

  const ctx: PieceRenderContext = {
    title: tagsAsWords(task.text),
    relatedItems: relatedTodos.map(t => ({text: t.task.text})),
    linkedFileName: linked?.fileName,
  };
  const pieceContent = layout.pieces.map(piece => renderPieceText(piece, ctx));
  await populatePage(notePath, layout, pieceContent, linked?.absolutePath ?? null, page, settings.noteHeadingStyle);
}

/**
 * Fills page 1 of a loop note from its Loop setup's First page
 * (docs/dev/history/technical-design-loops.md §4.4): the title is the loop
 * as words (`workshop teamoffsite`), the date-and-title piece puts the main
 * date in front when there is one, and a `link` piece links the loop's
 * linked file when it exists. Same population path as every other note.
 */
export async function populateLoopNotePage(
  notePath: string,
  layout: PageLayout | null,
  loop: {kind: string; name: string},
  mainDate: string | null,
  linkedFile: string | null,
  settings: GtdParaSettings,
): Promise<void> {
  if (!layout) return;
  const linked = layout.pieces.some(p => p.type === 'link') ? await existingLinkedFile(resolvePaths(settings), linkedFile ?? undefined) : null;
  const title = `${loop.kind} ${loop.name.replace(/\//g, ' ')}`;
  const ctx: PieceRenderContext = {title, dateTitle: dateTitleText(mainDate ?? '', title), linkedFileName: linked?.fileName};
  const pieceContent = layout.pieces.map(piece => renderPieceText(piece, ctx));
  await populatePage(notePath, layout, pieceContent, linked?.absolutePath ?? null, 0, settings.noteHeadingStyle);
}

// ---- Open-or-create entry point (docs/dev/history/technical-design-shared-note-pages.md §6-§8;
// plan-then-confirm and file-name placeholders: docs/dev/history/technical-design-split-by-tag.md §3.3-§3.5) ----

/** Fills the first page of a loop note `anchor`'s plan just created (storage/loopNotes.ts). */
async function fillLoopPage(anchor: ItemNoteAnchorResolution, settings: GtdParaSettings): Promise<void> {
  const target = anchor.loopPage;
  if (!target) return;
  const layout = layoutFor(target.setup, 'first', settings.noteSetupDefaults);
  await populateLoopNotePage(anchor.absolutePath, layout, target.loop, target.line.mainDate, target.line.linkedFile, settings);
}

/**
 * The loop note's note-icon tap (a loop row, the overview's Note ›): opens
 * the loop's note at its first page, or - after `confirmCreate` - creates it
 * with that page filled from the Loop setup's First page. False when the user cancelled.
 */
export async function openOrCreateLoopNote(
  ownerPath: string,
  tag: string,
  settings: GtdParaSettings,
  confirmCreate?: (plan: NoteCreationPlan) => Promise<boolean>,
): Promise<boolean> {
  const note = loopNoteOf(ownerPath, tag);
  if (!(await fileExists(note.absolutePath))) {
    const plan: NoteCreationPlan = {kind: 'new-shared-file', file: `${note.fileName}.note`, absolutePath: note.absolutePath, setupName: note.setup?.name ?? null};
    if (confirmCreate && !(await confirmCreate(plan))) return false;
    await ensureLoopNoteFile(ownerPath, note, settings.noteSetupDefaults);
    const layout = layoutFor(note.setup, 'first', settings.noteSetupDefaults);
    await populateLoopNotePage(note.absolutePath, layout, note.loop, note.line.mainDate, note.line.linkedFile, settings);
  }
  await openPath(note.absolutePath, 0);
  return true;
}

/** §8's guard, meeting side - does some OTHER meeting cached under `itemPath` still derive `keyword`. Reads the live cache fresh on every call (cheap - one project/area's own meeting list, already in memory), never the `meeting` object `openOrCreateMeetingNote` was called with, so a stale render-time reference can't hide a real collision. */
function meetingKeywordStillUsed(itemPath: string, keyword: string): boolean {
  const cachedMeetings = getCachedData()?.items.find(i => i.path === itemPath)?.meetings ?? [];
  return cachedMeetings.some(m => meetingPageKeyword(m) === keyword);
}

/** Todo counterpart of meetingKeywordStillUsed above. */
function todoKeywordStillUsed(itemPath: string, keyword: string): boolean {
  const cachedTasks = getCachedData()?.items.find(i => i.path === itemPath)?.tasks ?? [];
  return cachedTasks.some(t => todoPageKeyword(t) === keyword);
}

/** What `openOrCreateMeetingNote`/`openOrCreateTodoNote` return alongside their `changed` flag - the resolved page this call already opened, kept here so a caller that wants to log/display the resolved location can, without re-deriving it. `null` when the user cancelled the confirm. */
export interface OpenOrCreateNoteOutcome {
  absolutePath: string;
  page: number;
}

/** Options shared by both open-or-create entry points. */
export interface OpenOrCreateNoteOptions {
  /** Inbox call sites pass `true`: Inbox items always get their own note (see `ItemNoteParams.forceOwnTarget`). */
  forceOwnTarget?: boolean;
  /**
   * Asked before anything is created, recreated or linked (split-by-tag
   * design §3.5) - every screen passes `ui/useNoteCreateConfirm.ts`'s
   * callback. Resolving `false` cancels: nothing is written, nothing opened.
   * Without it the plan is carried out directly (non-UI callers).
   */
  confirmCreate?: (plan: NoteCreationPlan) => Promise<boolean>;
}

/**
 * Open-or-create entry point for a Meeting's linked note - the one function
 * DailyView/ProjectDataPanel/WeekView-Month (usePlanningScreen)/InboxScreen/
 * ReviewScreen's note-icon tap handlers call. Plans what the tap will do
 * (storage/itemNotePlan.ts - open, create, add page, link, recreate), asks
 * `options.confirmCreate` for everything except a plain open, then carries
 * it out, refreshes the page's content and opens it.
 *
 * Does NOT persist a changed `notePath` itself, and does NOT mutate
 * `meeting` - storage/ functions don't reach into screen state, and the
 * screens persist a Meeting through different mechanisms. Instead this
 * returns the possibly-updated `Meeting` (a new object only when something
 * changed) alongside `changed`; the caller persists when `changed`.
 * `cancelled` is true (and `changed` false) when the user tapped ✕.
 */
export async function openOrCreateMeetingNote(
  meeting: Meeting,
  itemPath: string,
  settings: GtdParaSettings,
  inbox: MeetingNoteInboxInput | null,
  options: OpenOrCreateNoteOptions = {},
): Promise<{meeting: Meeting; changed: boolean; cancelled: boolean; outcome: OpenOrCreateNoteOutcome | null}> {
  const currentKeyword = meetingPageKeyword(meeting);
  const anchor = await resolveItemNote(
    {
      notePath: meeting.notePath,
      itemPath,
      subfolder: MEETINGS_SUBFOLDER,
      settings,
      tags: meeting.tags,
      pageKind: 'meeting',
      currentKeyword,
      baseName: meetingNoteBaseName(meeting),
      isDated: true,
      fileDate: meeting.date,
      forceOwnTarget: options.forceOwnTarget ?? false,
      collisionCheck: oldKeyword => meetingKeywordStillUsed(itemPath, oldKeyword),
    },
    options.confirmCreate,
    'openOrCreateMeetingNote',
  );
  if (!anchor) return {meeting, changed: false, cancelled: true, outcome: null};

  const updatedMeeting = anchor.changed ? {...meeting, notePath: anchor.notePath} : meeting;
  await fillLoopPage(anchor, settings);
  if (!anchor.foreign) {
    await refreshMeetingNoteBlock(updatedMeeting, itemPath, settings, inbox, {
      isInitialPopulation: anchor.isInitialPopulation,
      page: anchor.page,
    });
  }
  await openPath(anchor.absolutePath, anchor.page);

  return {
    meeting: updatedMeeting,
    changed: anchor.changed,
    cancelled: false,
    outcome: {absolutePath: anchor.absolutePath, page: anchor.page},
  };
}

/**
 * The Todo counterpart to `openOrCreateMeetingNote` above - same shape, same
 * contract. A todo has no date, so the `{year}`/`{quarter}`/`{month}`
 * placeholders use the day the note is created.
 */
export async function openOrCreateTodoNote(
  task: Task,
  itemPath: string,
  settings: GtdParaSettings,
  inbox: MeetingNoteInboxInput | null,
  options: OpenOrCreateNoteOptions = {},
): Promise<{task: Task; changed: boolean; cancelled: boolean; outcome: OpenOrCreateNoteOutcome | null}> {
  const currentKeyword = todoPageKeyword(task);
  const anchor = await resolveItemNote(
    {
      notePath: task.notePath,
      itemPath,
      subfolder: TODOS_SUBFOLDER,
      settings,
      tags: task.tags,
      pageKind: 'todo',
      currentKeyword,
      baseName: todoNoteBaseName(task),
      isDated: false,
      fileDate: todayIso(),
      forceOwnTarget: options.forceOwnTarget ?? false,
      collisionCheck: oldKeyword => todoKeywordStillUsed(itemPath, oldKeyword),
    },
    options.confirmCreate,
    'openOrCreateTodoNote',
  );
  if (!anchor) return {task, changed: false, cancelled: true, outcome: null};

  const updatedTask = anchor.changed ? {...task, notePath: anchor.notePath} : task;
  await fillLoopPage(anchor, settings);
  if (!anchor.foreign) {
    await refreshTodoNoteBlock(updatedTask, itemPath, settings, inbox, {
      isInitialPopulation: anchor.isInitialPopulation,
      page: anchor.page,
    });
  }
  await openPath(anchor.absolutePath, anchor.page);

  return {
    task: updatedTask,
    changed: anchor.changed,
    cancelled: false,
    outcome: {absolutePath: anchor.absolutePath, page: anchor.page},
  };
}
