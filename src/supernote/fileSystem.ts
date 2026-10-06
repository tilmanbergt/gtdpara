import {NativeModules} from 'react-native';
import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {ensureFileDeletePermission, ensureFileReadPermission, ensureFileWritePermission} from './pluginPermissions';
import {log, logError, logWarn} from '../utils/log';
import {perfEnd, perfStart} from '../utils/perf';
import {errorMessage} from '../utils/errorMessage';

export interface FolderEntry {
  name: string;
  path: string;
  isFolder: boolean;
}

export interface NoteTemplate {
  name: string;
  vUri: string;
  hUri: string;
}

/** One page keyword, exactly as `docs.supernote.com/.../plugin-file-api/get-key-words` describes it - `index` is 1-based within its page (what `deleteKeyWord` consumes), not a global count. */
export interface KeyWord {
  keyword: string;
  page: number;
  index: number;
}

/**
 * Fixed OS path where the Supernote's own MyStyle assets live (the same
 * folder `.snplg` builds are deployed to) - not a setting, unlike
 * `baseRoot`: nothing a user would want to redirect elsewhere. Used by the
 * meeting-note-template feature (docs/dev/technical-design-meeting-notes.md §1.2)
 * to list `.png` files a note-template setting can pick from.
 */
export const MYSTYLE_FOLDER = '/storage/emulated/0/MyStyle';

/**
 * Fixed, settings-independent home for on-device diagnostics: every event
 * `recordDebugLogEntry` logs (see its doc comment;
 * docs/dev/technical-design-shared-note-pages.md §4/§12), including the
 * host-side createNote rejection ("not allowed to use this API" - a gate in
 * HostCommImpl.checkAPIAvailable, unrelated to plugin.permission.FILE:WRITE,
 * that intermittently flips from denied to allowed within one app session).
 * A literal path (matching MYSTYLE_FOLDER's own convention above) rather
 * than `resolvePaths(settings).base` - deliberately NOT settings-dependent,
 * so this still works even if settings/base resolution is itself what's
 * broken, and entries land here whatever baseRoot is.
 *
 * Everything gtdpara exports lives under the device's EXPORT folder, not
 * under Note, so it doesn't fill the space used for working material:
 * EXPORT/gtdpara/debug (logs, bundles, reports, perf traces) and
 * EXPORT/gtdpara/profiles (docs/dev/technical-design-profiles-demo-space.md).
 */
export const GTDPARA_EXPORT_ROOT = '/storage/emulated/0/EXPORT/gtdpara';
const DEBUG_LOG_FOLDER = `${GTDPARA_EXPORT_ROOT}/debug`;

/** Same folder, for UI text and the debug tools (docs/dev/technical-design-about-debug-experimental.md). */
export const DEBUG_LOG_FOLDER_PATH = DEBUG_LOG_FOLDER;

/** Profile files (docs/dev/technical-design-profiles-demo-space.md §3.1). */
export const PROFILES_FOLDER_PATH = `${GTDPARA_EXPORT_ROOT}/profiles`;

