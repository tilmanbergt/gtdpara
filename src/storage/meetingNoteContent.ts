/**
 * Builds and writes note-creation content (docs/dev/technical-design-meeting-
 * notes.md §5, docs/dev/history/technical-design-note-templates.md §4/§5): the
 * per-piece textboxes a `TagRule` describes - always regenerated from
 * scratch, never merged/diffed against what was there before (the "always
 * regenerate, discard edits" decision).
 *
 * One population path (docs/dev/history/technical-design-linked-file-piece.md):
 * `populateNoteFromRule` - one element per non-empty piece, positioned/
 * sized from that piece's own x/y/fontSize/maxWidth. A `link` piece becomes a
 * tappable link element to the item's `linkedFile` (only when that file still
 * exists); a rule without a `link` piece writes no link at all. A Meeting or
 * Todo that matches no rule gets no content. Older notes still carrying a
 * legacy marker get it cleaned up on their next refresh
 * (isNoteTemplateManagedElement recognises both).
 *
 * The file name is narrower than its content (it is not meeting-only);
 * §4/§8 name `storage/noteTemplateContent.ts` as the intended name.
 *
 * `refreshMeetingNoteBlock` and `refreshTodoNoteBlock` resolve a definition,
 * render its pieces and call `populateNoteFromRule`. Both gate the
 * *re*-populate-on-open path on a freeze rule (domain/meetingTime.ts's
 * `isMeetingAutoUpdateFrozen` / domain/tagRules.ts's
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
 * `deleteStaleManagedElements`, `buildLinkElement` and `populateNoteFromRule`
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
 * the page engine and knows nothing about Task/Meeting or which target a
 * definition resolves to.
 *
 * Textbox metrics + per-piece max width
 * (docs/dev/history/technical-design-textbox-metrics.md): `populateNoteFromRule`
 * builds each rect via `storage/notePieceMetrics.ts`'s `measureNotePieceRect`
 * (real on-device text measurement, content-fit width, capped at each
 * piece's own `maxWidthPx` - see domain/tagRules.ts's `NotePiece`) and
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
  TagRule,
  pieceMaxWidthPx,
  PieceRenderContext,
  renderPieceText,
  resolvedSharedFileFolder,
  resolvedSharedFileName,
  resolveNoteTemplate,
  ruleSubtag,
} from '../domain/tagRules';
import {NoteCreationPlan} from '../domain/noteCreationPlan';
import {
  buildSharedNoteAnchor,
  meetingPageKeyword,
  renderSharedFileName,
  todoPageKeyword,
} from '../domain/sharedNotePages';
import {GtdParaSettings, ResolvedParaPaths, resolvePaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {
  createElement,
  createNote,
  deleteElements,
  displayPath,
  Element,
  ELEMENT_TYPE_LINK,
  ensureFolderExists,
  fileExists,
  getElements,
  insertElements,
  openPath,
} from '../supernote/fileSystem';
import {buildTextboxElement} from '../supernote/noteElements';
import {log} from '../utils/log';
import {contextTagsOf} from '../domain/flowState';
import {getCachedData} from './dataCache';
import {linkedFileStatus, resolveLinkedFilePath} from './linkedFiles';
import {MeetingNoteInboxInput, relatedItemsFor} from './meetingNoteAggregate';
import {collisionFreeName} from './fileNaming';
import {
  classifyNotePath,
  createLinkedNote,
  insertNoteKeywords,
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
import {errorMessage} from '../utils/errorMessage';

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
 * Step 1 of populateNoteFromRule below: reads `page` and deletes every
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
 * (Re)builds `notePath`'s `page` from `definition`'s pieces
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
 * `pieceContent[i]` is `definition.pieces[i]` already rendered to text (the
 * caller - refreshMeetingNoteBlock below - builds this via
 * domain/tagRules.ts's renderPieceText, since which fields feed a piece
 * is context-specific and this function shouldn't need to know that). A
 * piece whose rendered text is `''` (an unset `time`, a `related` piece
 * with nothing to show) gets no element at all - same "omit rather than
 * show empty" convention (a `link` piece is empty when the item has no
 * linked file or the file is missing).
 *
 * Deviates from technical-design-note-templates.md §4's literal signature
 * (`populateNoteFromRule(notePath, definition, pieceContent,
 * settings)`) by dropping the `settings` param: no GtdParaSettings field is
 * needed here - positioning is fully piece-driven, and background selection
 * (storage/noteLinks.ts's resolveNoteBackgroundTemplate) happens at
 * note-*creation* time, not here.
 *
 * `linkedFileAbsolutePath` is only read by a `link` piece (
 * docs/dev/history/technical-design-linked-file-piece.md) - the caller passes it only when the file
 * exists, and sets the matching `linkedFileName` on the render context, so a
 * `link` piece's text is non-empty exactly when this is set. No link is
 * written for a definition without a `link` piece.
 */
