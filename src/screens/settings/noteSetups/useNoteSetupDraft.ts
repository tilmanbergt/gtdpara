/**
 * Settings → Note setups' editing state (docs/dev/history/technical-design-note-setups.md
 * §6.4): which view shows (the list, a setup page, its tag picker, a page
 * layout), the setup or the Default being edited as a draft (discarded on
 * Cancel), and every action on it. Saving and deleting persist at once,
 * independent of the other tabs' Save button. Held by the Settings shell
 * so an unsaved setup survives switching sub-tabs. The page layout's own
 * actions live in useLayoutDraft.
 */
import {Dispatch, SetStateAction, useRef, useState} from 'react';
import {
  createNoteSetup,
  layoutFor,
  LOOP_NOTE_NAME_DEFAULT,
  MeetingTracking,
  Notebook,
  NoteSetup,
  NoteSetupDefaults,
  normalizeSetupTag,
  normalizeSetupTags,
  pageKindsOf,
  SetupKind,
  setupTagProblemText,
  validateNotebookFolder,
  validateSetupTags,
} from '../../../domain/noteSetups';
import {emptyPageLayout, migrateLegacyTextPieces, PageKind, PageLayout} from '../../../domain/pageLayout';
import {GtdParaSettings, NoteHeadingStyle} from '../../../domain/settings';
import {setLoopSetups} from '../../../storage/loopKinds';
import {patchSettings} from '../../../storage/settingsStorage';
import {ClipboardTextInputHandle} from '../../../ui/ClipboardTextInput';
import {useErrorStatus} from '../../../ui/status/StatusProvider';
import {useStatusConfirm} from '../../../ui/useStatusConfirm';
import {errorMessage} from '../../../utils/errorMessage';
import {log, logError} from '../../../utils/log';
import {useLayoutDraft} from './useLayoutDraft';

export type SetupView = 'list' | 'setup' | 'tags' | 'layout';
export type LayoutPanel = 'pieces' | 'add' | 'background';

/** What is being edited: a setup (`index` null while it is new) or the Default. */
export type SetupDraftTarget = {kind: 'setup'; index: number | null; setup: NoteSetup} | {kind: 'default'; defaults: NoteSetupDefaults};

/** A new notebook's name: the setup tag, the nested part and the year (§6.2). */
export const NEW_NOTEBOOK_NAME = '{tag} {subtag} {year}';

/** A deep copy, so a draft never shares pieces with the stored settings. */
function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A setup as it is saved: tags normalized, a name (its tags when blank), only the pages its kind has. */
function finishedSetup(setup: NoteSetup, folder: string): NoteSetup {
  const tags = normalizeSetupTags(setup.tags);
  const kinds = pageKindsOf(setup.kind);
  const pages: NoteSetup['pages'] = {};
  for (const kind of kinds) if (setup.pages[kind]) pages[kind] = setup.pages[kind];
  const name = setup.name.trim() || tags.map(t => `#${t}`).join(' ') || 'New setup';
  const notebook = setup.kind === 'loop' ? {name: setup.notebook?.name ?? '', folder: ''} : setup.notebook ? {...setup.notebook, folder} : null;
  return {...setup, name, tags, pages, notebook};
}