/** "EXPORT/gtdpara/debug" - the part of a path a user sees in the Supernote file manager. */
export function displayPath(path: string): string {
  return path.replace(/^\/storage\/emulated\/0\//, '');
}

export const ELEMENT_TYPE_TEXT = 500;
export const ELEMENT_TYPE_LINK = 600;

/**
 * The universal element shape (docs.supernote.com/.../types/trail) every
 * visible item on a page is represented as - only the sub-fields this
 * codebase actually touches are typed here (not `stroke`/`geometry`/
 * `fiveStar`/`picture`/`title`/`recognizeResult`/`angles`/`contoursSrc` -
 * add them, typed for real against the docs, if something here ever needs
 * to read/write one of those). `userData` is the one field this whole
 * meeting-note-block feature is built around - a free-form string that
 * round-trips through getElements/insertElements/modifyElements untouched,
 * letting a plugin-inserted element be found again later by tag rather than
 * by position (docs/dev/technical-design-meeting-notes.md §3.1/§5.1's "why not
 * PluginNoteAPI.insertText" note - that convenience call has no such field).
 */
export interface Element {
  uuid: string;
  type: number;
  pageNum: number;
  layerNum: number;
  /** 1-indexed position within the page - what deleteElements' numsInPage array actually identifies (NOT uuid, despite uuid existing on this type too). */
  numInPage: number;
  /**
   * Free-form marker this plugin sets on elements it inserts. Absent
   * (undefined/null) on every element it did NOT write - handwriting strokes,
   * textboxes the user typed - so anything READING this off a getElements
   * result must treat it as optional (an unguarded `.startsWith` on it would
   * crash re-opening a meeting note). Writing a string to it, as
   * createElement callers do, is fine.
   */
  userData?: string | null;
  textBox: ElementTextBox | null;
  link: ElementLink | null;
  /** Present on the real API response; deliberately untyped (`unknown`) here since nothing in this codebase reads it yet. */
  status?: unknown;
  maxX?: number;
  maxY?: number;
  thickness?: number;
}

/**
 * A top-left/bottom-right box - Rect (docs.supernote.com/.../types/rect) is
 * `{left, top, right, bottom}`, NOT `{x, y, width, height}`: passing an
 * `{x,y,width,height}` object as textRect fails on the device with
 * "textRect.left is required". Use toRect() below to build one from
 * a left/top/width/height box (the shape settings.ts's
 * meetingNoteBlockTopX/Y/MaxWidth naturally produce) rather than
 * constructing this by hand at each call site.
 */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** `{left, top, width, height}` -> Rect. The one conversion point every caller building a textRect should go through (and Element.link too, should it turn out to want a Rect rather than its documented flat X/Y/width/height - unconfirmed), rather than hand-computing `right`/`bottom` inline. */
export function toRect(left: number, top: number, width: number, height: number): Rect {
  return {left, top, right: left + width, bottom: top + height};
}

/** Field names/order confirmed against https://docs.supernote.com/en/api-reference/supernote-plugin/types/text-box - NOT the same shape as PluginNoteAPI.insertText's standalone `textBox` param (that one has no `textDigestData`; that one's `textRect` was assumed to match this one's - unconfirmed either way, since insertText itself is unused by this codebase, see the "why not PluginNoteAPI" note near insertElements below). */
export interface ElementTextBox {
  fontSize: number;
  fontPath: string | null;
  textContentFull: string | null;
  textRect: Rect;
  textDigestData: string | null;
  textAlign: number;
  textBold: number;
  textItalics: number;
  textFrameWidthType: number;
  textFrameStyle: number;
  /** 1 = user can tap in and edit normally afterward (what this feature wants - the block stays a real, editable Supernote textbox, not a locked/baked-in one), 0 = not editable. Exact accepted values unconfirmed against the docs (only the field's existence is documented) - 0/1 is a working guess. */
  textEditable: number;
}

/**
 * Field names/order confirmed against https://docs.supernote.com/en/api-
 * reference/supernote-plugin/types/link - deliberately DIFFERENT shape from
 * PluginNoteAPI.insertTextLink's standalone param (that one nests `rect:
 * Rect`; this one is flat X/Y/width/height/page, and adds `category`/
 * `controlTrailNums` that the convenience call doesn't expose at all).
 * `category`/`style` meanings are undocumented beyond "number" - 0 is used
 * for both as a neutral default (docs/dev/technical-design-meeting-notes.md §8).
 */
export interface ElementLink {
  category: number;
  X: number;
  Y: number;
  width: number;
  height: number;
  page: number;
  style: number;
  /** 1 = other note file, 2 = document (with page nav), 3 = image file, 4 = URL - per docs.supernote.com's insertTextLink page; unconfirmed whether Element.link's own linkType uses the identical numbering (it's presented as the same conceptual field, but insertTextLink and Element.link are documented on separate pages with no cross-reference either way). */
  linkType: number;
  destPath: string;
  destPage: number;
  fontSize: number;
  fullText: string;
  showText: string;
  italic: number;
  controlTrailNums: number[];
}

interface GtdParaFileNativeModule {
  listFolderEntries(folderPath: string): Promise<FolderEntry[]>;
  readTextFile(path: string): Promise<string | null>;
  writeTextFile(path: string, content: string): Promise<boolean>;
  ensureFolder(path: string): Promise<boolean>;
  moveFolder(fromPath: string, toPath: string): Promise<boolean>;
  moveFile(fromPath: string, toPath: string): Promise<boolean>;
  moveFolderMerge(fromPath: string, toPath: string): Promise<boolean>;
  deleteTempTree(path: string): Promise<boolean>;
  /** InkHub compliance; missing on older native builds. */
  getPrivateTempDir?(): Promise<string>;
  /** technical-design-lasso-0.8.md §3.3; missing on native builds before 0.8.0. */
  getPrivateDataDir?(): Promise<string>;
  /** Recursive delete strictly inside the private data folder; missing on native builds before 0.8.0. */
  deletePrivateDataTree?(path: string): Promise<boolean>;
  /** Deletes an EMPTY folder only; missing on older native builds. */
  deleteEmptyFolder?(path: string): Promise<boolean>;
  writeBinaryFile(path: string, base64Content: string): Promise<boolean>;
  /** Debug-log sink; missing on older native builds. */
  appendTextFile?(path: string, content: string, maxBytes: number): Promise<number>;
  /** technical-design-files-0.6.md §3.1; missing on native builds before 0.6.0. */
  statFiles?(paths: string[]): Promise<FileStat[]>;
}

const {GtdParaFile} = NativeModules as {GtdParaFile?: GtdParaFileNativeModule};

// ---- folder-change notifications ----
// File-creating and moving calls below report the folder(s) they changed, so
// a live folder listing (ui/FileBrowserPane.tsx) can rescan the folder it is
// showing instead of waiting for the user to navigate away and back (e.g. a
// Quick Add note appears in the Files pane right away). Plain
// text writes (project.txt saves) deliberately do NOT notify - they never
// add a file the user browses for, and a rescan per todo edit would flicker.

type FolderChangeListener = (folderPath: string) => void;
const folderChangeListeners = new Set<FolderChangeListener>();

function parentFolder(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(0, Math.max(0, trimmed.lastIndexOf('/')));
}

/** Subscribe to "a file or folder was created/moved in this folder". Returns the unsubscribe function. */
export function subscribeFolderChanges(listener: FolderChangeListener): () => void {
  folderChangeListeners.add(listener);
  return () => {
    folderChangeListeners.delete(listener);
  };
}

function notifyFolderChanged(...paths: string[]): void {
  for (const path of paths) {
    const folder = path.replace(/\/+$/, '');
    folderChangeListeners.forEach(listener => {
      try {
        listener(folder);
      } catch (e) {
        logError('notifyFolderChanged: listener threw', errorMessage(e));
      }
    });
  }
}

/**
 * Lists one folder level via the native GtdParaFile module. Resolves to an
 * empty array if the folder doesn't exist yet (rather than throwing), since
 * "not created yet" is an expected state for a Project/Area root, not an
 * error condition.
 */
export async function listFolderEntries(folderPath: string): Promise<FolderEntry[]> {
  if (!GtdParaFile) {
    logError('listFolderEntries: GtdParaFile native module is not registered');
    throw new Error('GtdParaFile native module is not available on this build.');
  }
  if (!(await ensureFileReadPermission())) {
    logError('listFolderEntries: file read permission not granted', folderPath);
    throw new Error('File read permission was not granted.');
  }
  log('listFolderEntries: start', folderPath);
  const perfToken = perfStart();
  try {
    const entries = await GtdParaFile.listFolderEntries(folderPath);
    perfEnd('io:list', perfToken, {path: folderPath, entries: entries.length});
    log('listFolderEntries: done', folderPath, `${entries.length} entries`);
    return entries;
  } catch (e) {
    logError(
      'listFolderEntries: failed',
      folderPath,
      errorMessage(e),
    );
    throw e;
  }
}

/** Last-modified time (ms) and size (bytes) of one path; a missing path has exists=false, lastModified=0, size=-1. */
export interface FileStat {
  path: string;
  exists: boolean;
  lastModified: number;
  size: number;
}

/**
 * Stats many files in ONE native call (docs/dev/technical-design-files-0.6.md
 * §3.1) - what storage/dataCache.ts's refreshCache uses to see which data
 * files changed since they were read. Resolves `null` on a native build that
 * doesn't have the call yet, so the caller can fall back to a full re-read.
 */
export async function statFiles(paths: string[]): Promise<FileStat[] | null> {
  if (!GtdParaFile?.statFiles) {
    logWarn('statFiles: not available on this native build');
    return null;
  }
  if (!(await ensureFileReadPermission())) {
    logError('statFiles: file read permission not granted');
    throw new Error('File read permission was not granted.');
  }
  const perfToken = perfStart();
  try {
    const stats = await GtdParaFile.statFiles(paths);
    perfEnd('io:stat', perfToken, {files: paths.length});
    return stats;
  } catch (e) {
    logError('statFiles: failed', `${paths.length} paths`, errorMessage(e));
    throw e;
  }
}

/**
 * Whether a FILE (not a folder) exists at exactly this absolute path.
 * Implemented via `listFolderEntries` on the parent folder rather than a
 * dedicated host existence call - the SDK exposes none - which also means
 * this inherits `listFolderEntries`'s own "missing parent folder resolves
 * to `[]`, not a throw" behavior, so a path under a folder that doesn't
 * exist at all correctly comes back `false` rather than erroring.
 *
 * Used by `storage/noteLinks.ts`'s `resolveNotePath`, to verify a
 * `parseSharedNoteAnchor` guess actually resolves to a real file before
 * trusting it over the plain reading, and `storage/integrityCheck.ts`'s
 * `hashNotePath` check, to tell a genuinely broken/orphaned notePath apart
 * from one that `resolveNotePath`'s fallback already handles fine.
 */
export async function fileExists(path: string): Promise<boolean> {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash < 0) return false;
  const parent = path.slice(0, lastSlash);
  const name = path.slice(lastSlash + 1);
  const entries = await listFolderEntries(parent);
  return entries.some(e => !e.isFolder && e.name === name);
}