export async function populateNoteFromRule(
  notePath: string,
  definition: TagRule,
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
}

/**
 * The per-screen-callable wrapper (§6) behind every note create/open
 * (docs/dev/history/technical-design-note-templates.md §5).
 *
 * Resolves `resolveNoteTemplate('meeting', meeting.tags,
 * settings.tagRules)`. When it finds a
 * definition, renders every piece via domain/tagRules.ts's
 * renderPieceText (building a PieceRenderContext from this Meeting + its
 * related todos) and calls populateNoteFromRule. When it returns
 * `null` (no matching/enabled Meeting definition) nothing is written, same
 * as Todos (docs/dev/history/technical-design-linked-file-piece.md §4: the user's
 * rules decide the layout).
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

  const definition = resolveNoteTemplate('meeting', meeting.tags, settings.tagRules);
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
    // set" contract (domain/tagRules.ts §4) both read the same way
    // whether the meeting has no time or the definition has no time piece.
    time: meeting.time || undefined,
    relatedItems: relatedTodos.map(t => ({text: t.task.text})),
    linkedFileName: linked?.fileName,
  };
  const pieceContent = definition.pieces.map(piece => renderPieceText(piece, ctx));
  await populateNoteFromRule(notePath, definition, pieceContent, linked?.absolutePath ?? null, page);
}

/**
 * The Todo counterpart to `refreshMeetingNoteBlock` above
 * (docs/dev/history/technical-design-note-templates.md) - same shape, same
 * call contract (`handleCreateNote` passes `options.isInitialPopulation:
 * true`; `handleOpenNote` leaves it `false`), called from the matching
 * handlers in ProjectDataPanel.tsx's TodosSection, DailyView.tsx,
 * ReviewScreen.tsx and InboxScreen.tsx.
 *
 * `resolveNoteTemplate('todo', ...)` returning `null` (no matching/enabled
 * Todo definition) means `populateNoteFromRule` is never called at
 * all: the note stays blank - the same rule Meetings follow.
 *
 * `ctx.title` is `stripAllTags(task.text)`, not `task.text` verbatim -
 * unlike a Meeting's title, a task's text routinely ends with `#next`/
 * context tags that don't belong in a note's title (see
 * domain/markdown.ts's `stripAllTags` doc comment). `ctx.relatedItems`
 * reuses the same `relatedItemsFor` aggregate the Meeting path uses, tagged
 * with this task's own `tags` and excluding this task's own `notePath` so
 * it never lists itself (see storage/meetingNoteAggregate.ts's doc
 * comment on `excludeNotePath`). No `date`/`time` fields are set on `ctx` -
 * those piece types are meeting-only (domain/tagRules.ts's
 * `PIECE_CONTEXTS`), so a Todo definition's Add-piece list never offers them
 * in the first place.
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

  const definition = resolveNoteTemplate('todo', task.tags, settings.tagRules);
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
  await populateNoteFromRule(notePath, definition, pieceContent, linked?.absolutePath ?? null, page);
}

// ---- Open-or-create entry point (docs/dev/history/technical-design-shared-note-pages.md §6-§8;
// plan-then-confirm and file-name placeholders: docs/dev/history/technical-design-split-by-tag.md §3.3-§3.5) ----

/**
 * What executing a note plan produced: which file+page this item's note
 * lives on, whether `notePath` needs to change, and whether the page's
 * content should be written as if brand new (bypassing the auto-update
 * freeze rules) rather than as an ordinary refresh. `changed`/
 * `isInitialPopulation` are genuinely different questions - e.g. a lazy
 * keyword rename changes `notePath` but is still an ordinary reopen.
 */
