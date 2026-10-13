/**
 * Where a todo's or meeting's note can go, in the file system
 * (docs/dev/history/technical-design-note-setups.md §4.1, §4.4): the note
 * candidates of domain/noteSetups.ts placed under the item's folder - the
 * notebook file of a Thread setup, the loop note of an active loop, or the
 * item's own note - and the layout an existing note link uses. Reads only
 * the cache (synchronous); nothing here touches the file system.
 */
import {loopKindsOf} from '../domain/loops';
import {
  candidateForLink,
  distinctCandidates,
  layoutFor,
  NoteCandidate,
  noteCandidates,
  noteSetupConfig,
  setupSubtag,
  setupTypeTag,
} from '../domain/noteSetups';
import {PageLayout} from '../domain/pageLayout';
import {GtdParaSettings} from '../domain/settings';
import {renderSharedFileName} from '../domain/sharedNotePages';
import {activeLoopsOf, LoopNoteTarget, loopNoteTargetOf} from './loopNotes';
import {sanitizeFileNameComponent} from './noteLinks';
import {noteOwnerNames} from './noteOwner';

/** A note candidate with the file its note would live in. */
export interface PlacedCandidate {
  candidate: NoteCandidate;
  /**
   * Notebook or loop note: its folder relative to the item's folder ('' = the
   * item's root), its base name (no ".note") and the relative file. Null for
   * an own note, which is named per item when it is planned.
   */
  shared: {relativeFolder: string; fileName: string; relativeFile: string} | null;
  /** Target 'loop': the loop note. */
  loopNote?: LoopNoteTarget;
}

export interface NoteTargetInput {
  itemPath: string;
  tags: readonly string[];
  pageKind: 'meeting' | 'todo';
  settings: GtdParaSettings;
  /** YYYY-MM-DD for a notebook name's date placeholders - a meeting's own date, today for a todo. */
  fileDate: string;
  /** Inbox items: always their own note. */
  forceOwn: boolean;
}

/** The Default notebook's file name when its name renders empty. */
const DEFAULT_NOTEBOOK_FALLBACK = 'Notes';

/** The key two candidates share when they lead to the same note: the relative file, or one key for "the item's own note". */
const OWN_NOTE_KEY = '\u0000own';

export function noteFileKey(placed: PlacedCandidate): string {
  return placed.shared?.relativeFile ?? OWN_NOTE_KEY;
}

function place(candidate: NoteCandidate, input: NoteTargetInput, loops: ReturnType<typeof activeLoopsOf>): PlacedCandidate {
  const {setup} = candidate;
  if (candidate.target === 'loop' && candidate.loop) {
    const active = loops.find(l => l.loop.tag === candidate.loop?.tag);
    if (active) {
      const loopNote = loopNoteTargetOf(setup, active.loop, active.line, noteOwnerNames(input.itemPath));
      return {candidate, shared: {relativeFolder: '', fileName: loopNote.fileName, relativeFile: `${loopNote.fileName}.note`}, loopNote};
    }
  }
  const notebook = setup ? setup.notebook : input.settings.noteSetupDefaults.notebook;
  if (candidate.target === 'notebook' && notebook) {
    const name = setup ? setup.name : DEFAULT_NOTEBOOK_FALLBACK;
    // sanitizeFileNameComponent: the rendered name comes from user text (the
    // notebook name, the subtag) - strip illegal characters and '#' (the
    // anchor separator), and turn a deeper subtag's '/' into a space.
    const fileName = sanitizeFileNameComponent(
      renderSharedFileName({
        template: notebook.name.trim() ? notebook.name : name,
        fallbackName: name,
        tag: setupTypeTag(input.tags, setup?.tags ?? []),
        subtag: setupSubtag(input.tags, setup?.tags ?? []),
        date: input.fileDate,
        ...noteOwnerNames(input.itemPath),
      }),
    );
    const relativeFolder = notebook.folder;
    return {
      candidate,
      shared: {relativeFolder, fileName, relativeFile: relativeFolder ? `${relativeFolder}/${fileName}.note` : `${fileName}.note`},
    };
  }
  return {candidate: {...candidate, target: 'own'}, shared: null};
}

/** The places a first note of this item can go, best first, one per file (§4.1). */
export function placeNoteCandidates(input: NoteTargetInput): PlacedCandidate[] {
  const config = noteSetupConfig(input.settings);
  const loops = input.forceOwn ? [] : activeLoopsOf(input.itemPath, input.tags, loopKindsOf(config.setups));
  const candidates = noteCandidates({
    pageKind: input.pageKind,
    tags: input.tags,
    setups: config.setups,
    activeLoops: loops.map(l => l.loop),
    forceOwn: input.forceOwn,
    defaultNotebook: !!config.defaults.notebook,
  });
  return distinctCandidates(
    candidates.map(c => place(c, input, loops)),
    noteFileKey,
  );
}

/**
 * The layout of the page an existing note link points to (§4.1
 * `candidateForLink`): the candidate whose file is the linked one - an own
 * note when `linkedFile` is null - else the best candidate. A page whose
 * setup is gone falls back to the Default.
 */
export function layoutForLink(input: NoteTargetInput & {linkedFile: string | null}): PageLayout | null {
  const placed = placeNoteCandidates(input);
  const match = candidateForLink(placed, input.linkedFile ?? OWN_NOTE_KEY, noteFileKey);
  return layoutFor(match?.candidate.setup ?? null, input.pageKind, input.settings.noteSetupDefaults);
}
