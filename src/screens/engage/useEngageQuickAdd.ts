/**
 * Engage's Quick Add parts (docs/dev/history/technical-design-meetings-0.21.md
 * R7, R20, §4.4): during and after the page's meeting a new todo or
 * agreement carries that meeting (`↳ from <meeting> ✕`) and, for a thread or
 * loop, the owner's tag (`#<tag> ✕`); before it only the tag. Each part
 * drops for one entry. New meetings get the owner's tag as before.
 *
 * Agreements go to the owner's file (domain/agreementOwner.ts's
 * `agreementTargetPath`; never the Inbox, so an owner there gets no
 * Agreement tab); the Agreements tab's Change opens the box prefilled
 * (ui/useAgreementActions.ts). "+ Next <type>" fills the Meeting tab and
 * sends the meeting to the item of the meeting it was copied from.
 */
import {useState} from 'react';
import {agreementTargetPath, AgreementRef} from '../../domain/agreementOwner';
import {Destination} from '../../domain/destination';
import {EngageOptions} from '../../domain/engageOptions';
import {EngageOwner, EngageSource, MeetingEntryRef} from '../../domain/engageOwner';
import {MeetingMoment} from '../../domain/meetingMoment';
import {MeetingSeedFields} from '../../domain/nextMeeting';
import {titleWithLoopTag} from '../../domain/loopEdit';
import {QuickAddAdds} from '../../ui/quickAdd/ProvenanceLine';
import {MeetingSeed} from '../../ui/quickAdd/useDraftRequests';
import {usePresetTag} from '../../ui/quickAdd/usePresetTag';
import {useProvenance} from '../../ui/quickAdd/useProvenance';
import {MeetingQuickAddFields} from '../../ui/QuickAddWidget';
import {AgreementActions, entryAgreementEdit, useAgreementActions} from '../../ui/useAgreementActions';
import {EntryActions} from '../../ui/useEntryActions';

interface Input {
  owner: EngageOwner | null;
  source: EngageSource | null;
  options: EngageOptions | null;
  /** The page's meeting and its moment, while it has one. */
  page: {entry: MeetingEntryRef; moment: MeetingMoment} | null;
  actions: Pick<EntryActions, 'addTask' | 'addMeeting' | 'edit'>;
}

export interface EngageQuickAdd {
  provenance: QuickAddAdds;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;
  agreements: AgreementActions;
  /** Whether the Agreement tab is offered (an owner with a file of its own). */
  canAddAgreement: boolean;
  meetingSeed: MeetingSeed | null;
  /** Where "+ Next"'s meeting goes, while its seed is in the box; null otherwise. */
  seedDestination: Destination | null;
  seedNextMeeting: (seed: MeetingSeedFields, itemPath: string) => void;
}

export function useEngageQuickAdd({owner, source, options, page, actions}: Input): EngageQuickAdd {
  const ownerTag = owner && owner.kind !== 'item' ? owner.tag : null;
  const preset = usePresetTag(ownerTag);
  const fromMeeting = page && page.moment !== 'before' ? page.entry.meeting : null;
  const origin = useProvenance(fromMeeting);
  const [seed, setSeed] = useState<{seed: MeetingSeed; itemPath: string} | null>(null);
  const targetPath = owner && source ? agreementTargetPath(owner, source) : null;
  const refs: AgreementRef[] = options
    ? [...options.agreements, ...options.from.flatMap(g => g.rows.flatMap(r => (r.kind === 'agreement' ? [r.agreement] : [])))]
    : [];
  const added = () => {
    origin.added();
    preset.added();
  };
  const agreements = useAgreementActions({
    name: 'EngageOverlay',
    edit: entryAgreementEdit(actions.edit),
    refs,
    targetPath,
    meetingKey: origin.key,
    applyTags: preset.apply,
    onAdded: added,
  });
  const seedItem = seed && source ? source.items.find(i => i.path === seed.itemPath) : undefined;
  return {
    provenance: [...(origin.provenance ?? []), ...(preset.part ? [preset.part] : [])],
    onAddTask: async (text, destination) => {
      await actions.addTask(preset.apply(origin.apply(text)), destination);
      added();
    },
    onAddMeeting: async (fields, destination) => {
      await actions.addMeeting(ownerTag ? {...fields, title: titleWithLoopTag(fields.title, ownerTag)} : fields, destination);
      setSeed(null);
    },
    agreements,
    canAddAgreement: targetPath !== null,
    meetingSeed: seed?.seed ?? null,
    seedDestination: seedItem ? {type: 'item', kind: seedItem.kind, name: seedItem.name, path: seedItem.path} : null,
    seedNextMeeting: (fields, itemPath) => setSeed({seed: {fields, nonce: Date.now()}, itemPath}),
  };
}
