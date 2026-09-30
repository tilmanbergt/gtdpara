/**
 * Builds and writes note-creation content (docs/dev/technical-design-meeting-
 * notes.md §5, generalized by docs/dev/technical-design-note-templates.md §4/§5
 * Phase 2, 2026-09-18): the per-piece textboxes a `NoteCreationDefinition`
 * describes, plus (when the item has a `linkedFile`) a real tappable
 * "Link:" element - always regenerated from scratch, never merged/diffed
 * against whatever was there before (the "always regenerate, discard
 * edits" decision, unchanged from Phase 1 of the meeting-notes feature).
 *
 * One population path (2026-09-25, docs/dev/technical-design-linked-file-piece.md):
 * `populateNoteFromDefinition` - one element per non-empty piece, positioned/
 * sized from that piece's own x/y/fontSize/maxWidth. A `link` piece becomes a
 * tappable link element to the item's `linkedFile` (only when that file still
 * exists); a rule without a `link` piece writes no link at all. The old fixed
 * Meeting fallback block (`populateMeetingNoteBlockFallback`) and the
 * always-auto-appended "Link:" element were removed in the same pass - a
 * Meeting that matches no rule now gets no content, exactly like a Todo.
 * Old notes still carrying either legacy marker get them cleaned up on their
 * next refresh (isNoteTemplateManagedElement still recognises both).
 *
 * FILE NAME NOTE (2026-09-18, Phase 2): §4/§8 call for renaming this file to
 * `storage/noteTemplateContent.ts` now that it's no longer meeting-only.
 * Not done in this pass - same reason as domain/meetingNoteBlock.ts's own
 * doc comment: this session has no file-delete capability on the linked
 * device, so a rename would leave an orphaned duplicate rather than a clean
 * move. Trivial manual follow-up, alongside that file's own rename and the
 * one import line in each of DailyView.tsx/InboxScreen.tsx/ReviewScreen.tsx/
 * ProjectDataPanel.tsx that names this file's current path. Still true after
 * Phase 3 below adds a Todo counterpart to this same file, if anything more
 * so.
 *
 * Phase 3 (2026-09-18, same day - Todo notes): `refreshTodoNoteBlock` below
 * mirrors `refreshMeetingNoteBlock` almost exactly - resolve a `'todo'`
 * definition, render its pieces, call `populateNoteFromDefinition` - with no
 * fallback-block equivalent (Todos have no pre-existing fixed shape to
 * preserve the way Meetings do; `resolveNoteTemplate` returning `null` just
 * means no pieces get written, same "blank note" behavior every context had
 * before this feature existed). Both refresh functions now also gate the
 * *re*-populate-on-open path on a freeze rule (domain/meetingTime.ts's
 * `isMeetingAutoUpdateFrozen` / domain/noteTemplate.ts's
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
 * Shared Note Pages, Slice 2 of 4 (2026-09-22, docs/dev/technical-design-
 * shared-note-pages.md §5/§12): every function below that used to hardcode
 * page 0 (`deleteStaleManagedElements`, `buildLinkElement`,
 * `populateNoteFromDefinition`) now
 * takes a real `page` parameter, defaulting to `0` everywhere it's optional -
 * so every existing own-note call site (which never had a page to think
 * about) is byte-for-byte unaffected. `refreshMeetingNoteBlock`/
 * `refreshTodoNoteBlock` expose it as `options.page` (also defaulting to
 * `0`), the same options-object extension pattern `isInitialPopulation`
 * already established, rather than a new positional parameter every call
 * site would need touching for.
 *
 * Shared Note Pages, Slice 3 of 4 (2026-09-22, §6-§8): `openOrCreateMeetingNote`/
 * `openOrCreateTodoNote` at the bottom of this file are the "one shared
 * branch, reused by all 5 screens" entry point §6 describes - each screen's
 * separate create-note/open-note handler pair collapses into one call to
 * these. Placed HERE rather than in `storage/noteLinks.ts` (the design doc's
 * original suggestion) to avoid a real import cycle: this file already
 * imports `resolveNotePath` from noteLinks.ts one-way, and these new
 * functions need `refreshMeetingNoteBlock`/`refreshTodoNoteBlock`, both of
 * which live in THIS file - putting the entry point in noteLinks.ts would
 * need it to import back from here, a cycle. This file already needs
 * `createLinkedNote` from noteLinks.ts too (own-target branch), which is a
 * new import but the same direction as the existing one, so no cycle either
 * way. `storage/sharedNotePages.ts` stays exactly what its module doc
 * comment says - the page engine - and knows nothing about Task/Meeting or
 * which target a definition resolves to; all of that lives here.
 *
 * Textbox metrics + per-piece max width (2026-09-23,
 * docs/dev/technical-design-textbox-metrics.md, combined with that doc's Phase 3
 * per Tilman: "can be one thing"): `populateNoteFromDefinition` no longer hand-spells
 * `createElement(ELEMENT_TYPE_TEXT)` + a `textBox` literal - it builds
 * its rect via `storage/notePieceMetrics.ts`'s `measureNotePieceRect`
 * (real on-device text measurement, content-fit width, capped at each
 * piece's own `maxWidthPx` - see domain/noteTemplate.ts's `NotePiece`) and
 * the element itself via `supernote/noteElements.ts`'s `buildTextboxElement`.
 */
