/**
 * The Project/Area page's agreements (docs/dev/history/technical-design-meetings-0.21.md
 * R19, R20, R24, §8): the item owner's active agreements - its own file,
 * tagged with none of its active loops and with no thread - and the
 * agreement actions (ui/useAgreementActions.ts) over the page's one edit
 * target (screens/ProjectDataPanel.tsx's index-based `EditTarget`). New
 * agreements go to the item's own file.
 */
import {useMemo} from 'react';
import {ownerAgreements} from '../../domain/agreementOwner';
import {GtdParaSettings} from '../../domain/settings';
import {engageSourceOf} from '../../storage/engageAggregate';
import {useCachedItems} from '../../ui/useCachedItems';
import {AgreementActions, AgreementEditApi, agreementRefKey, useAgreementActions} from '../../ui/useAgreementActions';

/** The page's edit target, as screens/ProjectDataPanel.tsx keeps it. */
export interface PanelEditTarget {
  type: 'task' | 'meeting' | 'agreement' | 'agreementChange';
  index: number;
}

interface Input {
  path: string;
  settings: GtdParaSettings | null;
  target: PanelEditTarget | null;
  mode: 'card' | 'edit';
  select: (target: PanelEditTarget) => void;
  start: (target: PanelEditTarget) => void;
  edit: () => void;
  saved: () => void;
  cancel: () => void;
}

export function useProjectAgreements(input: Input): {refs: ReturnType<typeof ownerAgreements>; actions: AgreementActions} {
  const {path, settings, target} = input;
  const items = useCachedItems();
  const refs = useMemo(
    () => ownerAgreements({kind: 'item', itemPath: path}, engageSourceOf(items, null, settings?.noteSetups ?? [])),
    [items, path, settings],
  );
  const indexOf = (key: string) => Number(key.slice(key.lastIndexOf('#') + 1));
  const edit: AgreementEditApi = {
    current:
      target && (target.type === 'agreement' || target.type === 'agreementChange')
        ? {key: agreementRefKey({itemPath: path, index: target.index}), change: target.type === 'agreementChange'}
        : null,
    mode: input.mode,
    select: key => input.select({type: 'agreement', index: indexOf(key)}),
    startChange: key => input.start({type: 'agreementChange', index: indexOf(key)}),
    edit: input.edit,
    saved: input.saved,
    cancel: input.cancel,
  };
  const actions = useAgreementActions({name: 'ProjectDataPanel', edit, refs, targetPath: path});
  return {refs, actions};
}