/**
 * Same idea as fileExists, but for a folder (e.g. a Project/Area's
 * `defaultResourceFolder`, which names a Resources subfolder, not a file) -
 * lists the parent and looks for a matching entry with isFolder true instead
 * of false. Used by domain/integrityCheck.ts's defaultResourceFolderMissing
 * check ([[feature_integrity_check]]).
 */
export async function folderExists(path: string): Promise<boolean> {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash < 0) return false;
  const parent = path.slice(0, lastSlash);
  const name = path.slice(lastSlash + 1);
  const entries = await listFolderEntries(parent);
  return entries.some(e => e.isFolder && e.name === name);
}

/**
 * Opens a file (a Supernote .note, a PDF, anything the host recognizes) via
 * the official PluginFileAPI.openFile call — no custom native module needed
 * for this, unlike listFolderEntries. `page: -1` keeps whatever page the
 * host last had open for that file rather than jumping anywhere specific;
 * jumping to a *particular* page (e.g. a logged meeting occurrence) is a
 * separate, later concern that would pass a real page index instead.
 */
export async function openPath(path: string, page = -1): Promise<void> {
  const granted = await ensureFileReadPermission();
  if (!granted) {
    logError('openPath: file read permission not granted', path);
    throw new Error('File read permission was not granted.');
  }
  log('openPath: start', path, `page=${page}`);
  const start = Date.now();
  // Told *before* the host call, not after: once openFile succeeds the host
  // may hide/freeze the plugin at once, so this is the last moment we're
  // guaranteed to run. The observer's rollback (if any) undoes its
  // bookkeeping when the open then fails.
  const rollback = openPathObserver?.onOpening(path);
  let response:
    | {success: boolean; error?: {code: number; message: string} | null}
    | null
    | undefined;
  try {
    response = (await PluginFileAPI.openFile(path, page)) as typeof response;
  } catch (e) {
    rollback?.();
    // Diagnostic - see getElements' own comment (above, this
    // file) for why. A thrown (not just unsuccessful) openFile call gets
    // its own entry too, same as the other two - errorMessage from
    // whatever the exception itself carries.
    await recordDebugLogEntry('openPath', false, Date.now() - start, {
      path,
      page,
      errorMessage: errorMessage(e),
    });
    throw e;
  }
  const durationMs = Date.now() - start;
  if (!response || !response.success) {
    rollback?.();
    const message = response?.error?.message || 'Could not open this file.';
    logError('openPath: failed', path, message);
    await recordDebugLogEntry('openPath', false, durationMs, {path, page, errorMessage: message});
    throw new Error(message);
  }
  log('openPath: done', path);
  await recordDebugLogEntry('openPath', true, durationMs, {path, page});
}

/**
 * Hook letting the app layer learn about every file the plugin opens
 * itself, without this module importing anything from storage/ or App.tsx
 * (storage/ already imports supernote/, never the other way round). Used by
 * App.tsx to feed storage/returnRecord.ts - docs/dev/technical-design-return-to-
 * origin.md §6. Every in-plugin open already funnels through openPath, so
 * no call site needs to change.
 */
export interface OpenPathObserver {
  /** Called after the read-permission check, immediately before PluginFileAPI.openFile. May return a function that undoes whatever it recorded, called if the host then fails to open the file. */
  onOpening(path: string): (() => void) | void;
}

let openPathObserver: OpenPathObserver | null = null;

/** Registers (or, with null, removes) the single observer openPath() notifies. */
export function setOpenPathObserver(observer: OpenPathObserver | null): void {
  openPathObserver = observer;
}

/**
 * Reads a whole text file (a project.txt/area.txt). Resolves `null` when
 * the file doesn't exist yet, same "not created yet, not an error" stance
 * as listFolderEntries - a Project/Area with no todos or meetings added
 * yet simply has no data file.
 */
export async function readTextFile(path: string): Promise<string | null> {
  if (!GtdParaFile) {
    logError('readTextFile: GtdParaFile native module is not registered');
    throw new Error('GtdParaFile native module is not available on this build.');
  }
  const granted = await ensureFileReadPermission();
  if (!granted) {
    logError('readTextFile: file read permission not granted', path);
    throw new Error('File read permission was not granted.');
  }
  log('readTextFile: start', path);
  const perfToken = perfStart();
  try {
    const content = await GtdParaFile.readTextFile(path);
    perfEnd('io:read', perfToken, {path, chars: content == null ? null : content.length});
    log('readTextFile: done', path, content == null ? 'missing' : `${content.length} chars`);
    return content;
  } catch (e) {
    logError('readTextFile: failed', path, errorMessage(e));
    throw e;
  }
}

/**
 * Overwrites a whole text file (creating it, and any missing parent
 * folders, if needed). Callers pass the *entire* new file content -
 * domain/markdown.ts computes that from the current content plus one
 * span-scoped change, this function has no notion of partial writes.
 */
