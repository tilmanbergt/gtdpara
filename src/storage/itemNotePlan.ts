/**
 * What a note-icon tap on a todo or meeting does
 * (docs/dev/history/technical-design-shared-note-pages.md §6-§8;
 * plan-then-confirm and file-name placeholders:
 * docs/dev/history/technical-design-split-by-tag.md §3.3-§3.5): plan it
 * (open, create, add a page, link, recreate), ask, then carry it out.
 * storage/meetingNoteContent.ts's open-or-create entry points call
 * `resolveItemNote` and then fill and open the page.
 *
 * A todo or meeting of a loop gets a page in its loop's note
 * (docs/dev/history/technical-design-loops.md §4.4, storage/loopNotes.ts),
 * unless a rule that matched through another tag defines its note.
 */
import {todayIso} from '../domain/meetingTime';
import {
  effectiveNoteTarget,
  NoteContext,
  resolvedSharedFileFolder,
  resolvedSharedFileName,
  resolveNoteTemplate,
  ruleSubtag,
  ruleTypeTag,
  TagRule,
} from '../domain/tagRules';
import {NoteCreationPlan} from '../domain/noteCreationPlan';
import {buildSharedNoteAnchor, renderSharedFileName} from '../domain/sharedNotePages';
import {GtdParaSettings} from '../domain/settings';
import {createNote, displayPath, ensureFolderExists, fileExists} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {contextTagsOf} from '../domain/flowState';
import {collisionFreeName} from './fileNaming';
import {ensureLoopNoteFile, LoopNoteTarget, loopNoteTarget} from './loopNotes';
import {
  classifyNotePath,
  createLinkedNote,
  insertNoteKeywords,
  MEETINGS_SUBFOLDER,
  resolveNoteBackgroundTemplate,
  sanitizeFileNameComponent,
  TODOS_SUBFOLDER,
} from './noteLinks';
import {ensureSharedNoteFile, findKeywordPage, insertChronologicalPage, renameKeywordAt, writeRecreatedNotice} from './sharedNotePages';

/**
 * What executing a note plan produced: which file+page this item's note
 * lives on, whether `notePath` needs to change, and whether the page's
 * content should be written as if brand new (bypassing the auto-update
 * freeze rules) rather than as an ordinary refresh. `changed`/
 * `isInitialPopulation` are genuinely different questions - e.g. a lazy
 * keyword rename changes `notePath` but is still an ordinary reopen.
 */
export interface ItemNoteAnchorResolution {
  /** The notePath to use going forward - identical to the one passed in when nothing changed. */
  notePath: string;
  /** True when `notePath` differs from what was passed in - the caller must persist it. */
  changed: boolean;
  /** True when this page's content should be (re)written regardless of the freeze rules - a brand-new page has nothing worth preserving. */
  isInitialPopulation: boolean;
  absolutePath: string;
  page: number;
  /** The loop note this created, whose first page (the loop's own) still needs filling. */
  loopPage?: LoopNoteTarget;
  /**
   * A note gtdpara didn't create (lasso capture's link to its source note):
   * opened as it is, never filled from a Tag Rule - that would put
   * gtdpara's pieces onto the user's own handwritten page.
   */
  foreign?: boolean;
}

export interface ItemNoteParams {
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
export async function planItemNote(params: ItemNoteParams): Promise<ItemNotePlan> {
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

  // No note link yet. A todo or meeting of an active loop gets a page in the loop's note.
  const loopNote = params.forceOwnTarget ? null : loopNoteTarget(itemPath, tags, definition);
  if (!loopNote && (params.forceOwnTarget || !definition || effectiveNoteTarget(definition) !== 'shared')) {
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
  // A loop note lives in the owner's own folder.
  const sharedRule = definition as TagRule;
  const fileName = loopNote
    ? loopNote.fileName
    : sanitizeFileNameComponent(
        renderSharedFileName({
          template: resolvedSharedFileName(sharedRule),
          ruleName: sharedRule.name,
          tag: ruleTypeTag(tags, sharedRule.tags),
          subtag: ruleSubtag(tags, sharedRule.tags),
          date: params.fileDate,
        }),
      );
  const relativeFolder = loopNote || resolvedSharedFileFolder(sharedRule) === 'root' ? '' : params.subfolder;
  const folderPath = relativeFolderPath(itemPath, relativeFolder);
  const relativeFilePath = relativeFolder ? `${relativeFolder}/${fileName}.note` : `${fileName}.note`;
  const absoluteFile = `${folderPath}/${fileName}.note`;
  const notePath = buildSharedNoteAnchor(relativeFilePath, currentKeyword);

  if (!(await fileExists(absoluteFile))) {
    return {
      plan: {kind: 'new-shared-file', file: relativeFilePath, absolutePath: absoluteFile, ruleName},
      execute: async () => {
        // A new loop note starts with the loop's own page (filled by the caller).
        const loopPage = loopNote && (await ensureLoopNoteFile(itemPath, loopNote, settings)) ? loopNote : undefined;
        if (!loopNote) await ensureSharedNoteFile(folderPath, fileName, background);
        const page = await insertChronologicalPage(absoluteFile, currentKeyword, background, isDated);
        return {notePath, changed: true, isInitialPopulation: true, absolutePath: absoluteFile, page, loopPage};
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
export async function resolveItemNote(
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
