/**
 * What Settings → Note setups shows about a setup, a page and the tags to
 * pick (docs/dev/history/technical-design-note-setups.md §6). Pure, so the
 * screens only lay it out.
 */
import {trackingSummary} from './meetingTracking';
import {NoteSetup, NoteSetupDefaults, normalizeSetupTag, Notebook, SetupKind} from './noteSetups';
import {PageKind, PageLayout} from './pageLayout';
import {threadOf} from './threads';
import {sanitizeFileNameComponent} from './fileName';
import {loopNoteBaseName} from './loops';
import {renderSharedFileName} from './sharedNotePages';

export const SETUP_KIND_LABELS: Record<SetupKind, string> = {thread: 'Thread', loop: 'Loop'};

export const PAGE_KIND_LABELS: Record<PageKind, string> = {meeting: 'Meeting page', todo: 'Todo page', first: 'First page'};

/** Where the notes go, in a few words: "notebook Sparring/{tag} {subtag} {year}", "own note per item", "loop note {year}-{month} {tag} {subtag}". */
export function notesSummary(kind: SetupKind | null, notebook: Notebook | null | undefined): string {
  if (kind === 'loop') return `loop note ${notebook?.name ?? ''}`.trim();
  if (!notebook) return 'own note per item';
  return `notebook ${notebook.folder ? `${notebook.folder}/` : ''}${notebook.name}`;
}

/** The list row's second line: tags · where notes go · what is tracked. */
export function setupRowSummary(setup: NoteSetup): string {
  const tags = setup.tags.length > 0 ? setup.tags.map(t => `#${t}`).join(' ') : 'no tags yet';
  const tracks = trackingSummary(setup.tracking);
  return [tags, notesSummary(setup.kind, setup.notebook), tracks ? `tracks ${tracks}` : ''].filter(Boolean).join(' · ');
}

/** The Default row's second line: its pages, where notes go, what it tracks. */
export function defaultRowSummary(defaults: NoteSetupDefaults): string {
  const tracks = trackingSummary(defaults.tracking);
  return ['Meeting page · Todo page · First page', notesSummary(null, defaults.notebook), tracks ? `tracks ${tracks}` : '']
    .filter(Boolean)
    .join(' · ');
}

/** A page row's text: "Default layout · 4 pieces · blank" / "Own layout · 2 pieces · Lined.png"; the Default's own pages leave out the layout word. */
export function pageRowSummary(layout: PageLayout | null, own: boolean | null): string {
  const count = layout?.pieces.length ?? 0;
  const background = layout?.template ? layout.template : 'blank';
  const pieces = `${count} ${count === 1 ? 'piece' : 'pieces'}`;
  return [own === null ? '' : own ? 'Own layout' : 'Default layout', pieces, background].filter(Boolean).join(' · ');
}

/** The tags another setup holds (one tag, one setup), lowercased. */
export function tagsOfOtherSetups(setups: readonly NoteSetup[], ownId: string | null): Set<string> {
  const out = new Set<string>();
  for (const s of setups) if (s.id !== ownId) for (const t of s.tags) out.add(normalizeSetupTag(t));
  return out;
}

/**
 * The tags the picker offers (§6.2): the types of the tags in use first
 * (`sparring` of `#sparring/peter`), then the plain tags, each once; the
 * setup's own tags stay in (shown as picked), tags of another setup are
 * left out. `recent` is most recently used first.
 */
export function setupTagChoices(recent: readonly string[], setups: readonly NoteSetup[], ownId: string | null, ownTags: readonly string[]): string[] {
  const taken = tagsOfOtherSetups(setups, ownId);
  const normalized = recent.map(normalizeSetupTag).filter(Boolean);
  const types = normalized.map(t => threadOf(t)?.type).filter((t): t is string => !!t);
  const plain = normalized.filter(t => !t.includes('/'));
  const out: string[] = [];
  for (const tag of [...ownTags.map(normalizeSetupTag), ...types, ...plain]) {
    if (tag && !taken.has(tag) && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * What a notebook name gives (§6.2): one example file per tag (at most
 * three), with a sample subtag and `date` - "Sparring/sparring client 2026.note".
 * The same rendering and sanitizing as the real note (storage/noteTargets.ts).
 */
export function notebookPreviews(name: string, fallbackName: string, tags: readonly string[], folder: string, date: string): string[] {
  const shown = tags.length > 0 ? tags.slice(0, 3).map(normalizeSetupTag) : [''];
  const files = shown.map(tag => {
    const file = sanitizeFileNameComponent(
      renderSharedFileName({template: name.trim() ? name : fallbackName, fallbackName, tag, subtag: 'client', date}),
    );
    return `${folder ? `${folder}/` : ''}${file}.note`;
  });
  return files.filter((f, i) => files.indexOf(f) === i);
}

/** What a loop note name gives for `#<first tag>/teamoffsite`, with a main date and without one. */
export function loopNotePreviews(name: string, tags: readonly string[], date: string): string[] {
  const kind = normalizeSetupTag(tags[0] ?? '') || 'kind';
  const loop = {kind, name: 'teamoffsite', tag: `${kind}/teamoffsite`};
  return [date, null].map(d => `${sanitizeFileNameComponent(loopNoteBaseName(name, loop, d))}.note`);
}