export async function writeTextFile(path: string, content: string): Promise<void> {
  if (!GtdParaFile) {
    logError('writeTextFile: GtdParaFile native module is not registered');
    throw new Error('GtdParaFile native module is not available on this build.');
  }
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('writeTextFile: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('writeTextFile: start', path, `${content.length} chars`);
  try {
    await GtdParaFile.writeTextFile(path, content);
    log('writeTextFile: done', path);
  } catch (e) {
    logError('writeTextFile: failed', path, errorMessage(e));
    throw e;
  }
}

/**
 * Creates `path` as a folder (and any missing parents) if it doesn't exist
 * yet. Used before creating a linked note in a Project/Area's "Meetings"/
 * "Todos" subfolder, since PluginFileAPI.createNote's own folder-creation
 * behavior for a brand-new destination folder isn't documented.
 */
export async function ensureFolderExists(path: string): Promise<void> {
  if (!GtdParaFile) {
    logError('ensureFolderExists: GtdParaFile native module is not registered');
    throw new Error('GtdParaFile native module is not available on this build.');
  }
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('ensureFolderExists: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('ensureFolderExists: start', path);
  try {
    await GtdParaFile.ensureFolder(path);
    log('ensureFolderExists: done', path);
  } catch (e) {
    logError('ensureFolderExists: failed', path, errorMessage(e));
    throw e;
  }
}

/**
 * Writes `base64Content` (already-encoded bytes, e.g. a Gmail attachment
 * fetched via gmailImapNative.ts's fetchAttachment) to `path`, creating any
 * missing parent folders first - the binary counterpart of writeTextFile
 * above. Used by storage/gmailAttachments.ts's saveGmailAttachment:
 * PluginFileAPI has no generic binary-file write (only .note pages/
 * elements), and writeTextFile's own native implementation is text-only, so
 * this is a plain File.* operation in the plugin's own native module (as
 * moveFolder is for Archive).
 */
export async function writeBinaryFile(path: string, base64Content: string): Promise<void> {
  if (!GtdParaFile) {
    logError('writeBinaryFile: GtdParaFile native module is not registered');
    throw new Error('GtdParaFile native module is not available on this build.');
  }
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('writeBinaryFile: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('writeBinaryFile: start', path, `${base64Content.length} base64 chars`);
  try {
    await GtdParaFile.writeBinaryFile(path, base64Content);
    log('writeBinaryFile: done', path);
    notifyFolderChanged(parentFolder(path));
  } catch (e) {
    logError('writeBinaryFile: failed', path, errorMessage(e));
    throw e;
  }
}

/**
 * Moves a Project/Area folder from `fromPath` to `toPath` - the physical
 * half of archiving (storage/archive.ts's archiveItem). Backed by the
 * native module's own `moveFolder` (a plain `File.renameTo()` - same
 * storage volume, atomic, no third-party SDK involved), not
 * `PluginFileAPI`. Rejects rather than silently no-oping if the native
 * side reports `false`: the caller treats a resolved call as proof the
 * folder is really gone from its old location, so a swallowed failure here
 * would leave the app believing an archive succeeded when nothing moved.
 */
export async function moveFolder(fromPath: string, toPath: string): Promise<void> {
  if (!GtdParaFile) {
    logError('moveFolder: GtdParaFile native module is not registered');
    throw new Error('GtdParaFile native module is not available on this build.');
  }
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('moveFolder: file write permission not granted', fromPath, toPath);
    throw new Error('File write permission was not granted.');
  }
  log('moveFolder: start', fromPath, '->', toPath);
  try {
    await GtdParaFile.moveFolder(fromPath, toPath);
    log('moveFolder: done', fromPath, '->', toPath);
    notifyFolderChanged(parentFolder(fromPath), parentFolder(toPath), fromPath);
  } catch (e) {
    logError('moveFolder: failed', fromPath, '->', toPath, errorMessage(e));
    throw e;
  }
}

/**
 * Moves one FILE (docs/dev/technical-design-project-close-out.md §2.2 - outcome
 * moves and the project PDF). Never overwrites: rejects if `toPath` exists.
 * Missing parent folders are created. Same permission/logging shape as
 * moveFolder.
 */
export async function moveFile(fromPath: string, toPath: string): Promise<void> {
  if (!GtdParaFile) throw new Error('GtdParaFile native module is not available on this build.');
  if (!(await ensureFileWritePermission())) throw new Error('File write permission was not granted.');
  log('moveFile: start', fromPath, '->', toPath);
  try {
    await GtdParaFile.moveFile(fromPath, toPath);
    log('moveFile: done', fromPath, '->', toPath);
    notifyFolderChanged(parentFolder(fromPath), parentFolder(toPath));
  } catch (e) {
    logError('moveFile: failed', fromPath, '->', toPath, errorMessage(e));
    throw e;
  }
}

/**
 * Like moveFolder, but merges into `toPath` when it already exists (Area
 * archive into Archive/<year>/<Area>/, which may already hold archived
 * projects - close-out design §2.2). Rejects before moving anything if any
 * top-level name collides.
 */
export async function moveFolderMerge(fromPath: string, toPath: string): Promise<void> {
  if (!GtdParaFile) throw new Error('GtdParaFile native module is not available on this build.');
  if (!(await ensureFileWritePermission())) throw new Error('File write permission was not granted.');
  log('moveFolderMerge: start', fromPath, '->', toPath);
  try {
    await GtdParaFile.moveFolderMerge(fromPath, toPath);
    log('moveFolderMerge: done', fromPath, '->', toPath);
    notifyFolderChanged(parentFolder(fromPath), toPath, fromPath);
  } catch (e) {
    logError('moveFolderMerge: failed', fromPath, '->', toPath, errorMessage(e));
    throw e;
  }
}

let privateTempDir: string | null = null;

/**
 * gtdpara's temp folder inside the plugin's PRIVATE folder
 * (`.../files/plugins/<pluginID>/tmp`) - exempt from every plugin
 * permission and never visible in the user's file manager
 * (docs/dev/technical-design-inkhub-submission.md §3.2). Rendered PDF pages
 * live here, never under Note.
 */
export async function getPrivateTempDir(): Promise<string> {
  if (privateTempDir) return privateTempDir;
  if (!GtdParaFile?.getPrivateTempDir) throw new Error('getPrivateTempDir is not available on this build.');
  privateTempDir = await GtdParaFile.getPrivateTempDir();
  log('getPrivateTempDir:', privateTempDir);
  return privateTempDir;
}

/**
 * Recursively deletes a folder inside gtdpara's PRIVATE temp folder. The
 * native side refuses any path outside it, so this can never reach user
 * files and needs no permission. Never throws - leftover temp files are
 * harmless and must not turn into a user-facing failure.
 */
export async function deleteTempTree(path: string): Promise<void> {
  if (!GtdParaFile) return;
  try {
    await GtdParaFile.deleteTempTree(path);
  } catch (e) {
    logError('deleteTempTree: failed', path, errorMessage(e));
  }
}

let privateDataDir: string | null = null;

/**
 * gtdpara's own data folder inside the plugin's PRIVATE folder
 * (`.../files/plugins/<pluginID>/data`) - unlike the temp folder it is not
 * cleared on start. Holds the picture and stroke data of open "Mark for
 * later" marks (docs/dev/technical-design-lasso-0.8.md §3.3). Like the temp
 * folder it needs no permission and isn't visible in the file manager.
 */
export async function getPrivateDataDir(): Promise<string> {
  if (privateDataDir) return privateDataDir;
  if (!GtdParaFile?.getPrivateDataDir) throw new Error('getPrivateDataDir is not available on this build.');
  privateDataDir = await GtdParaFile.getPrivateDataDir();
  log('getPrivateDataDir:', privateDataDir);
  return privateDataDir;
}

/**
 * Recursively deletes a folder inside gtdpara's PRIVATE data folder (a
 * processed mark's data). The native side refuses any path outside it.
 * Never throws: leftover data is harmless and is cleaned up later.
 */
export async function deletePrivateDataTree(path: string): Promise<boolean> {
  if (!GtdParaFile?.deletePrivateDataTree) return false;
  try {
    return await GtdParaFile.deletePrivateDataTree(path);
  } catch (e) {
    logError('deletePrivateDataTree: failed', path, errorMessage(e));
    return false;
  }
}

/**
 * Deletes an EMPTY folder in shared storage. Only call this after the user
 * confirmed it (storage/deletions.ts's deleteEmptyFoldersConfirmed does
 * both): it requests FILE:DELETE with `reason` - a text naming what will be
 * deleted - and the native side refuses anything that isn't an empty folder.
 * Returns false (and logs) when the permission is refused or the folder is
 * not empty; throws only when the native call itself fails.
 */
export async function deleteEmptyFolder(path: string, reason: string): Promise<boolean> {
  if (!GtdParaFile?.deleteEmptyFolder) throw new Error('deleteEmptyFolder is not available on this build.');
  if (!(await ensureFileDeletePermission(reason))) {
    log('deleteEmptyFolder: delete permission not granted, folder kept', path);
    return false;
  }
  try {
    await GtdParaFile.deleteEmptyFolder(path);
    log('deleteEmptyFolder: done', path);
    notifyFolderChanged(parentFolder(path));
    return true;
  } catch (e) {
    const code = (e as {code?: string} | null)?.code;
    if (code === 'E_NOT_EMPTY') {
      logWarn('deleteEmptyFolder: folder is not empty, kept', path);
      return false;
    }
    logError('deleteEmptyFolder: failed', path, errorMessage(e));
    throw e;
  }
}

/**
 * The built-in note templates the host offers (PluginCommAPI's own call) -
 * for picking a default template when creating a linked note, since
 * PluginFileAPI.createNote requires a non-empty template name and there's
 * no "just give me a blank note" shortcut.
 */
export async function getNoteSystemTemplates(): Promise<NoteTemplate[]> {
  log('getNoteSystemTemplates: start');
  try {
    const templates = (await PluginCommAPI.getNoteSystemTemplates()) as NoteTemplate[] | null | undefined;
    const result = templates ?? [];
    log('getNoteSystemTemplates: done', `${result.length} templates`);
    return result;
  } catch (e) {
    logError('getNoteSystemTemplates: failed', errorMessage(e));
    throw e;
  }
}

// Per-JS-process identifiers so host-call log lines from the same app session
// can be correlated ("was this the 1st or 5th logged call since this process
// started", "how many ms after cold start"). A fresh id/counter each time this
// module is loaded (i.e. each PluginHost process).
const DEBUG_SESSION_ID = Math.random().toString(36).slice(2, 8);
const DEBUG_SESSION_START_MS = Date.now();
let debugAttemptSeq = 0;

/**
 * Logs one host-API call (openPath, createNote, getElements, insertElements
 * and the shared-note page engine) with its result, timing and launch
 * context - success AND failure, since comparing the two is the point
 * (bugfix_createnote_blocked).
 *
 * Writes ONE log line through utils/log.ts: always in the in-memory ring
 * buffer (debug bundle), and in the log file only while the user has
 * switched on Debug logging - never a file of its own, since unannounced
 * file activity is ruled out by the InkHub review and our transparency rule
 * (docs/dev/technical-design-inkhub-submission.md §3.8). Never throws.
 */
export async function recordDebugLogEntry(
  event: string,
  ok: boolean,
  durationMs: number,
  fields: Record<string, string | number | boolean | undefined>,
): Promise<void> {
  debugAttemptSeq += 1;
  // What rememberLaunchNotePath (App.tsx's reorient(), on cold start and on
  // every sidebar-button press) last captured - the file the plugin was
  // opened from. Its extension (.note vs .pdf) is the closest proxy JS has
  // for "which host app resolved this call" (NOTE vs. DOC context).
  const launch = getRememberedLaunchNotePath();
  const coldStart = getRememberedColdStartNotePath();
  const detail = Object.entries(fields)
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join(' ');
  const context =
    `session=${DEBUG_SESSION_ID} seq=${debugAttemptSeq} sinceStartMs=${Date.now() - DEBUG_SESSION_START_MS}` +
    ` launch=${launch ? launch.path ?? '(Home)' : '(not captured)'}` +
    ` coldStart=${coldStart ? coldStart.path ?? '(Home)' : '(not captured)'}`;
  if (ok) log(`hostCall: ${event} OK`, `${durationMs}ms`, detail, context);
  else logWarn(`hostCall: ${event} FAIL`, `${durationMs}ms`, detail, context);
}

/** Where utils/perf.ts's trace files land (docs/dev/technical-design-perf-tracing.md §4). */
export const PERF_LOG_FOLDER = `${DEBUG_LOG_FOLDER}/perf`;
let perfFolderEnsured = false;

/**
 * Writes one finished performance-trace file (utils/perf.ts, injected via
 * perfConfigure in App.tsx). Same raw GtdParaFile calls as
 * recordDebugLogEntry above - no log() lines, so writing a trace never shows
 * up as noise in the next trace's console counters. Only ever called after
 * a trace has ended (never during a measured tab switch). Throws on failure;
 * perf.ts reports it via its onError hook.
 */
export async function writePerfTraceFile(fileName: string, content: string): Promise<void> {
  if (!GtdParaFile) throw new Error('GtdParaFile native module is not available on this build.');
  if (!(await ensureFileWritePermission())) throw new Error('File write permission was not granted.');
  if (!perfFolderEnsured) {
    await GtdParaFile.ensureFolder(PERF_LOG_FOLDER);
    perfFolderEnsured = true;
  }
  await GtdParaFile.writeTextFile(`${PERF_LOG_FOLDER}/${fileName}`, content);
}

/**
 * Writes the Integrity Check's (docs/dev/technical-design-integrity-check.md,
 * storage/integrityCheck.ts) single summary report for one run to
 * DEBUG_LOG_FOLDER. Unlike recordDebugLogEntry above - errors swallowed so a
 * failed diagnostic never becomes a user-facing failure - this IS the
 * user-facing feature itself: a failed write here should surface to whoever
 * just tapped the button, so it throws rather than swallowing. Reuses the
 * already-permission-checked, already-logged writeTextFile (which creates
 * DEBUG_LOG_FOLDER itself if missing) - this isn't a hot-path call, so the
 * extra permission-check/log overhead doesn't matter. The filename includes
 * a filesystem-safe timestamp (colons/dots replaced) so repeated runs never
 * collide.
 */
export async function writeIntegrityCheckReport(content: string): Promise<string> {
  const fileName = `integrity-check-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  await writeTextFile(`${DEBUG_LOG_FOLDER}/${fileName}`, content);
  return fileName;
}

/**
 * Creates a real Supernote .note file at `path` using `template`. This
 * expects one of the *names* getNoteSystemTemplates() reports (e.g.
 * "style_8mm_ruled_line") - passing a vUri/hUri resource reference instead
 * fails with "Background template file does not exist", since createNote
 * doesn't resolve those. This is the official note-creation call, not our
 * own text-file I/O - it needs FILE:WRITE the same way writing a
 * project.txt does, since it's putting a new file on disk in the user's
 * Note folder.
 */
export async function createNote(
  path: string,
  template: string,
  isPortrait = true,
): Promise<void> {
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('createNote: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('createNote: start', path, template);
  const start = Date.now();
  const response = (await PluginFileAPI.createNote({
    notePath: path,
    template,
    mode: 0,
    isPortrait,
  })) as {success: boolean; result?: boolean; error?: {code: number; message: string} | null} | null | undefined;
  const durationMs = Date.now() - start;
  if (!response || !response.success || response.result === false) {
    const hostMessage = response?.error?.message || 'Could not create the note.';
    logError('createNote: failed', path, hostMessage);
    await recordDebugLogEntry('createNote', false, durationMs, {notePath: path, template, isPortrait, errorMessage: hostMessage});
    // ensureFileWritePermission() above already succeeded by this point, so
    // every failure reaching here is the "granted != allowed" situation (a
    // second, separate host-side gate in HostCommImpl.checkAPIAvailable,
    // unrelated to plugin.permission.FILE:WRITE) - the plain host message
    // alone reads like a permission problem and sends people chasing the
    // wrong thing, so lead with the actual shape of the failure and keep the
    // host's own wording attached for debugging/searchability.
    throw new Error(`Though write permission is granted, note creation was blocked by the device: ${hostMessage}`);
  }
  log('createNote: done', path);
  notifyFolderChanged(parentFolder(path));
  await recordDebugLogEntry('createNote', true, durationMs, {notePath: path, template, isPortrait});
}

/** Rejects if `promise` has not settled after `timeoutMs`. The underlying call is NOT cancelled - the caller aborts its whole flow on this error. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** insertNotePage has been seen to hang (sister project NoteDraft/textboxHelper needed the same guard). */
const INSERT_NOTE_PAGE_TIMEOUT_MS = 8000;

/**
 * Inserts a blank page into the note at `path` at zero-indexed position
 * `page` - appending when `page` equals the current page count - using
 * `template` (a template *name* such as "style_white", like createNote).
 * Same permission check and error mapping as createNote, plus an 8 s timeout
 * per call. Used by storage/textNote.ts to build multi-page text notes.
 */
export async function insertNotePage(path: string, page: number, template: string): Promise<void> {
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('insertNotePage: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('insertNotePage: start', path, `page=${page}`, template);
  const response = (await withTimeout(
    PluginFileAPI.insertNotePage({notePath: path, page, template}) as Promise<unknown>,
    INSERT_NOTE_PAGE_TIMEOUT_MS,
    `Timeout adding page ${page + 1} to the note.`,
  )) as {success: boolean; result?: boolean; error?: {code: number; message: string} | null} | null | undefined;
  if (!response || !response.success || response.result === false) {
    const message = response?.error?.message || `Could not add page ${page + 1} to the note.`;
    logError('insertNotePage: failed', path, `page=${page}`, message);
    throw new Error(message);
  }
  log('insertNotePage: done', path, `page=${page}`);
}

/**
 * Sets a real Supernote keyword/tag on `path`'s `page` (zero-indexed) - the
 * device's own note-tagging mechanism, distinct from this app's own
 * `#context` markdown tags embedded in project.txt/area.txt text
 * (domain/markdown.ts's extractContextTags). Used by
 * storage/standaloneNotes.ts's createStandaloneNote for the "Note" quick-add
 * tab and by the shared-note page engine. Signature confirmed against
 * https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-file-api/insert-key-word -
 * `getKeyWords`/`deleteKeyWord` (docs/dev/technical-design-shared-note-pages.md
 * §4) are wrapped below.
 */
export async function insertKeyWord(path: string, page: number, keyword: string): Promise<void> {
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('insertKeyWord: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('insertKeyWord: start', path, `page=${page}`, keyword);
  const response = (await PluginFileAPI.insertKeyWord(path, page, keyword)) as
    | {success: boolean; result?: boolean; error?: {code: number; message: string} | null}
    | null
    | undefined;
  if (!response || !response.success || response.result === false) {
    const message = response?.error?.message || 'Could not add the keyword.';
    logError('insertKeyWord: failed', path, keyword, message);
    throw new Error(message);
  }
  log('insertKeyWord: done', path, keyword);
}

/**
 * Reads every keyword on `path`'s pages in `pageList` (each 0-indexed) in
 * ONE call - docs/dev/technical-design-shared-note-pages.md §4's page engine
 * builds `pageList` as every page (0..getNoteTotalPageNum-1) so a shared
 * note's whole keyword index comes back in a single round trip, never one
 * call per page. Signature confirmed against
 * https://docs.supernote.com/en/api-reference/supernote-plugin/plugin-file-api/get-key-words.
 * Resolves `[]` (not an error) when `pageList` is empty or the file has no
 * keywords at all - callers distinguish "no keywords" from "call failed" the
 * same way every other read wrapper here does (via the thrown error).
 */
export async function getKeyWords(path: string, pageList: number[]): Promise<KeyWord[]> {
  const granted = await ensureFileReadPermission();
  if (!granted) {
    logError('getKeyWords: file read permission not granted', path);
    throw new Error('File read permission was not granted.');
  }
  log('getKeyWords: start', path, `${pageList.length} pages`);
  const response = (await PluginFileAPI.getKeyWords(path, pageList)) as
    | {success: boolean; result?: KeyWord[] | null; error?: {code: number; message: string} | null}
    | null
    | undefined;
  if (!response || !response.success) {
    const message = response?.error?.message || 'Could not read this note\'s keywords.';
    logError('getKeyWords: failed', path, message);
    throw new Error(message);
  }
  const result = response.result ?? [];
  log('getKeyWords: done', path, `${result.length} keywords`);
  return result;
}

/**
 * Removes the keyword at `path`'s `page` whose 1-indexed `KeyWord.index` is
 * `index` (NOT a 0-indexed array position - `index` is exactly the field a
 * prior `getKeyWords` result already carries per keyword, meant to be passed
 * straight through, same "the API's own index field is load-bearing"
 * pattern as `deleteElements`' `numInPage` for elements).
 * Signature confirmed against the `sn-plugin-lib` 0.1.65 typings
 * (`deleteKeyWord(notePath, page, index): Promise<APIResponse<boolean>>`);
 * its docs.supernote.com reference page was not checked.
 */
export async function deleteKeyWord(path: string, page: number, index: number): Promise<void> {
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('deleteKeyWord: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('deleteKeyWord: start', path, `page=${page}`, `index=${index}`);
  const response = (await PluginFileAPI.deleteKeyWord(path, page, index)) as
    | {success: boolean; result?: boolean; error?: {code: number; message: string} | null}
    | null
    | undefined;
  if (!response || !response.success || response.result === false) {
    const message = response?.error?.message || 'Could not remove the keyword.';
    logError('deleteKeyWord: failed', path, `page=${page}`, message);
    throw new Error(message);
  }
  log('deleteKeyWord: done', path, `page=${page}`);
}

/**
 * Total page count of the note/doc at `path` - the shared-note-pages page
 * engine's own building block for turning "every keyword on file" into a
 * concrete `pageList` (`[0..count-1]`) to pass to `getKeyWords`, and for
 * knowing where "append at the end" actually is. Signature confirmed
 * against the `sn-plugin-lib` 0.1.65 typings (`getNoteTotalPageNum(notePath):
 * Promise<APIResponse<number>>`); its docs.supernote.com reference page was
 * not checked.
 */
export async function getNoteTotalPageNum(path: string): Promise<number> {
  const granted = await ensureFileReadPermission();
  if (!granted) {
    logError('getNoteTotalPageNum: file read permission not granted', path);
    throw new Error('File read permission was not granted.');
  }
  log('getNoteTotalPageNum: start', path);
  const response = (await PluginFileAPI.getNoteTotalPageNum(path)) as
    | {success: boolean; result?: number | null; error?: {code: number; message: string} | null}
    | null
    | undefined;
  if (!response || !response.success || response.result == null) {
    const message = response?.error?.message || 'Could not read this note\'s page count.';
    logError('getNoteTotalPageNum: failed', path, message);
    throw new Error(message);
  }
  log('getNoteTotalPageNum: done', path, `${response.result} pages`);
  return response.result;
}

/**
 * The path of the note that was open when the plugin was launched (the
 * button that opens this plugin only appears while a NOTE/DOC is open, so
 * this should always resolve to something). Used on app start to jump
 * straight into that note's Project/Area, if it has one. Resolves null
 * rather than throwing on failure - this is a "nice to have" shortcut, not
 * something that should block the app from opening to Home.
 */
export async function getCurrentNotePath(): Promise<string | null> {
  log('getCurrentNotePath: start');
  try {
    const response = (await PluginCommAPI.getCurrentFilePath()) as
      | {success: boolean; result?: string | null; error?: {code: number; message: string} | null}
      | null
      | undefined;
    if (!response || !response.success || !response.result) {
      log('getCurrentNotePath: none', response?.error?.message);
      return null;
    }
    log('getCurrentNotePath: done', response.result);
    return response.result;
  } catch (e) {
    logError('getCurrentNotePath: failed', errorMessage(e));
    return null;
  }
}

// Remembers the most recent getCurrentNotePath() result app-wide, so any
// code - not just App.tsx's own reorient() call site - can cheaply ask
// "what note/doc was open when the plugin was last (re)launched" without an
// extra native round-trip. `undefined` means nothing has captured a value
// yet this process; `null` means it was captured but resolved to nothing
// (e.g. launched from Home rather than from within a NOTE/DOC).
let rememberedLaunchNotePath: string | null | undefined;
let rememberedLaunchNotePathAt: number | null = null;

// The *first* value ever passed to rememberLaunchNotePath() this process,
// i.e. specifically the file open at cold start (App.tsx's mount effect -
// the one with `useEffect(..., [])` - runs exactly once per JS instance,
// and calls reorient()/rememberLaunchNotePath() immediately; every later
// call comes from a sidebar-button press reusing that same instance, per
// the "closePluginView() only hides the native view" note in App.tsx). This
// stays fixed for the process's whole lifetime even as
// rememberedLaunchNotePath above keeps getting overwritten on every
// reopen - `coldStartCaptured` (not "is the path truthy") is the latch, so
// a genuine cold start from Home (path resolves to null) is still captured
// correctly rather than leaving this looking like "not yet captured".
let rememberedColdStartNotePath: string | null | undefined;
let rememberedColdStartNotePathAt: number | null = null;
let coldStartCaptured = false;

/**
 * Called by App.tsx's reorient() right after its own getCurrentNotePath()
 * call resolves - reorient() runs on cold start AND on every sidebar-button
 * press (see its onButtonPress handler), i.e. every time the plugin is
 * (re)opened, which is the closest this SDK lets us get to "right after the
 * launch event". Deliberately just caches the value reorient() already
 * fetched rather than fetching its own - no extra API call. Also latches
 * the cold-start value the first time it's called this process - see
 * getRememberedColdStartNotePath below.
 *
 * Lets recordDebugLogEntry record which file the plugin was opened from
 * (does a host-side rejection correlate with launch context - a NOTE vs. a
 * DOC/PDF?), and is available to any other code via
 * getRememberedLaunchNotePath.
 */
export function rememberLaunchNotePath(path: string | null): void {
  rememberedLaunchNotePath = path;
  rememberedLaunchNotePathAt = Date.now();
  if (!coldStartCaptured) {
    coldStartCaptured = true;
    rememberedColdStartNotePath = path;
    rememberedColdStartNotePathAt = Date.now();
  }
}

/** The most recent value passed to rememberLaunchNotePath(), plus how long ago it was captured - or undefined if nothing has called it yet this process. */
export function getRememberedLaunchNotePath(): {path: string | null; capturedAt: number} | undefined {
  if (rememberedLaunchNotePathAt == null) return undefined;
  return {path: rememberedLaunchNotePath ?? null, capturedAt: rememberedLaunchNotePathAt};
}

/**
 * The file open at cold start specifically - i.e. the *first* value
 * rememberLaunchNotePath() ever received this process, never overwritten by
 * later reopens (contrast getRememberedLaunchNotePath, which always reflects
 * the most recent reopen). Undefined if the plugin hasn't gone through
 * App.tsx's reorient() yet this process at all.
 */
export function getRememberedColdStartNotePath(): {path: string | null; capturedAt: number} | undefined {
  if (rememberedColdStartNotePathAt == null) return undefined;
  return {path: rememberedColdStartNotePath ?? null, capturedAt: rememberedColdStartNotePathAt};
}

/**
 * Allocates a fresh, natively-cached Element of `type` (one of the
 * ELEMENT_TYPE_* constants above) via PluginCommAPI.createElement - the SDK
 * requires every element passed to insertElements to have come from this
 * call (or from a previous getElements read) rather than being a bare JS
 * object, since insertElements resolves the object back to a native cache
 * entry by `uuid`, not by re-serializing the fields it's given (confirmed
 * from insert-trails' own doc: an element whose uuid can't be found in the
 * cache is silently skipped - i.e. the uuid is load-
 * bearing, not decorative). Caller sets whichever sub-fields it needs
 * (`.userData`, `.textBox` or `.link`, `.pageNum`, `.layerNum`) on the
 * returned object before passing it to insertElements, and must call
 * recycleElement (TODO: not wrapped yet - nothing recycles today) when done
 * with it, per the SDK's own memory-management rule.
 */
export async function createElement(type: number): Promise<Element> {
  log('createElement: start', `type=${type}`);
  const response = (await PluginCommAPI.createElement(type)) as
    | {success: boolean; result?: Element | null; error?: {code: number; message: string} | null}
    | null
    | undefined;
  if (!response || !response.success || !response.result) {
    const message = response?.error?.message || 'Could not create the element.';
    logError('createElement: failed', type, message);
    throw new Error(message);
  }
  log('createElement: done', type, response.result.uuid);
  return response.result;
}

/**
 * Reads every element on `path`'s `page` (0-indexed) - file-level, no
 * dependence on that note being the one currently open in the NOTE app
 * (unlike PluginNoteAPI's calls - see docs/dev/technical-design-meeting-
 * notes.md §5.1's "why not PluginNoteAPI" note).
 * Param order is (page, path) - PluginFileAPI's read-only calls put page
 * first, write calls put path first (gtdpara_project.md's own gotcha #10),
 * confirmed here against the docs.
 */
export async function getElements(page: number, path: string): Promise<Element[]> {
  const granted = await ensureFileReadPermission();
  if (!granted) {
    logError('getElements: file read permission not granted', path);
    throw new Error('File read permission was not granted.');
  }
  log('getElements: start', path, `page=${page}`);
  const start = Date.now();
  const response = (await PluginFileAPI.getElements(page, path)) as
    | {success: boolean; result?: Element[] | null; error?: {code: number; message: string} | null}
    | null
    | undefined;
  const durationMs = Date.now() - start;
  if (!response || !response.success) {
    const message = response?.error?.message || 'Could not read this page\'s elements.';
    logError('getElements: failed', path, message);
    // Diagnostic (docs/dev/technical-design-shared-note-pages.md): logs BOTH
    // outcomes via recordDebugLogEntry, here and on insertElements/openPath
    // below, to localize which call fails with "File does not exist. Cannot
    // call the API." on a page just inserted via insertNotePage - without
    // needing adb logcat.
    await recordDebugLogEntry('getElements', false, durationMs, {path, page, errorMessage: message});
    throw new Error(message);
  }
  const result = response.result ?? [];
  log('getElements: done', path, `${result.length} elements`);
  await recordDebugLogEntry('getElements', true, durationMs, {path, page, elementCount: result.length});
  return result;
}

/**
 * Inserts `elements` (each from createElement or a previous getElements
 * read - see createElement's own doc comment) onto `path`'s `page`. Used by
 * the meeting-note-block feature to write its textbox + (optionally) link
 * element in one call, so a failure partway can't leave one without the
 * other (docs/dev/technical-design-meeting-notes.md §5 step 5).
 */
export async function insertElements(path: string, page: number, elements: Element[]): Promise<void> {
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('insertElements: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('insertElements: start', path, `page=${page}`, `${elements.length} elements`);
  const start = Date.now();
  const response = (await PluginFileAPI.insertElements(path, page, elements)) as
    | {success: boolean; result?: boolean; error?: {code: number; message: string} | null}
    | null
    | undefined;
  const durationMs = Date.now() - start;
  if (!response || !response.success || response.result === false) {
    const message = response?.error?.message || 'Could not insert the elements.';
    logError('insertElements: failed', path, message);
    // Diagnostic - see getElements' own comment above for why.
    await recordDebugLogEntry('insertElements', false, durationMs, {path, page, elementCount: elements.length, errorMessage: message});
    throw new Error(message);
  }
  log('insertElements: done', path);
  await recordDebugLogEntry('insertElements', true, durationMs, {path, page, elementCount: elements.length});
}

/**
 * Deletes elements on `path`'s `page` by their 1-indexed `numInPage`
 * position (NOT uuid - confirmed against docs.supernote.com's delete-
 * elements page; `Element.numInPage`'s own doc comment flags
 * "starts from 1"). Used by the meeting-note-block feature to
 * remove whatever it inserted last time before inserting the fresh version
 * ("always regenerate" - docs/dev/technical-design-meeting-notes.md §5 step 2).
 */
export async function deleteElements(path: string, page: number, numsInPage: number[]): Promise<void> {
  const granted = await ensureFileWritePermission();
  if (!granted) {
    logError('deleteElements: file write permission not granted', path);
    throw new Error('File write permission was not granted.');
  }
  log('deleteElements: start', path, `page=${page}`, numsInPage);
  const response = (await PluginFileAPI.deleteElements(path, page, numsInPage)) as
    | {success: boolean; result?: boolean; error?: {code: number; message: string} | null}
    | null
    | undefined;
  if (!response || !response.success || response.result === false) {
    const message = response?.error?.message || 'Could not delete the elements.';
    logError('deleteElements: failed', path, message);
    throw new Error(message);
  }
  log('deleteElements: done', path);
}

/**
 * Appends to a file in the debug folder, rotating at `maxBytes` (native
 * side). Used only by utils/logSink.ts's optional file sink, via App.tsx's
 * injection - raw native calls, never log(), so writing the log can't log
 * itself. Throws when the native method is missing (older build).
 */
export async function appendDebugLogFile(fileName: string, content: string, maxBytes: number): Promise<number> {
  if (!GtdParaFile?.appendTextFile) throw new Error('appendTextFile is not available on this build.');
  // A refusal throws, and utils/logSink.ts then stops file logging for the session.
  if (!(await ensureFileWritePermission())) throw new Error('File write permission was not granted.');
  return GtdParaFile.appendTextFile(`${DEBUG_LOG_FOLDER}/${fileName}`, content, maxBytes);
}

/**
 * Writes one exported debug bundle (storage/debugBundle.ts) to the debug
 * folder and returns its full path. Throws on failure - it is a user action.
 */
export async function writeDebugBundleFile(fileName: string, content: string): Promise<string> {
  const path = `${DEBUG_LOG_FOLDER}/${fileName}`;
  await writeTextFile(path, content);
  return path;
}