import {isNoteTemplateManagedElement, linkTypeForExtension, notePieceUserData} from '../domain/meetingNoteBlock';
import {isMeetingAutoUpdateFrozen, todayIso} from '../domain/meetingTime';
import {meetingDisplayTitle} from '../domain/meetingTracking';
import {stripAllTags} from '../domain/markdown';
import {
  effectiveNoteTarget,
  isTodoAutoUpdateFrozen,
  NoteContext,
  NoteCreationDefinition,
  pieceMaxWidthPx,
  PieceRenderContext,
  renderPieceText,
  resolvedSharedFileFolder,
  resolvedSharedFileName,
  resolveNoteTemplate,
} from '../domain/noteTemplate';
import {
  buildSharedNoteAnchor,
  meetingPageKeyword,
  parseSharedNoteAnchor,
  todoPageKeyword,
} from '../domain/sharedNotePages';
import {GtdParaSettings, ResolvedParaPaths, resolvePaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {
  createElement,
  deleteElements,
  Element,
  ELEMENT_TYPE_LINK,
  getElements,
  insertElements,
  openPath,
} from '../supernote/fileSystem';
import {buildTextboxElement} from '../supernote/noteElements';
import {log} from '../utils/log';
import {getCachedData} from './dataCache';
import {linkedFileStatus, resolveLinkedFilePath} from './linkedFiles';
import {MeetingNoteInboxInput, relatedItemsFor} from './meetingNoteAggregate';
import {
  createLinkedNote,
  MEETINGS_SUBFOLDER,
  meetingNoteBaseName,
  resolveNoteBackgroundTemplate,
  resolveNotePath,
  sanitizeFileNameComponent,
  TODOS_SUBFOLDER,
  todoNoteBaseName,
} from './noteLinks';
import {measureNoteLinkRect, measureNotePieceRect} from './notePieceMetrics';
import {
  ensureSharedNoteFile,
  findKeywordPage,
  insertChronologicalPage,
  renameKeywordAt,
  writeRecreatedNotice,
} from './sharedNotePages';

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
 * or `null` when the item has no linked file OR the file no longer exists
 * (docs/dev/technical-design-linked-file-piece.md §1.4, Tilman 2026-09-25: "skip
 * the link in that case"). One folder listing (storage/linkedFiles.ts's
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
 * `page` (Slice 2 of docs/dev/technical-design-shared-note-pages.md) is the page
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
 * Step 1 of populateNoteFromDefinition below: reads `page` and deletes every
 * element this feature ever wrote (isNoteTemplateManagedElement), leaving
 * everything else - handwriting, the user's own textboxes - untouched. The
 * one-line log (ours vs. foreign counts) is deliberate: it is what shows on
 * `adb logcat` whether our `userData` markers actually survive the NOTE app
 * saving the page between two opens (if "ours" stayed 0 on a re-open, pieces
 * would pile up as duplicates instead of being replaced).
 */
async function deleteStaleManagedElements(notePath: string, page: number): Promise<void> {
  const existing = await getElements(page, notePath);
  const staleNums = existing.filter(el => isNoteTemplateManagedElement(el.userData)).map(el => el.numInPage);
  log('note refresh: page', page, 'has', existing.length, 'elements - ours (replaced):', staleNums.length, 'foreign (kept):', existing.length - staleNums.length);
  if (staleNums.length > 0) {
    await deleteElements(notePath, page, staleNums);
  }
}

/**
 * (Re)builds `notePath`'s `page` from `definition`'s pieces - the Phase 2
 * generalized path (docs/dev/technical-design-note-templates.md §4). Steps:
 * read every existing element on `page`, delete any carrying ANY marker
 * this whole feature has ever used (isNoteTemplateManagedElement - not just
 * this function's own per-piece markers, so a note written before 2026-09-25
 * still carrying the old fixed fallback block or the old auto-appended
 * "Link:" element gets those cleaned up too), then build and insert the fresh set in one
 * `insertElements` call so a failure partway can't leave a half-written
 * note.
 *
 * `page` defaults to `0` (Slice 2 of docs/dev/technical-design-shared-note-pages.md
 * §5) - every own-note call today implicitly meant page 0, so the default
 * keeps every existing call site's behavior identical without touching it;
 * a shared-target note passes its resolved page explicitly (Slice 3).
 *
 * `pieceContent[i]` is `definition.pieces[i]` already rendered to text (the
 * caller - refreshMeetingNoteBlock below - builds this via
 * domain/noteTemplate.ts's renderPieceText, since which fields feed a piece
 * is context-specific and this function shouldn't need to know that). A
 * piece whose rendered text is `''` (an unset `time`, a `related` piece
 * with nothing to show) gets no element at all - same "omit rather than
 * show empty" convention (a `link` piece is empty when the item has no
 * linked file or it no longer exists).
 *
 * Deviates from technical-design-note-templates.md §4's literal signature
 * (`populateNoteFromDefinition(notePath, definition, pieceContent,
 * settings)`) by dropping the `settings` param: every field GtdParaSettings
 * still carries after Phase 2's retirement of meetingNoteBlockTopX/Y/
 * MaxWidth turned out unused here - positioning is fully piece-driven, and
 * background selection (storage/noteLinks.ts's resolveNoteBackgroundTemplate)
 * happens at note-*creation* time, not here. Flagged rather than carrying a
 * dead parameter.
 *
 * `linkedFileAbsolutePath` is only read by a `link` piece (docs/technical-
 * design-linked-file-piece.md) - the caller passes it only when the file
 * exists, and sets the matching `linkedFileName` on the render context, so a
 * `link` piece's text is non-empty exactly when this is set. No link is
 * written for a definition without a `link` piece.
 */
export async function populateNoteFromDefinition(
  notePath: string,
  definition: NoteCreationDefinition,
  pieceContent: string[],
  linkedFileAbsolutePath: string | null = null,
  page = 0,
): Promise<void> {
  await deleteStaleManagedElements(notePath, page);

  const elements: Element[] = [];
  const linkElements = new Set<Element>();

  for (let index = 0; index < definition.pieces.length; index++) {
    const piece = definition.pieces[index];
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
    // Safety net (bugfix 2026-09-28): the host rejects the WHOLE insert when
    // it doesn't accept a link element (e.g. a link type that doesn't match
    // the target file), which used to cost the note all of its content. Retry
    // once without link elements so the rest of the note still arrives; the
    // failure itself stays in the log. Nothing to retry when there was no link.
    const withoutLinks = elements.filter(el => !linkElements.has(el));
    if (withoutLinks.length === elements.length) throw e;
    log('note refresh: insert with link failed, retrying without link:', e instanceof Error ? e.message : String(e));
    if (withoutLinks.length > 0) {
      await insertElements(notePath, page, withoutLinks);
    }
  }
}

/**
 * The per-screen-callable wrapper (§6) every `handleCreateNote`/
 * `handleOpenNote` call site calls - unchanged public signature from before
 * Phase 2 (docs/dev/technical-design-note-templates.md §5: "no behavior
 * change" at this call boundary), so none of DailyView.tsx/InboxScreen.tsx/
 * ReviewScreen.tsx/ProjectDataPanel.tsx needed touching for this phase.
 *
 * New Phase 2 behavior inside: resolves `resolveNoteTemplate('meeting',
 * meeting.tags, settings.noteCreationDefinitions)`. When it finds a
 * definition, renders every piece via domain/noteTemplate.ts's
 * renderPieceText (building a PieceRenderContext from this Meeting + its
 * related todos) and calls populateNoteFromDefinition. When it returns
 * `null` (no matching/enabled Meeting definition) nothing is written - the
 * old fixed fallback block was removed 2026-09-25 (docs/dev/technical-design-
 * linked-file-piece.md §4, Tilman: "everything should behave the same, user
 * decides how the default layout works"), same as Todos.
 *
 * `inbox` is an explicit optional 4th param, defaulting to `null` - non-
 * Inbox screens call this exactly as before (3 args); InboxScreen.tsx/
 * ReviewScreen.tsx pass their own already-loaded Inbox.txt tasks as the 4th
 * arg. No-ops (does nothing, doesn't throw) when `meeting.notePath` is
 * empty - defensive, since every real call site only calls this once a note
 * is linked, but every other storage function around this one takes the
 * same "a hand-edited/incomplete record doesn't throw" posture rather than
 * assuming a caller invariant always holds.
 *
 * `options.isInitialPopulation` (Phase 3, 2026-09-18): every `handleOpenNote`
 * call site leaves this `false` (the default) - the auto-update freeze rule
 * (`isMeetingAutoUpdateFrozen`) applies, and this no-ops once the meeting is
 * frozen, leaving whatever content is already on the page alone. Every
 * `handleCreateNote` call site passes `true` right after linking a fresh
 * note, so the note's initial content always gets written regardless of how
 * frozen the meeting already is at that moment.
 *
 * `options.page` (Slice 2 of docs/dev/technical-design-shared-note-pages.md §5):
 * defaults to `0`, so every existing call site (which never passes it) still
 * refreshes page 0, exactly as before. A shared-target Meeting's resolved
 * page is passed here explicitly once Slice 3's `openOrCreateItemNote`
 * exists - this function itself has no notion of shared vs. own targets, it
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

  const definition = resolveNoteTemplate('meeting', meeting.tags, settings.noteCreationDefinitions);
  if (!definition) return;

  const items = getCachedData()?.items ?? [];
  const relatedTodos = relatedItemsFor(items, inbox, meeting.tags);
  const linked = definition.pieces.some(p => p.type === 'link') ? await existingLinkedFile(paths, meeting.linkedFile) : null;

  const ctx: PieceRenderContext = {
    title: meetingDisplayTitle(meeting),
    date: meeting.date,
    // '' means "no time given" (Meeting.time's own convention) - left
    // unset on ctx rather than passed through as '', so renderPieceText's
    // `ctx.time ?? ''` for a `time` piece and its "meeting only, only when
    // set" contract (domain/noteTemplate.ts §4) both read the same way
    // whether the meeting has no time or the definition has no time piece.
    time: meeting.time || undefined,
    relatedItems: relatedTodos.map(t => ({text: t.task.text})),
    linkedFileName: linked?.fileName,
  };
  const pieceContent = definition.pieces.map(piece => renderPieceText(piece, ctx));
  await populateNoteFromDefinition(notePath, definition, pieceContent, linked?.absolutePath ?? null, page);
}

/**
 * The Todo counterpart to `refreshMeetingNoteBlock` above (Phase 3,
 * 2026-09-18, docs/dev/technical-design-note-templates.md) - same shape, same
 * call contract (`handleCreateNote` passes `options.isInitialPopulation:
 * true`; `handleOpenNote` leaves it `false`), called from the matching
 * handlers in ProjectDataPanel.tsx's TodosSection, DailyView.tsx,
 * ReviewScreen.tsx and InboxScreen.tsx.
 *
 * `resolveNoteTemplate('todo', ...)` returning `null` (no matching/enabled
 * Todo definition) means `populateNoteFromDefinition` is never called at
 * all: the note stays blank - the same rule Meetings follow since 2026-09-25.
 *
 * `ctx.title` is `stripAllTags(task.text)`, not `task.text` verbatim -
 * unlike a Meeting's title, a task's text routinely ends with `#next`/
 * context tags that don't belong in a note's title (see
 * domain/markdown.ts's `stripAllTags` doc comment). `ctx.relatedItems`
 * reuses the same `relatedItemsFor` aggregate the Meeting path uses, tagged
 * with this task's own `tags` and excluding this task's own `notePath` so
 * it never lists itself (see storage/meetingNoteAggregate.ts's Phase 3 doc
 * comment on `excludeNotePath`). No `date`/`time` fields are set on `ctx` -
 * those piece types are meeting-only (domain/noteTemplate.ts's
 * `PIECE_CONTEXTS`), so a Todo definition's Add-piece list never offers them
 * in the first place.
 *
 * `options.page` - same Slice 2 addition and default as
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

  const definition = resolveNoteTemplate('todo', task.tags, settings.noteCreationDefinitions);
  if (!definition) return;

  const items = getCachedData()?.items ?? [];
  const relatedTodos = relatedItemsFor(items, inbox, task.tags, task.notePath);
  const linked = definition.pieces.some(p => p.type === 'link') ? await existingLinkedFile(paths, task.linkedFile) : null;

  const ctx: PieceRenderContext = {
    title: stripAllTags(task.text),
    relatedItems: relatedTodos.map(t => ({text: t.task.text})),
    linkedFileName: linked?.fileName,
  };
  const pieceContent = definition.pieces.map(piece => renderPieceText(piece, ctx));
  await populateNoteFromDefinition(notePath, definition, pieceContent, linked?.absolutePath ?? null, page);
}

// ---- Open-or-create entry point (Slice 3, docs/dev/technical-design-shared-note-pages.md §6-§8) ----

/**
 * What `resolveItemNoteAnchor` below decides, before any content is written:
 * which file+page this item's note lives on, whether `notePath` needs to
 * change, and whether the page's content should be written as if brand new
 * (bypassing the auto-update freeze rules) rather than as an ordinary
 * refresh. `changed`/`isInitialPopulation`/`recreated` are three genuinely
 * different questions - see `resolveItemNoteAnchor`'s own doc comment for
 * why each of the 7 branches sets them differently; nothing here is derived
 * from anything else in this object.
 */
interface ItemNoteAnchorResolution {
  /** The notePath to use going forward - identical to the one passed in when nothing changed. */
  notePath: string;
  /** True when `notePath` differs from what was passed in - the caller must persist it. */
  changed: boolean;
  /** True when this page's content should be (re)written regardless of the freeze rules - a brand-new page (first-ever link, or just recreated) has nothing worth preserving. */
  isInitialPopulation: boolean;
  /** True only on the two "expected keyword not found" branches - gates the one-time `writeRecreatedNotice` call. */
  recreated: boolean;
  absolutePath: string;
  page: number;
}

/**
 * The own-vs-shared target resolution at the heart of both
 * `openOrCreateMeetingNote` and `openOrCreateTodoNote` below (design doc
 * §6-§8) - decides which file+page an item's note lives on and ensures it
 * exists, without touching the note's *content* (each caller's own
 * `refresh*NoteBlock` call, right after) or persisting anything (storage/
 * functions don't reach into screen state - see this file's own module doc
 * comment and each exported function's doc comment for why persistence is
 * the caller's job).
 *
 * The 7 branches, and what each sets (see `ItemNoteAnchorResolution`'s own
 * field comments for what `changed`/`isInitialPopulation`/`recreated` mean):
 * 1. Own target, no notePath yet -> `createLinkedNote` (today's behavior,
 *    completely unchanged) - changed, initial population, page 0.
 * 2. Own target, notePath already set -> unchanged, ordinary refresh, page 0.
 * 3. Shared target, item has no anchor yet (first-ever link) ->
 *    `insertChronologicalPage` - changed, initial population.
 * 4. Shared target, anchor's keyword still matches the item's current
 *    keyword, and that keyword is still found on the file -> unchanged,
 *    ordinary refresh (freeze rules still apply, same as own-target reopens).
 * 5. Same as 4, but the keyword is NOT found (page deleted by the user) ->
 *    recreate (§7): a fresh page under the SAME keyword, `notePath` itself
 *    doesn't change, but content must be written fresh (nothing on a brand
 *    new page is worth "preserving" from a freeze rule).
 * 6. Shared target, the item's title/date changed since it was last linked
 *    (keyword changed) and the OLD keyword is still found -> lazy rename
 *    (§6 step 4's third bullet): `renameKeywordAt` in place, `notePath`
 *    changes to the new keyword, but this is still an ordinary reopen of
 *    existing content, so freeze rules still apply (NOT an initial
 *    population - a title edit alone shouldn't blow away hand-edited
 *    content on that page).
 * 7. Same as 6, but the OLD keyword is NOT found either -> recreate (§7)
 *    under the NEW keyword - changed, initial population.
 *
 * `collisionCheck` (§8's guard, only read on branch 6) - the caller supplies
 * a small closure answering "does some OTHER item in this Project/Area still
 * derive this exact keyword" (via the live cache - see `meetingKeywordStillUsed`/
 * `todoKeywordStillUsed` below), used as `renameKeywordAt`'s `keepOldKeyword`
 * so a genuine collision (two items that used to have different titles now
 * sharing one) never loses the OTHER item's findability.
 */
async function resolveItemNoteAnchor(params: {
  notePath: string;
  itemPath: string;
  subfolder: typeof MEETINGS_SUBFOLDER | typeof TODOS_SUBFOLDER;
  settings: GtdParaSettings;
  tags: string[];
  context: NoteContext;
  currentKeyword: string;
  baseName: string;
  isDated: boolean;
  /** §9's Inbox exclusion - true forces branches 1-2 (own target) regardless of what the matched definition says, since Inbox items have no Project/Area to anchor a shared file to. Every caller of this internal function passes it explicitly - see `openOrCreateMeetingNote`/`openOrCreateTodoNote`'s own `options.forceOwnTarget` below, which the InboxScreen.tsx/ReviewScreen.tsx call sites set `true` for Inbox-filed items and every other call site leaves at its default `false`. */
  forceOwnTarget: boolean;
  collisionCheck: (oldKeyword: string) => boolean;
}): Promise<ItemNoteAnchorResolution> {
  const definition = resolveNoteTemplate(params.context, params.tags, params.settings.noteCreationDefinitions);
  const background = resolveNoteBackgroundTemplate(params.settings, params.context, params.tags);

  if (params.forceOwnTarget || !definition || effectiveNoteTarget(definition) !== 'shared') {
    // Branches 1-2: own target - exactly today's create-or-open behavior.
    if (!params.notePath) {
      const notePath = await createLinkedNote(params.itemPath, params.subfolder, params.baseName, params.settings, params.tags);
      return {
        notePath,
        changed: true,
        isInitialPopulation: true,
        recreated: false,
        absolutePath: await resolveNotePath(params.itemPath, notePath),
        page: 0,
      };
    }
    return {
      notePath: params.notePath,
      changed: false,
      isInitialPopulation: false,
      recreated: false,
      absolutePath: await resolveNotePath(params.itemPath, params.notePath),
      page: 0,
    };
  }

  // Branches 3-7: shared target.
  const folder = resolvedSharedFileFolder(definition);
  // sanitizeFileNameComponent (2026-09-23, [[bugfix_shared_note_content_missing]]):
  // resolvedSharedFileName returns the Tag Rule's raw, unsanitized
  // "Shared file name" field (or rule name) - nothing filtered it before
  // this became part of a file path. Sanitizing it here both prevents
  // outright filesystem-illegal characters from reaching createNote, and -
  // now that sanitizeFileNameComponent also strips '#' - guarantees this
  // filePath half of a shared anchor can never collide with
  // parseSharedNoteAnchor's separator, the same guarantee own-note file
  // names now have.
  const fileName = sanitizeFileNameComponent(resolvedSharedFileName(definition));
  const relativeFolder = folder === 'root' ? '' : params.subfolder;
  const folderPath = relativeFolder
    ? `${params.itemPath.replace(/\/+$/, '')}/${relativeFolder}`
    : params.itemPath;
  const relativeFilePath = relativeFolder ? `${relativeFolder}/${fileName}.note` : `${fileName}.note`;
  const absoluteFile = await ensureSharedNoteFile(folderPath, fileName, background);

  const anchor = parseSharedNoteAnchor(params.notePath);

  if (!anchor) {
    // Branch 3, hardened (2026-09-22, [[bugfix_shared_note_content_missing]]):
    // check for an already-existing page under this exact keyword before
    // blindly inserting a new one. "No anchor yet" is supposed to mean
    // "first-ever open for this item" (design doc §6), but that invariant
    // breaks whenever ANYTHING between here and this function returning
    // throws (the anchor-parsing bug fixed the same day in
    // domain/sharedNotePages.ts's parseSharedNoteAnchor was the concrete
    // case that surfaced this, but this guard isn't specific to that one
    // bug - any failure in content population or openPath would produce
    // the identical symptom): the anchor never gets persisted back onto
    // the item, so the NEXT attempt believes "no anchor" all over again and
    // would otherwise insert yet another duplicate page carrying the exact
    // same keyword, every single time, forever. This check makes that
    // self-healing regardless of what caused the earlier failure - the
    // same page-sharing the design doc already accepts for two DIFFERENT
    // items that happen to derive the same keyword (§3/§9: "probably
    // related anyway"), just reached from one item's own earlier failed
    // attempt instead of two items colliding. `isInitialPopulation: false`
    // (not `true`, unlike the real first-ever-open path just below) - this
    // is treated as reopening an existing page, same as branch 4, so the
    // normal auto-update freeze rule still applies rather than
    // unconditionally overwriting whatever is already on that page.
    const existingPage = await findKeywordPage(absoluteFile, params.currentKeyword);
    if (existingPage !== null) {
      return {
        notePath: buildSharedNoteAnchor(relativeFilePath, params.currentKeyword),
        changed: true,
        isInitialPopulation: false,
        recreated: false,
        absolutePath: absoluteFile,
        page: existingPage,
      };
    }
    // First-ever open for this item, and no other item's page to recover -
    // the original Branch 3.
    const page = await insertChronologicalPage(absoluteFile, params.currentKeyword, background, params.isDated);
    return {
      notePath: buildSharedNoteAnchor(relativeFilePath, params.currentKeyword),
      changed: true,
      isInitialPopulation: true,
      recreated: false,
      absolutePath: absoluteFile,
      page,
    };
  }

  if (anchor.keyword === params.currentKeyword) {
    const page = await findKeywordPage(absoluteFile, params.currentKeyword);
    if (page !== null) {
      // Branch 4.
      return {
        notePath: params.notePath,
        changed: false,
        isInitialPopulation: false,
        recreated: false,
        absolutePath: absoluteFile,
        page,
      };
    }
    // Branch 5.
    const newPage = await insertChronologicalPage(absoluteFile, params.currentKeyword, background, params.isDated);
    await writeRecreatedNotice(absoluteFile, newPage, todayIso());
    return {
      notePath: params.notePath,
      changed: false,
      isInitialPopulation: true,
      recreated: true,
      absolutePath: absoluteFile,
      page: newPage,
    };
  }

  // Title/date changed since the note was last linked - lazy rename (branches 6-7).
  const oldPage = await findKeywordPage(absoluteFile, anchor.keyword);
  const notePath = buildSharedNoteAnchor(relativeFilePath, params.currentKeyword);
  if (oldPage !== null) {
    // Branch 6.
    const keepOldKeyword = params.collisionCheck(anchor.keyword);
    await renameKeywordAt(absoluteFile, oldPage, anchor.keyword, params.currentKeyword, {keepOldKeyword});
    return {notePath, changed: true, isInitialPopulation: false, recreated: false, absolutePath: absoluteFile, page: oldPage};
  }
  // Branch 7.
  const newPage = await insertChronologicalPage(absoluteFile, params.currentKeyword, background, params.isDated);
  await writeRecreatedNotice(absoluteFile, newPage, todayIso());
  return {notePath, changed: true, isInitialPopulation: true, recreated: true, absolutePath: absoluteFile, page: newPage};
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

/** What `openOrCreateMeetingNote`/`openOrCreateTodoNote` return alongside their `changed` flag - the resolved page this call already opened, kept here so a caller that wants to log/display the resolved location can, without re-deriving it. */
export interface OpenOrCreateNoteOutcome {
  absolutePath: string;
  page: number;
}

/**
 * Open-or-create entry point for a Meeting's linked note (design doc
 * §6-§8) - the one function DailyView/ProjectDataPanel/WeekView/InboxScreen/
 * ReviewScreen's note-icon tap handlers call instead of choosing between
 * `createLinkedNote` and a bare `openPath` themselves (today's separate
 * create-note/open-note handler pair). Handles both own- and shared-target
 * definitions transparently - for an own target this is *exactly* today's
 * create-or-open behavior, byte-for-byte; for a shared target it resolves or
 * creates the right page (§6), recreates it if the expected keyword vanished
 * (§7), and lazily renames the keyword in place if `meeting`'s date/title
 * changed since it was last linked (§6 step 4's third bullet) - see
 * `resolveItemNoteAnchor`'s own doc comment for the full branch breakdown.
 *
 * Does NOT persist a changed `notePath` itself, and does NOT mutate
 * `meeting` - storage/ functions don't reach into screen state, and this
 * codebase's 5 screens persist a Meeting through 3 different mechanisms
 * (DailyView/InboxScreen/ReviewScreen's `mutateEntryMeetings`-backed
 * helpers, ProjectDataPanel's own local array + `saveMeetings`, WeekView's
 * `findCachedItem` + `saveMeetings` directly), none of which this file
 * should know about. Instead this returns the possibly-updated `Meeting`
 * (a new object only when something changed, the same `meeting` reference
 * otherwise) alongside `changed` - the caller's existing shape is always
 * "if changed, persist `result.meeting` the same way `createLinkedNote`'s
 * returned `notePath` used to be persisted; either way, done." This is a
 * strictly smaller diff at every call site than it looks - each site already
 * has its own persistence one-liner today, it just used to run
 * unconditionally after `createLinkedNote` and never after `openPath`; now
 * it runs conditionally on `changed`, in both cases.
 *
 * Ends by opening the resolved page itself (`openPath(absolutePath, page)`)
 * - the caller doesn't do this step separately, unlike today's handlers.
 *
 * `options.forceOwnTarget` (§9's Inbox exclusion) - InboxScreen.tsx/
 * ReviewScreen.tsx's Inbox-filed-meeting call sites pass `true`, since Inbox
 * items have no Project/Area to anchor a shared file to; every other call
 * site leaves it at its default `false`.
 */
export async function openOrCreateMeetingNote(
  meeting: Meeting,
  itemPath: string,
  settings: GtdParaSettings,
  inbox: MeetingNoteInboxInput | null,
  options: {forceOwnTarget?: boolean} = {},
): Promise<{meeting: Meeting; changed: boolean; outcome: OpenOrCreateNoteOutcome}> {
  const currentKeyword = meetingPageKeyword(meeting);
  const anchor = await resolveItemNoteAnchor({
    notePath: meeting.notePath,
    itemPath,
    subfolder: MEETINGS_SUBFOLDER,
    settings,
    tags: meeting.tags,
    context: 'meeting',
    currentKeyword,
    forceOwnTarget: options.forceOwnTarget ?? false,
    baseName: meetingNoteBaseName(meeting),
    isDated: true,
    collisionCheck: oldKeyword => meetingKeywordStillUsed(itemPath, oldKeyword),
  });

  const updatedMeeting = anchor.changed ? {...meeting, notePath: anchor.notePath} : meeting;
  await refreshMeetingNoteBlock(updatedMeeting, itemPath, settings, inbox, {
    isInitialPopulation: anchor.isInitialPopulation,
    page: anchor.page,
  });
  await openPath(anchor.absolutePath, anchor.page);

  return {
    meeting: updatedMeeting,
    changed: anchor.changed,
    outcome: {absolutePath: anchor.absolutePath, page: anchor.page},
  };
}

/**
 * The Todo counterpart to `openOrCreateMeetingNote` above - same shape, same
 * contract (see that function's own doc comment for the full explanation of
 * why persistence is the caller's job, how `changed` drives it, and what
 * `options.forceOwnTarget` is for). Every real call site is one of
 * ProjectDataPanel.tsx's TodosSection, DailyView.tsx, InboxScreen.tsx,
 * ReviewScreen.tsx (WeekView.tsx has no Todo column).
 */
export async function openOrCreateTodoNote(
  task: Task,
  itemPath: string,
  settings: GtdParaSettings,
  inbox: MeetingNoteInboxInput | null,
  options: {forceOwnTarget?: boolean} = {},
): Promise<{task: Task; changed: boolean; outcome: OpenOrCreateNoteOutcome}> {
  const currentKeyword = todoPageKeyword(task);
  const anchor = await resolveItemNoteAnchor({
    notePath: task.notePath,
    itemPath,
    subfolder: TODOS_SUBFOLDER,
    settings,
    tags: task.tags,
    context: 'todo',
    currentKeyword,
    baseName: todoNoteBaseName(task),
    isDated: false,
    forceOwnTarget: options.forceOwnTarget ?? false,
    collisionCheck: oldKeyword => todoKeywordStillUsed(itemPath, oldKeyword),
  });

  const updatedTask = anchor.changed ? {...task, notePath: anchor.notePath} : task;
  await refreshTodoNoteBlock(updatedTask, itemPath, settings, inbox, {
    isInitialPopulation: anchor.isInitialPopulation,
    page: anchor.page,
  });
  await openPath(anchor.absolutePath, anchor.page);

  return {
    task: updatedTask,
    changed: anchor.changed,
    outcome: {absolutePath: anchor.absolutePath, page: anchor.page},
  };
}
