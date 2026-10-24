/**
 * A screen's agreements in Quick Add (docs/dev/history/technical-design-meetings-0.21.md
 * §5, §6, R20-R23): the one wiring the thread and loop overviews, the
 * Project/Area page and Engage share. It turns the screen's edit target
 * (ui/useEditTarget.ts) into Quick Add's agreement edit target and card,
 * and gives the widget its Add, Save (Edit) and + Add (Change) handlers -
 * every write through storage/agreements.ts.
 *
 * - A tap on an agreement row selects it (card); a second tap, or the
 *   card's Edit, opens the edit form; the card's Change opens the form
 *   prefilled as a new agreement that replaces it (+ Add ends the old one
 *   and adds the new one in one write; Cancel or the line's ✕ leaves both
 *   untouched); End asks once.
 * - A new agreement goes to `targetPath` (domain/agreementOwner.ts's
 *   `agreementTargetPath`); without one the tab is not offered. It gets the
 *   screen's preset tag and the meeting it is made in (`meetingKey`).
 */
import {AgreementRef} from '../domain/agreementOwner';
import {buildAgreement} from '../domain/agreements';
import {agreementAddedText} from '../domain/fileChangeText';
import {todayIso} from '../domain/meetingTime';
import {addAgreement, changeAgreement, editAgreement} from '../storage/agreements';
import {getCachedData} from '../storage/dataCache';
import {log} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';
import {AgreementCardData, useAgreementCard, useEndAgreement} from './itemCard/useAgreementCard';
import {AgreementHandlers} from './quickAdd/useAgreementDraft';
import {QuickAddEditTarget} from './quickAdd/types';
import {EntryEditKey} from './useEntryActions';
import {useEditTarget} from './useEditTarget';

export const agreementRefKey = (ref: Pick<AgreementRef, 'itemPath' | 'index'>) => `${ref.itemPath}#${ref.index}`;

/** What the hook needs of a screen's edit target (ui/useEditTarget.ts), whatever the screen's target type. */
export interface AgreementEditApi {
  /** The selected agreement by `agreementRefKey`, and whether it is being changed; null when no agreement is selected. */
  current: {key: string; change: boolean} | null;
  mode: 'card' | 'edit';
  select: (key: string) => void;
  startChange: (key: string) => void;
  edit: () => void;
  saved: () => void;
  cancel: () => void;
}

/** The adapter for the screens whose edit target is ui/useEntryActions.ts's `EntryEditKey`. */
export function entryAgreementEdit(edit: ReturnType<typeof useEditTarget<EntryEditKey>>): AgreementEditApi {
  const t = edit.target;
  return {
    current: t && (t.type === 'agreement' || t.type === 'agreementChange') ? {key: t.key, change: t.type === 'agreementChange'} : null,
    mode: edit.mode,
    select: key => edit.select({type: 'agreement', key}),
    startChange: key => edit.start({type: 'agreementChange', key}),
    edit: edit.edit,
    saved: edit.saved,
    cancel: edit.cancel,
  };
}

interface Input {
  /** Log prefix and status-slot id prefix. */
  name: string;
  edit: AgreementEditApi;
  /** Every agreement the screen shows (active and ended): the selected one is found among them. */
  refs: readonly AgreementRef[];
  /** Where a new agreement is written; null: the Agreement tab is not offered. */
  targetPath: string | null;
  /** The `[meeting::]` key a new agreement records, or null. */
  meetingKey?: string | null;
  /** Adds the screen's preset tag to a new agreement's words. */
  applyTags?: (text: string) => string;
  /** After a successful add (the screen's grey-line parts turn on again). */
  onAdded?: () => void;
  /** Opens the Project or Area an agreement lives in (the card's last row). */
  onOpenItem?: (itemPath: string) => void;
}

export interface AgreementActions {
  /** Quick Add's edit target while an agreement is selected, edited or changed; else null. */
  editTarget: QuickAddEditTarget | null;
  card: AgreementCardData | null;
  handlers: AgreementHandlers;
  select: (ref: AgreementRef) => void;
  change: (ref: AgreementRef) => void;
  end: (ref: AgreementRef) => Promise<boolean>;
  /** How a row shows: selected (card), editing, or neither. */
  rowState: (ref: AgreementRef) => 'selected' | 'editing' | undefined;
}

function itemName(path: string): string {
  return getCachedData()?.items.find(i => i.path === path)?.name ?? path.split('/').pop() ?? path;
}

export function useAgreementActions(input: Input): AgreementActions {
  const {name, edit, refs, targetPath} = input;
  const current = edit.current;
  const selected = current ? refs.find(r => agreementRefKey(r) === current.key) ?? null : null;
  const changing = !!current?.change;
  const end = useEndAgreement(name);

  const card = useAgreementCard({
    name,
    selection: selected && !changing ? {ref: selected, itemName: itemName(selected.itemPath)} : null,
    onEdit: edit.edit,
    onChange: () => selected && edit.startChange(agreementRefKey(selected)),
    onClose: edit.cancel,
    onOpenItem: input.onOpenItem && selected ? () => input.onOpenItem?.(selected.itemPath) : undefined,
  });

  const editTarget: QuickAddEditTarget | null = !selected
    ? null
    : changing
      ? {kind: 'agreementChange', mode: 'edit', key: `agreementChange:${agreementRefKey(selected)}`, replaces: selected}
      : {kind: 'agreement', mode: edit.mode, key: `agreement:${agreementRefKey(selected)}`, agreement: selected};

  const handlers: AgreementHandlers = {
    onAddAgreement: targetPath
      ? async (text, valid) => {
          const words = input.applyTags ? input.applyTags(text) : text;
          await addAgreement(targetPath, buildAgreement(words, {today: todayIso(), valid, meeting: input.meetingKey ?? null}));
          log(`${name}: agreement added`);
          input.onAdded?.();
          requestEinkRefresh();
          return agreementAddedText(itemName(targetPath));
        }
      : undefined,
    onSaveEditAgreement: async (text, valid) => {
      if (!selected) return true;
      await editAgreement(selected, text, valid);
      edit.saved();
      requestEinkRefresh();
      return true;
    },
    onChangeAgreement: async (text, valid) => {
      if (!selected) return true;
      // The new one goes where the old one is, and records the meeting the screen is in (if any).
      await changeAgreement(selected, text, valid, input.meetingKey ?? null);
      edit.cancel();
      requestEinkRefresh();
      return true;
    },
  };

  return {
    editTarget,
    card,
    handlers,
    select: ref => edit.select(agreementRefKey(ref)),
    change: ref => edit.startChange(agreementRefKey(ref)),
    end,
    rowState: ref => {
      if (!selected || agreementRefKey(selected) !== agreementRefKey(ref)) return undefined;
      return edit.mode === 'card' && !changing ? 'selected' : 'editing';
    },
  };
}