export function useNoteSetupDraft(values: GtdParaSettings, setValues: Dispatch<SetStateAction<GtdParaSettings>>) {
  const [view, setView] = useState<SetupView>('list');
  const [target, setTarget] = useState<SetupDraftTarget | null>(null);
  const [activePage, setActivePage] = useState<PageKind>('meeting');
  const [layoutPanel, setLayoutPanel] = useState<LayoutPanel>('pieces');
  const [newTagText, setNewTagText] = useState('');
  const notebookNameRef = useRef<ClipboardTextInputHandle>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('Settings.noteSetups', error, () => setError(null));
  const confirmUseDefault = useStatusConfirm('Settings.useDefaultPage');

  // ---- The page being edited ----

  /** The pages of the draft: the setup's own layouts, or the Default's pages. */
  const draftPages = target ? (target.kind === 'setup' ? target.setup.pages : target.defaults.pages) : {};
  const activeLayout: PageLayout | null = draftPages[activePage] ?? null;

  /** Applies `fn` to the page being edited (an empty page when it has none yet). */
  const updateActiveLayout = (fn: (l: PageLayout) => PageLayout) => {
    setTarget(prev => {
      if (!prev) return prev;
      const pages = prev.kind === 'setup' ? prev.setup.pages : prev.defaults.pages;
      const next = {...pages, [activePage]: fn(pages[activePage] ?? emptyPageLayout())};
      return prev.kind === 'setup' ? {...prev, setup: {...prev.setup, pages: next}} : {...prev, defaults: {...prev.defaults, pages: next}};
    });
  };
  const layout = useLayoutDraft(activeLayout, updateActiveLayout);

  const updateSetup = (patch: Partial<NoteSetup>) =>
    setTarget(prev => (prev?.kind === 'setup' ? {...prev, setup: {...prev.setup, ...patch}} : prev));
  const updateDefaults = (patch: Partial<NoteSetupDefaults>) =>
    setTarget(prev => (prev?.kind === 'default' ? {...prev, defaults: {...prev.defaults, ...patch}} : prev));

  // ---- List ----

  const openSetupPage = (next: SetupDraftTarget) => {
    setTarget(next);
    setNewTagText('');
    setError(null);
    setView('setup');
  };

  const handleNewSetup = () => openSetupPage({kind: 'setup', index: null, setup: createNoteSetup(String(values.nextNoteSetupId), 'thread')});
  const handleEditSetup = (index: number) => openSetupPage({kind: 'setup', index, setup: copyOf(values.noteSetups[index])});
  const handleEditDefault = () => openSetupPage({kind: 'default', defaults: copyOf(values.noteSetupDefaults)});

  /** Persists the setups list (and the next id) at once, re-reading what is stored (patchSettings), so drafts on other tabs are never written. */
  const persistSetups = async (noteSetups: NoteSetup[], nextNoteSetupId: number) => {
    setValues(prev => ({...prev, noteSetups, nextNoteSetupId}));
    try {
      await patchSettings({noteSetups, nextNoteSetupId});
      setLoopSetups(noteSetups);
    } catch (e) {
      logError('NoteSetups: saving failed', errorMessage(e));
      setError(`Saving the Note setups failed: ${errorMessage(e)}`);
    }
  };

  /** Immediate, like every Delete in a list here (QuickAddWidget's). Existing notes stay where they are; their pages refresh with the Default layout. */
  const handleDeleteSetup = (index: number) => {
    log('NoteSetups: deleted', values.noteSetups[index]?.kind);
    return persistSetups(values.noteSetups.filter((_, i) => i !== index), values.nextNoteSetupId);
  };

  /** Clears the migration notice (§6.6). */
  const handleDismissNotice = async () => {
    setValues(prev => ({...prev, noteSetupsNotice: null}));
    try {
      await patchSettings({noteSetupsNotice: null});
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** Heading style: global, written at once. */
  const handleSetHeadingStyle = async (noteHeadingStyle: NoteHeadingStyle) => {
    setValues(prev => ({...prev, noteHeadingStyle}));
    try {
      await patchSettings({noteHeadingStyle});
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  // ---- Setup page ----

  /** Thread <-> Loop: a Loop setup always has its loop note; a Thread setup starts with an own note per item. */
  const handleSetKind = (kind: SetupKind) => {
    if (target?.kind !== 'setup' || target.setup.kind === kind) return;
    updateSetup({kind, notebook: kind === 'loop' ? {name: LOOP_NOTE_NAME_DEFAULT, folder: ''} : null});
  };

  /** Own note per item / One notebook - for a Thread setup or the Default. */
  const handleSetNotebookOn = (on: boolean) => {
    const notebook: Notebook | null = on ? {name: NEW_NOTEBOOK_NAME, folder: ''} : null;
    if (target?.kind === 'setup') updateSetup({notebook});
    else updateDefaults({notebook});
  };

  const handleUpdateNotebook = (patch: Partial<Notebook>) => {
    const current = target?.kind === 'setup' ? target.setup.notebook : target?.defaults.notebook;
    const notebook = {...(current ?? {name: '', folder: ''}), ...patch};
    if (target?.kind === 'setup') updateSetup({notebook});
    else updateDefaults({notebook});
  };

  const handleToggleTracking = (key: keyof MeetingTracking) => {
    if (!target) return;
    const tracking = target.kind === 'setup' ? target.setup.tracking : target.defaults.tracking;
    const next = {...tracking, [key]: !tracking[key]};
    if (target.kind === 'setup') updateSetup({tracking: next});
    else updateDefaults({tracking: next});
  };

  // ---- Tags ----

  const handleRemoveTag = (tag: string) => {
    if (target?.kind === 'setup') updateSetup({tags: target.setup.tags.filter(t => t !== tag)});
  };

  /** Picks or unpicks a tag in the tag picker. */
  const handleToggleTag = (tag: string) => {
    if (target?.kind !== 'setup') return;
    const tags = target.setup.tags;
    updateSetup({tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]});
  };

  /** Adds the typed tag (trimmed, without '#', lowercase); a tag another setup has is refused with its name. */
  const handleAddNewTag = () => {
    if (target?.kind !== 'setup') return;
    const tag = normalizeSetupTag(newTagText);
    if (!tag) return;
    const problem = validateSetupTags({...target.setup, tags: [tag]}, values.noteSetups);
    if (problem) {
      setError(setupTagProblemText(problem));
      return;
    }
    setError(null);
    if (!target.setup.tags.includes(tag)) updateSetup({tags: [...target.setup.tags, tag]});
    setNewTagText('');
  };

  // ---- Pages ----

  /** Opens the layout page of `kind` (§6.3), with the Pieces panel. */
  const handleEditPage = (kind: PageKind) => {
    setActivePage(kind);
    setLayoutPanel('pieces');
    layout.resetLayoutState();
    // Texts placed before layouts had their own texts get one (no-op otherwise).
    const page = draftPages[kind];
    if (page) {
      const migrated = migrateLegacyTextPieces(page);
      if (migrated !== page) {
        setTarget(prev =>
          prev?.kind === 'setup'
            ? {...prev, setup: {...prev.setup, pages: {...prev.setup.pages, [kind]: migrated}}}
            : prev
            ? {...prev, defaults: {...prev.defaults, pages: {...prev.defaults.pages, [kind]: migrated}}}
            : prev,
        );
      }
    }
    setView('layout');
  };

  /** "Customize ›": the page gets its own layout, starting as a copy of the Default page (§1.1), and opens. */
  const handleCustomizePage = (kind: PageKind) => {
    if (target?.kind !== 'setup') return;
    const start = layoutFor(null, kind, values.noteSetupDefaults) ?? emptyPageLayout();
    updateSetup({pages: {...target.setup.pages, [kind]: copyOf(start)}});
    handleEditPage(kind);
  };

  /** "Use default": the page's own layout is removed, after a confirm. */
  const handleUseDefaultPage = async (kind: PageKind) => {
    if (target?.kind !== 'setup') return;
    const ok = await confirmUseDefault({
      text: 'Use the Default page? Your own layout for this page is removed.',
      detail: 'The page then follows the Default page for this kind. Notes already written keep their content.',
      actionLabel: 'Use default',
    });
    if (!ok) return;
    setTarget(prev => {
      if (prev?.kind !== 'setup') return prev;
      const pages = {...prev.setup.pages};
      delete pages[kind];
      return {...prev, setup: {...prev.setup, pages}};
    });
    setView('setup');
  };

  /** Done on the layout page: back to the setup page; the draft is kept until Save or Cancel there. */
  const handleLayoutDone = () => setView('setup');

  const handleCancel = () => {
    setTarget(null);
    setError(null);
    setView('list');
  };

  /** Checks tags and folder, then persists the setup (or the Default) at once. */
  const handleSave = async () => {
    if (!target) return;
    const notebook = target.kind === 'setup' ? target.setup.notebook : target.defaults.notebook;
    const folder = notebook && !(target.kind === 'setup' && target.setup.kind === 'loop') ? validateNotebookFolder(notebook.folder) : {ok: true as const, folder: ''};
    if (!folder.ok) {
      setError(folder.message);
      return;
    }
    if (target.kind === 'default') {
      const noteSetupDefaults: NoteSetupDefaults = {...target.defaults, notebook: notebook ? {...notebook, folder: folder.folder} : null};
      setValues(prev => ({...prev, noteSetupDefaults}));
      handleCancel();
      try {
        await patchSettings({noteSetupDefaults});
        log('NoteSetups: Default saved', `pages ${Object.keys(noteSetupDefaults.pages).length}`);
      } catch (e) {
        logError('NoteSetups: saving the Default failed', errorMessage(e));
        setError(`Saving the Default failed: ${errorMessage(e)}`);
      }
      return;
    }
    const problem = validateSetupTags(target.setup, values.noteSetups);
    if (problem) {
      setError(setupTagProblemText(problem));
      return;
    }
    const setup = finishedSetup(target.setup, folder.folder);
    const isNew = target.index === null;
    const list = isNew ? [...values.noteSetups, setup] : values.noteSetups.map((s, i) => (i === target.index ? setup : s));
    handleCancel();
    log('NoteSetups: saved', setup.kind, isNew ? 'new' : 'edited');
    await persistSetups(list, isNew ? values.nextNoteSetupId + 1 : values.nextNoteSetupId);
  };

  return {
    view,
    setView,
    target,
    activePage,
    activeLayout,
    layoutPanel,
    setLayoutPanel,
    newTagText,
    setNewTagText,
    notebookNameRef,
    layout,
    updateSetup,
    handleNewSetup,
    handleEditSetup,
    handleEditDefault,
    handleDeleteSetup,
    handleDismissNotice,
    handleSetHeadingStyle,
    handleSetKind,
    handleSetNotebookOn,
    handleUpdateNotebook,
    handleToggleTracking,
    handleRemoveTag,
    handleToggleTag,
    handleAddNewTag,
    handleEditPage,
    handleCustomizePage,
    handleUseDefaultPage,
    handleLayoutDone,
    handleCancel,
    handleSave,
  };
}

export type NoteSetupDraft = ReturnType<typeof useNoteSetupDraft>;