interface ItemNoteAnchorResolution {
  /** The notePath to use going forward - identical to the one passed in when nothing changed. */
  notePath: string;
  /** True when `notePath` differs from what was passed in - the caller must persist it. */
  changed: boolean;
  /** True when this page's content should be (re)written regardless of the freeze rules - a brand-new page has nothing worth preserving. */
  isInitialPopulation: boolean;
  absolutePath: string;
  page: number;
  /**
   * A note gtdpara didn't create (lasso capture's link to its source note):
   * opened as it is, never filled from a Tag Rule - that would put
   * gtdpara's pieces onto the user's own handwritten page.
   */
  foreign?: boolean;
}

interface ItemNoteParams {
  notePath: string;
  itemPath: string;
  subfolder: typeof MEETINGS_SUBFOLDER | typeof TODOS_SUBFOLDER;
  settings: GtdParaSettings;
  tags: string[];
  context: NoteContext;
  currentKeyword: string;
  baseName: string;
  isDated: boolean;
  /** YYYY-MM-DD for the `{year}`/`{quarter}`/`{month}` placeholders - a meeting's own date, today for a todo. */
  fileDate: string;
  /** Inbox items: always an own note, whatever the matched rule says (no shared files for Inbox items - see the split-by-tag design §4). */
  forceOwnTarget: boolean;
  /** Does some OTHER item in this Project/Area still derive this exact keyword (shared-note design §8) - see `meetingKeywordStillUsed`/`todoKeywordStillUsed`. */
  collisionCheck: (oldKeyword: string) => boolean;
}

/**
 * The plan for one note-icon tap: the public part (`plan`, shown in the
 * confirm - `null` for an ordinary open, which needs no confirm) plus the
 * write step that carries it out. Planning only reads (folder listings,
 * keyword lookups); nothing is created, linked or renamed until `execute`.
 */
interface ItemNotePlan {
  plan: NoteCreationPlan | null;
  execute: () => Promise<ItemNoteAnchorResolution>;
}

function relativeFolderPath(itemPath: string, relativeFolder: string): string {
  const base = itemPath.replace(/\/+$/, '');
  return relativeFolder ? `${base}/${relativeFolder}` : base;
}

/** The folder part of an absolute path ("" if there is none). */
function parentFolder(absolutePath: string): string {
  const slash = absolutePath.lastIndexOf('/');
  return slash < 0 ? '' : absolutePath.slice(0, slash);
}

/** A fresh page (and the file, if missing) under `keyword`, with the "Recreated <date>" line - the shared-note design's §7. */
async function recreateSharedPage(
  folderPath: string,
  fileName: string,
  absoluteFile: string,
  keyword: string,
  background: string,
  isDated: boolean,
): Promise<number> {
  await ensureSharedNoteFile(folderPath, fileName, background);
  const page = await insertChronologicalPage(absoluteFile, keyword, background, isDated);
  await writeRecreatedNotice(absoluteFile, page, todayIso());
  return page;
}

/**
 * Decides what a note-icon tap will do (split-by-tag design §3.4/§3.5).
 *
 * Item already has a note link - the link decides, never the current rule
 * (decision 5, "once created, it stays"; see `classifyNotePath` for how own
 * vs. shared is told apart):
 * - own note, file there -> open (no confirm).
 * - own note, file missing -> `recreate-own-file` under the same name; an
 *   absolute lasso "source note" link is never recreated - that throws a
 *   "not found" error instead, which the screen shows in the status slot.
 * - shared, file there -> the page for the current keyword (or, if the
 *   keyword changed since linking, the old one, renamed in place) -> open;
 *   no such page -> `recreate-page`.
 * - shared, file missing -> `recreate-shared-file`.
 *
 * No note link yet - the matched Tag Rule decides:
 * - no rule, an own-target rule, or an Inbox item -> `new-own-file`.
 * - shared-target rule -> file name from the rule's placeholders; file
 *   missing -> `new-shared-file`; file there and a page with this keyword
 *   already on it -> `link-page`; otherwise `new-page`.
 */
