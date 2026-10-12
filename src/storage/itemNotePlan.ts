/**
 * What a note-icon tap on a todo or meeting does
 * (docs/dev/history/technical-design-shared-note-pages.md §6-§8;
 * plan-then-confirm and file-name placeholders:
 * docs/dev/history/technical-design-split-by-tag.md §3.3-§3.5): plan it
 * (open, create, add a page, link, recreate), ask, then carry it out.
 * storage/meetingNoteContent.ts's open-or-create entry points call
 * `resolveItemNote` and then fill and open the page.
 *
 * Where a first note goes is decided by the Note setups
 * (docs/dev/history/technical-design-note-setups.md §4.4,
 * storage/noteTargets.ts): the item's own note, a setup's notebook, or the
 * note of an active loop (docs/dev/history/technical-design-loops.md §4.4).
 */
import {todayIso} from '../domain/meetingTime';
import {layoutFor} from '../domain/noteSetups';
import {NoteCreateConfirm, NoteCreationPlan} from '../domain/noteCreationPlan';
import {buildSharedNoteAnchor} from '../domain/sharedNotePages';
import {GtdParaSettings} from '../domain/settings';
import {createNote, displayPath, ensureFolderExists, fileExists} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {contextTagsOf} from '../domain/flowState';
import {collisionFreeName} from './fileNaming';
import {ensureLoopNoteFile, LoopNoteTarget} from './loopNotes';
import {backgroundOf, classifyNotePath, createLinkedNote, insertNoteKeywords, MEETINGS_SUBFOLDER, TODOS_SUBFOLDER} from './noteLinks';
import {layoutForLink, NoteTargetInput, PlacedCandidate, placeNoteCandidates} from './noteTargets';
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
   * opened as it is, never filled from a page layout - that would put
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
  pageKind: 'meeting' | 'todo';
  currentKeyword: string;
  baseName: string;
  isDated: boolean;
  /** YYYY-MM-DD for the `{year}`/`{quarter}`/`{month}` placeholders - a meeting's own date, today for a todo. */
  fileDate: string;
  /** Inbox items: always an own note, whatever the matched setup says (no shared files for Inbox items - see the split-by-tag design §4). */
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
  /** Carries out the chosen place: 0 = `plan`, n = `plan.alternatives[n - 1]`. */
  execute: (choice: number) => Promise<ItemNoteAnchorResolution>;
}

/** At most this many places are planned for a first note (each costs a file check and a keyword lookup). */
const MAX_PLACES = 4;

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
 * No note link yet - the best note candidate decides (storage/noteTargets.ts):
 * - the item's own note (no setup, a setup without a notebook, a Loop setup
 *   outside an active loop, or an Inbox item) -> `new-own-file`.
 * - a notebook or loop note -> file name from its placeholders; file
 *   missing -> `new-shared-file`; file there and a page with this keyword
 *   already on it -> `link-page`; otherwise `new-page`.
 *
 * The background of every new or recreated page is the one of the layout
 * it gets filled from (for a link: `layoutForLink`).
 */
export async function planItemNote(params: ItemNoteParams): Promise<ItemNotePlan> {
  const {itemPath, tags, currentKeyword, isDated} = params;
  const existing = await classifyNotePath(itemPath, params.notePath);
  if (existing.kind === 'none') return planFirstNote(params);
  const background = backgroundOf(
    layoutForLink({...targetInput(params), linkedFile: existing.kind === 'shared' ? existing.anchor.filePath : null}),
  );

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
      plan: {kind: 'recreate-own-file', file: params.notePath, absolutePath: existing.absolutePath, setupName: null},
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
        plan: {kind: 'recreate-shared-file', file: anchor.filePath, absolutePath: absoluteFile, setupName: null},
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
      plan: {kind: 'recreate-page', file: anchor.filePath, absolutePath: absoluteFile, setupName: null},
      execute: async () => {
        const newPage = await recreateSharedPage(folderPath, fileName, absoluteFile, currentKeyword, background, isDated);
        return {notePath: newNotePath, changed: keywordChanged, isInitialPopulation: true, absolutePath: absoluteFile, page: newPage};
      },
    };
  }

  // A note link that is neither own nor shared does not exist (classifyNotePath).
  throw new Error('Unknown note link.');
}

/**
 * A first note: the plan for the best place, with the other places as
 * `alternatives` (docs/dev/history/technical-design-note-setups.md §4.4).
 */
