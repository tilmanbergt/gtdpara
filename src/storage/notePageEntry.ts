/**
 * Which todo or meeting a note page belongs to
 * (docs/dev/history/technical-design-engage.md §3.4): the pure candidates of
 * domain/notePageEntry.ts, plus one `getKeyWords` call for that one page when
 * an entry's shared anchor points into the note at all. Used by the Engage
 * panel (storage/noteOwnerOf.ts) and by Capture's provenance
 * (storage/threadProvenance.ts).
 */
import {ALL_PAGE_ENTRY_KINDS, notePageCandidates, PageEntry, PageEntryKind, PageEntrySource, sharedPageHit} from '../domain/notePageEntry';
import {getKeyWords} from '../supernote/fileSystem';
import {errorMessage} from '../utils/errorMessage';
import {logError} from '../utils/log';

/**
 * The entry whose note page `absPath` (0-based `page`) is, or null. A failing
 * keyword read is logged and reads as no entry: the lookup is an extra,
 * never a reason to block what asked for it.
 */
export async function entryForNotePage<R extends {path: string}>(
  absPath: string,
  page: number | null,
  sources: ReadonlyArray<PageEntrySource<R>>,
  kinds: readonly PageEntryKind[] = ALL_PAGE_ENTRY_KINDS,
): Promise<PageEntry<R> | null> {
  const {direct, shared} = notePageCandidates(absPath, page, sources, kinds);
  if (direct) return direct;
  if (shared.length === 0 || page === null) return null;
  try {
    const keywords = (await getKeyWords(absPath, [page])).filter(kw => kw.page === page).map(kw => kw.keyword);
    return sharedPageHit(shared, keywords);
  } catch (e) {
    logError('notePageEntry: reading page keywords failed', errorMessage(e));
    return null;
  }
}
