/**
 * Wires the agreement card (docs/dev/history/technical-design-meetings-0.21.md
 * R23, §6) for one screen: the selected agreement's lines and its buttons.
 * Edit and Change go back to the screen (they open Quick Add's form); End
 * asks once in the status slot, then writes through storage/agreements.ts.
 * "↳ <meeting> ›" opens that meeting's thread overview.
 */
import {AgreementRef} from '../../domain/agreementOwner';
import {agreementCardHeading, agreementPlainText, agreementValidLine, endAgreementConfirm} from '../../domain/agreementText';
import {isActiveAgreement} from '../../domain/agreements';
import {AGREEMENT_ENDED_TEXT} from '../../domain/fileChangeText';
import {originOfKey} from '../../domain/itemCard';
import {todayIso} from '../../domain/meetingTime';
import {endAgreement} from '../../storage/agreements';
import {log} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {openOverview} from '../overviewStore';
import {useStatusApi} from '../status/StatusProvider';
import {useActionError} from '../useActionError';
import {useStatusConfirm} from '../useStatusConfirm';

export interface AgreementCardOptions {
  /** A stable per-screen name for logs and the status slot. */
  name: string;
  selection: {ref: AgreementRef; itemName: string} | null;
  onEdit: () => void;
  onChange: () => void;
  onClose: () => void;
  /** Opens the Project or Area it lives in; absent: a plain label. */
  onOpenItem?: () => void;
}

export interface AgreementCardData {
  ref: AgreementRef;
  heading: string;
  /** "↳ Sparring Mieke ›" with what it opens, or null. */
  madeIn: {label: string; onPress?: () => void} | null;
  title: string;
  tags: string[];
  validLine: string;
  active: boolean;
  itemLabel: string;
  onOpenItem?: () => void;
  onEdit: () => void;
  onChange: () => void;
  onEnd: () => void;
  onClose: () => void;
}

/** Ends `ref` after one question in the status slot; resolves true when it was ended. */
export function useEndAgreement(name: string): (ref: AgreementRef) => Promise<boolean> {
  const confirm = useStatusConfirm(`${name}.endAgreement`);
  const action = useActionError(`${name}.agreementEnd`, `${name}: ending the agreement failed`);
  const status = useStatusApi();
  return async ref => {
    let ended = false;
    await action.run(async () => {
      if (!(await confirm(endAgreementConfirm(ref.agreement)))) return;
      await endAgreement(ref);
      ended = true;
      log(`${name}: agreement ended`);
      status.show(`${name}.agreementDone`, {kind: 'success', text: AGREEMENT_ENDED_TEXT, onDismiss: () => status.clear(`${name}.agreementDone`)});
      requestEinkRefresh();
    });
    return ended;
  };
}

export function useAgreementCard(options: AgreementCardOptions): AgreementCardData | null {
  const end = useEndAgreement(options.name);
  const {selection} = options;
  if (!selection) return null;
  const {ref} = selection;
  const a = ref.agreement;
  const today = todayIso();
  const origin = a.fields.meeting ? originOfKey(a.fields.meeting) : null;
  const threadTag = origin?.threadTag ?? null;
  return {
    ref,
    heading: agreementCardHeading(a, today),
    madeIn: origin
      ? {label: threadTag ? `${origin.label} ›` : origin.label, onPress: threadTag ? () => openOverview({tag: threadTag, ownerPath: ref.itemPath}) : undefined}
      : null,
    title: agreementPlainText(a),
    tags: a.tags.map(t => `#${t}`),
    validLine: agreementValidLine(a, today),
    active: isActiveAgreement(a),
    itemLabel: options.onOpenItem ? `in ${selection.itemName} ›` : `in ${selection.itemName}`,
    onOpenItem: options.onOpenItem,
    onEdit: options.onEdit,
    onChange: options.onChange,
    onEnd: () => {
      end(ref).then(ended => ended && options.onClose());
    },
    onClose: options.onClose,
  };
}