async function planFirstNote(params: ItemNoteParams): Promise<ItemNotePlan> {
  const placed = placeNoteCandidates(targetInput(params)).slice(0, MAX_PLACES);
  const plans: ItemNotePlan[] = [];
  for (const p of placed) plans.push(await planNewNote(params, p));
  const [best, ...others] = plans;
  const alternatives = others.map(o => o.plan).filter((p): p is NoteCreationPlan => p !== null);
  return {
    plan: best.plan && alternatives.length > 0 ? {...best.plan, alternatives} : best.plan,
    execute: choice => (plans[choice] ?? best).execute(0),
  };
}

function targetInput(params: ItemNoteParams): NoteTargetInput {
  return {
    itemPath: params.itemPath,
    tags: params.tags,
    pageKind: params.pageKind,
    settings: params.settings,
    fileDate: params.fileDate,
    forceOwn: params.forceOwnTarget,
  };
}

/** The plan for an item's first note at `placed` (one note candidate). */
async function planNewNote(params: ItemNoteParams, placed: PlacedCandidate): Promise<ItemNotePlan> {
  const {itemPath, settings, tags, currentKeyword, isDated} = params;
  const setup = placed.candidate.setup;
  const setupName = setup ? setup.name : null;
  const background = backgroundOf(layoutFor(setup, params.pageKind, settings.noteSetupDefaults));

  if (!placed.shared) {
    const folderPath = relativeFolderPath(itemPath, params.subfolder);
    const fileName = await collisionFreeName(folderPath, params.baseName, '.note');
    const relativePath = `${params.subfolder}/${fileName}`;
    const absolutePath = `${folderPath}/${fileName}`;
    return {
      plan: {kind: 'new-own-file', file: relativePath, absolutePath, setupName},
      execute: async () => {
        const notePath = await createLinkedNote(itemPath, params.subfolder, params.baseName, background, fileName, contextTagsOf(tags));
        return {notePath, changed: true, isInitialPopulation: true, absolutePath, page: 0};
      },
    };
  }

  // A notebook (folder from the setup, created on first use) or the loop note (the owner's own folder).
  const {relativeFolder, fileName, relativeFile: relativeFilePath} = placed.shared;
  const loopNote = placed.loopNote;
  const folderPath = relativeFolderPath(itemPath, relativeFolder);
  const absoluteFile = `${folderPath}/${fileName}.note`;
  const notePath = buildSharedNoteAnchor(relativeFilePath, currentKeyword);

  if (!(await fileExists(absoluteFile))) {
    return {
      plan: {kind: 'new-shared-file', file: relativeFilePath, absolutePath: absoluteFile, setupName},
      execute: async () => {
        // A new loop note starts with the loop's own page (filled by the caller).
        const loopPage = loopNote && (await ensureLoopNoteFile(itemPath, loopNote, settings.noteSetupDefaults)) ? loopNote : undefined;
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
      plan: {kind: 'link-page', file: relativeFilePath, absolutePath: absoluteFile, setupName, keyword: currentKeyword},
      execute: async () => ({notePath, changed: true, isInitialPopulation: false, absolutePath: absoluteFile, page: existingPage}),
    };
  }
  return {
    plan: {kind: 'new-page', file: relativeFilePath, absolutePath: absoluteFile, setupName},
    execute: async () => {
      const page = await insertChronologicalPage(absoluteFile, currentKeyword, background, isDated);
      return {notePath, changed: true, isInitialPopulation: true, absolutePath: absoluteFile, page};
    },
  };
}

/**
 * Plans, asks for confirmation when the plan creates, recreates or links
 * something - for a first note with the choice of its alternatives - then
 * carries out the chosen place. `null` = the user cancelled: nothing was
 * written, and the item's existing link (if any) is untouched, so the next
 * tap asks again.
 */
export async function resolveItemNote(
  params: ItemNoteParams,
  confirmCreate: NoteCreateConfirm | undefined,
  logTag: string,
): Promise<ItemNoteAnchorResolution | null> {
  const {plan, execute} = await planItemNote(params);
  // Kind and counts only - file names carry client/meeting names (DEVELOPMENT-POLICY §5).
  log(`${logTag}: plan`, plan?.kind ?? 'open', `(alternatives ${plan?.alternatives?.length ?? 0})`);
  const choice = plan && confirmCreate ? await confirmCreate(plan) : 0;
  if (plan && choice === null) {
    log(`${logTag}: cancelled`, plan.kind);
    return null;
  }
  const chosen = choice ?? 0;
  const resolution = await execute(chosen);
  if (plan) log(`${logTag}: done`, plan.kind, `(choice ${chosen})`);
  return resolution;
}