async function planItemNote(params: ItemNoteParams): Promise<ItemNotePlan> {
  const {itemPath, settings, tags, context, currentKeyword, isDated} = params;
  const definition = resolveNoteTemplate(context, tags, settings.tagRules);
  const background = resolveNoteBackgroundTemplate(settings, context, tags);
  const ruleName = definition ? definition.name : null;

  const existing = await classifyNotePath(itemPath, params.notePath);

  if (existing.kind === 'own') {
    if (existing.exists) {
      return {
        plan: null,
        execute: async () => ({
          notePath: params.notePath,
          changed: false,
          isInitialPopulation: false,
          absolutePath: existing.absolutePath,
          page: existing.page ?? 0,
          foreign: existing.isAbsoluteLink,
        }),
      };
    }
    if (existing.isAbsoluteLink) {
      throw new Error(`Linked note not found: ${displayPath(existing.absolutePath)}`);
    }
    return {
      plan: {kind: 'recreate-own-file', file: params.notePath, absolutePath: existing.absolutePath, ruleName: null},
      execute: async () => {
        await ensureFolderExists(parentFolder(existing.absolutePath));
        await createNote(existing.absolutePath, background, true);
        await insertNoteKeywords(existing.absolutePath, contextTagsOf(tags));
        return {
          notePath: params.notePath,
          changed: false,
          isInitialPopulation: true,
          absolutePath: existing.absolutePath,
          page: 0,
        };
      },
    };
  }

  if (existing.kind === 'shared') {
    const {anchor, absolutePath: absoluteFile} = existing;
    const relativeFolder = parentFolder(anchor.filePath);
    const folderPath = relativeFolderPath(itemPath, relativeFolder);
    const fileName = anchor.filePath.slice(relativeFolder ? relativeFolder.length + 1 : 0).replace(/\.note$/, '');
    const newNotePath = buildSharedNoteAnchor(anchor.filePath, currentKeyword);
    const keywordChanged = anchor.keyword !== currentKeyword;

    if (!existing.exists) {
      return {
        plan: {kind: 'recreate-shared-file', file: anchor.filePath, absolutePath: absoluteFile, ruleName: null},
        execute: async () => {
          const page = await recreateSharedPage(folderPath, fileName, absoluteFile, currentKeyword, background, isDated);
          return {notePath: newNotePath, changed: keywordChanged, isInitialPopulation: true, absolutePath: absoluteFile, page};
        },
      };
    }

    // Lazy keyword rename (shared-note design §6): look up the keyword the item was linked under.
    const page = await findKeywordPage(absoluteFile, anchor.keyword);
    if (page !== null) {
      return {
        plan: null,
        execute: async () => {
          if (keywordChanged) {
            const keepOldKeyword = params.collisionCheck(anchor.keyword);
            await renameKeywordAt(absoluteFile, page, anchor.keyword, currentKeyword, {keepOldKeyword});
          }
          return {notePath: newNotePath, changed: keywordChanged, isInitialPopulation: false, absolutePath: absoluteFile, page};
        },
      };
    }
    return {
      plan: {kind: 'recreate-page', file: anchor.filePath, absolutePath: absoluteFile, ruleName: null},
      execute: async () => {
        const newPage = await recreateSharedPage(folderPath, fileName, absoluteFile, currentKeyword, background, isDated);
        return {notePath: newNotePath, changed: keywordChanged, isInitialPopulation: true, absolutePath: absoluteFile, page: newPage};
      },
    };
  }

  // No note link yet.
  if (params.forceOwnTarget || !definition || effectiveNoteTarget(definition) !== 'shared') {
    const folderPath = relativeFolderPath(itemPath, params.subfolder);
    const fileName = await collisionFreeName(folderPath, params.baseName, '.note');
    const relativePath = `${params.subfolder}/${fileName}`;
    const absolutePath = `${folderPath}/${fileName}`;
    return {
      plan: {kind: 'new-own-file', file: relativePath, absolutePath, ruleName},
      execute: async () => {
        const notePath = await createLinkedNote(
          itemPath,
          params.subfolder,
          params.baseName,
          settings,
          tags,
          fileName,
          contextTagsOf(tags),
        );
        return {notePath, changed: true, isInitialPopulation: true, absolutePath, page: 0};
      },
    };
  }

  // Shared target. sanitizeFileNameComponent: the rendered name comes from
  // user text (rule field, subtag) - strip illegal characters and '#' (the
  // anchor separator), and turn a deeper subtag's '/' into a space.
  const fileName = sanitizeFileNameComponent(
    renderSharedFileName({
      template: resolvedSharedFileName(definition),
      ruleName: definition.name,
      subtag: ruleSubtag(tags, definition.tags),
      date: params.fileDate,
    }),
  );
  const relativeFolder = resolvedSharedFileFolder(definition) === 'root' ? '' : params.subfolder;
  const folderPath = relativeFolderPath(itemPath, relativeFolder);
  const relativeFilePath = relativeFolder ? `${relativeFolder}/${fileName}.note` : `${fileName}.note`;
  const absoluteFile = `${folderPath}/${fileName}.note`;
  const notePath = buildSharedNoteAnchor(relativeFilePath, currentKeyword);

  if (!(await fileExists(absoluteFile))) {
    return {
      plan: {kind: 'new-shared-file', file: relativeFilePath, absolutePath: absoluteFile, ruleName},
      execute: async () => {
        await ensureSharedNoteFile(folderPath, fileName, background);
        const page = await insertChronologicalPage(absoluteFile, currentKeyword, background, isDated);
        return {notePath, changed: true, isInitialPopulation: true, absolutePath: absoluteFile, page};
      },
    };
  }

  // A page with this keyword may already exist (two items with the same
  // keyword, or an earlier attempt that never got its link saved). Linking to it is confirmed too, since
  // that page may already hold content; freeze rules still apply to it.
  const existingPage = await findKeywordPage(absoluteFile, currentKeyword);
  if (existingPage !== null) {
    return {
      plan: {kind: 'link-page', file: relativeFilePath, absolutePath: absoluteFile, ruleName, keyword: currentKeyword},
      execute: async () => ({notePath, changed: true, isInitialPopulation: false, absolutePath: absoluteFile, page: existingPage}),
    };
  }
  return {
    plan: {kind: 'new-page', file: relativeFilePath, absolutePath: absoluteFile, ruleName},
    execute: async () => {
      const page = await insertChronologicalPage(absoluteFile, currentKeyword, background, isDated);
      return {notePath, changed: true, isInitialPopulation: true, absolutePath: absoluteFile, page};
    },
  };
}

/**
 * Plans, asks for confirmation when the plan creates, recreates or links
 * something, then carries it out. `null` = the user cancelled: nothing was
 * written, and the item's existing link (if any) is untouched, so the next
 * tap asks again.
 */
async function resolveItemNote(
  params: ItemNoteParams,
  confirmCreate: ((plan: NoteCreationPlan) => Promise<boolean>) | undefined,
  logTag: string,
): Promise<ItemNoteAnchorResolution | null> {
  const {plan, execute} = await planItemNote(params);
  // Kind only - file names carry client/meeting names (DEVELOPMENT-POLICY §5).
  log(`${logTag}: plan`, plan?.kind ?? 'open');
  if (plan && confirmCreate && !(await confirmCreate(plan))) {
    log(`${logTag}: cancelled`, plan.kind);
    return null;
  }
  const resolution = await execute();
  if (plan) log(`${logTag}: done`, plan.kind);
  return resolution;
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
 * (`planItemNote` - open, create, add page, link, recreate), asks
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
      context: 'meeting',
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
      context: 'todo',
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
