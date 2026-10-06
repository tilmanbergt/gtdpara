import React, {useEffect} from 'react';
import {setFlowStateTag} from '../../../domain/flowState';
import {deriveTaskFields} from '../../../domain/markdown';
import {isoWeekKey} from '../../../domain/weekDate';
import {archiveItem, archiveLeavesEmptyFolder, archiveTargetsFor} from '../../../storage/archive';
import {archiveDoneText, emptyFolderConfirmNote} from '../../../domain/fileChangeText';
import {findCachedItem} from '../../../storage/dataCache';
import {ReviewAggregate, ReviewItemRef, ReviewProjectEntry, ReviewShelvedTaskEntry} from '../../../storage/reviewAggregate';
import {SettableStatus, setItemStatus} from '../../../storage/statusControl';
import {displayPath} from '../../../supernote/fileSystem';
import {log} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import {COLUMN_WIDTH_PX, itemEntryHeight} from '../../../ui/itemEntryRow';
import ReviewMasterDetail from '../../../ui/ReviewMasterDetail';
import {useStatusApi} from '../../../ui/status/StatusProvider';
import {changedOnDisk, reviewCurrentItem, ReviewEmptyDetail, ReviewLeftRow, ReviewStepProps, SETTINGS_NOT_LOADED} from '../shared';
import {bump, setActivationCandidates} from '../reviewVisit';
import {useFrozenStepList} from '../useFrozenStepList';
import {useStatusConfirm} from '../../../ui/useStatusConfirm';
import {DoneOnHoldDetail, ReviewItemDetail} from './ItemDetails';
import {mutateEntryTasks} from '../../../storage/itemMutations';

export type ItemStepId = 'stalled' | 'neglected' | 'done' | 'onHold';

type ItemRow = ReviewProjectEntry | ReviewItemRef;

const refOf = (row: ItemRow): ReviewItemRef => ('item' in row ? row.item : row);

interface StepText {
  header: string;
  emptyHint: string;
  /** The detail column before anything is selected. */
  idle: {title: string; text: string; hint: string};
}

const TEXT: Record<ItemStepId, StepText> = {
  stalled: {
    header: 'Stalled projects',
    emptyHint: 'No stalled projects - nice.',
    idle: {
      title: 'No project selected',
      text: "These are active projects with no actionable next task — everything open is done, cancelled, or shelved to Someday/Maybe. Add a next task to move it forward, or put it on hold if it isn't a priority right now.",
      hint: 'Tap a project on the left to get started.',
    },
  },
  neglected: {
    header: 'Neglected areas',
    emptyHint: 'No neglected areas - nice.',
    idle: {
      title: 'No area selected',
      text: "These are active areas with no actionable next task — everything open is done, cancelled, or shelved to Someday/Maybe. Add a next task to keep this area moving, or put it on hold if it isn't getting your attention right now.",
      hint: 'Tap an area on the left to get started.',
    },
  },
  done: {
    header: 'Done awaiting review',
    emptyHint: 'Nothing marked Done right now.',
    idle: {
      title: 'No project selected',
      text: "These projects are marked Done. Check their tasks and meetings below for anything still open before archiving, or reactivate if there's more to do.",
      hint: 'Tap a project on the left to get started.',
    },
  },
  onHold: {
    header: 'On Hold reconsideration',
    emptyHint: 'Nothing On Hold right now.',
    idle: {
      title: 'No item selected',
      text: "These projects and areas are On Hold. Decide whether to reactivate them, mark a project Done, or archive it if it's no longer relevant.",
      hint: 'Tap an item on the left to get started.',
    },
  },
};

function sourceFor(step: ItemStepId, aggregate: ReviewAggregate | null): ItemRow[] | undefined {
  if (!aggregate) return undefined;
  if (step === 'stalled') return aggregate.stalledProjects;
  if (step === 'neglected') return aggregate.neglectedAreas;
  if (step === 'done') return aggregate.doneProjects;
  return aggregate.onHoldItems;
}

/**
 * Review steps over a list of items: Stalled projects, Neglected areas (an
 * item without an actionable next task), Done awaiting review and On Hold
 * reconsideration. The list is frozen for the visit (useFrozenStepList): an
 * item the user changed stays listed with a checkmark and can be reopened.
 * Projects archive through the close-out checklist (`onStartCloseOut`),
 * Areas directly after a confirm.
 */
export default function ItemListStep({
  step,
  onStartCloseOut,
  data,
  stepEntryToken,
  onOpenItem,
  onAddTask,
  textColor,
  borderColor,
  placeholderColor,
}: ReviewStepProps & {
  step: ItemStepId;
  onStartCloseOut?: (projectPath: string, mode: 'full' | 'quick') => void;
}): React.JSX.Element {
  const {items, settings, aggregate, refreshFromCache} = data;
  const frozen = useFrozenStepList<ItemRow>(sourceFor(step, aggregate), stepEntryToken);
  const statusApi = useStatusApi();
  const confirmArchive = useStatusConfirm('ReviewScreen.archiveConfirm');
  const text = TEXT[step];
  // Every render agrees on "now" for the goal rows (ui/ItemContextBlock.tsx).
  const currentWeekKey = isoWeekKey(new Date());

  // Stalled/Neglected: leaving the step counts how many picked up a next task.
  useEffect(() => {
    if (step === 'stalled' || step === 'neglected') setActivationCandidates(frozen.list as ReviewProjectEntry[]);
  }, [step, frozen.list]);

  const changeStatus = async (itemRef: ReviewItemRef, status: SettableStatus): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw changedOnDisk(itemRef.name);
    await setItemStatus(cachedItem, status);
    log('ReviewScreen: status changed', itemRef.path, status);
    refreshFromCache();
    if (status === 'active') bump('reactivated');
    else if (status === 'on-hold') bump('onHold');
    else bump('markedDone');
    frozen.markActed(itemRef.path);
    requestEinkRefresh();
  };

  /** Archives after a confirm naming the target folder (and the folder left empty, if any). Projects go through the close-out checklist instead. */
  const archive = async (itemRef: ReviewItemRef): Promise<void> => {
    if (itemRef.kind === 'project' && onStartCloseOut) {
      onStartCloseOut(itemRef.path, 'quick');
      return;
    }
    if (!settings) throw new Error(SETTINGS_NOT_LOADED);
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw changedOnDisk(itemRef.name);
    const target = archiveTargetsFor(cachedItem, settings);
    const leavesEmpty = await archiveLeavesEmptyFolder(cachedItem, settings);
    const confirmed = await confirmArchive({
      text: `Move "${itemRef.name}" to ${displayPath(target.folder)}?`,
      detail:
        `This moves the folder ${displayPath(itemRef.path)} into ${displayPath(target.folder)}.` +
        (leavesEmpty ? emptyFolderConfirmNote(displayPath(itemRef.path), displayPath(target.folder)) : '') +
        ' gtdpara will not show it here again.',
      actionLabel: 'Move to Archive',
    });
    if (!confirmed) return;
    const result = await archiveItem(cachedItem, settings, undefined, {deleteEmptySource: leavesEmpty});
    log('ReviewScreen: archived', itemRef.path);
    const doneId = 'ReviewScreen.archiveDone';
    statusApi.show(doneId, {
      kind: result.keptEmptyFolder ? 'info' : 'success',
      text: archiveDoneText(itemRef.name, displayPath(result.path), result.keptEmptyFolder ? displayPath(result.keptEmptyFolder) : null),
      onDismiss: () => statusApi.clear(doneId),
    });
    refreshFromCache();
    bump('archived');
    frozen.markActed(itemRef.path);
    requestEinkRefresh();
  };

  /** "→ Next" on a shelved Someday/Maybe task: it becomes the item's next action. */
  const promoteToNext = async (entry: ReviewShelvedTaskEntry): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.tasks[entry.taskIndex];
    if (!cachedItem || !current) throw changedOnDisk(entry.task.text);
    await mutateEntryTasks(
      {item: entry.item, taskIndex: entry.taskIndex, task: current},
      tasks => tasks.map((t, i) => (i === entry.taskIndex ? {...t, ...retag(t.text)} : t)),
      {inbox: null, inboxPath: null},
    );
    log('ReviewScreen: promoted shelved task to Next', entry.item.path, entry.taskIndex);
    refreshFromCache();
    requestEinkRefresh();
  };

  const renderDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) return <ReviewEmptyDetail {...text.idle} textColor={textColor} />;
    const row = frozen.list.find(r => refOf(r).path === selectedKey);
    if (!row) return null;
    const itemRef = refOf(row);
    if ('item' in row) {
      return (
        <ReviewItemDetail
          entry={row}
          hint="No open tasks."
          statusOptions={step === 'stalled' ? ['active', 'on-hold', 'done'] : ['active', 'on-hold']}
          items={items}
          currentWeekKey={currentWeekKey}
          onOpenItem={onOpenItem}
          onAddTask={onAddTask}
          onStatusChange={changeStatus}
          onArchive={archive}
          onPromoteToNext={promoteToNext}
          onContextChanged={refreshFromCache}
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />
      );
    }
    return (
      <DoneOnHoldDetail
        itemRef={itemRef}
        showMarkDone={step === 'onHold' && itemRef.kind === 'project'}
        closeOut={
          step === 'done' && onStartCloseOut && itemRef.kind === 'project'
            ? {onFull: () => onStartCloseOut(itemRef.path, 'full'), onQuick: () => onStartCloseOut(itemRef.path, 'quick')}
            : undefined
        }
        items={items}
        currentWeekKey={currentWeekKey}
        onOpenItem={onOpenItem}
        onReactivate={i => changeStatus(i, 'active')}
        onMarkDone={i => changeStatus(i, 'done')}
        onArchive={archive}
        onContextChanged={refreshFromCache}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  return (
    <ReviewMasterDetail<ItemRow>
      header={text.header}
      rows={frozen.list}
      rowHeight={row => itemEntryHeight(reviewCurrentItem(refOf(row), items), COLUMN_WIDTH_PX)}
      isSelectable={() => true}
      rowKey={row => refOf(row).path}
      renderRow={(row, selected, actedOn) => (
        <ReviewLeftRow
          current={reviewCurrentItem(refOf(row), items)}
          selected={selected}
          actedOn={actedOn}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderDetail}
      actedOnKeys={frozen.actedOn}
      resetKey={stepEntryToken}
      emptyHint={text.emptyHint}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

function retag(text: string): {text: string} & ReturnType<typeof deriveTaskFields> {
  const next = setFlowStateTag(text, 'next');
  return {text: next, ...deriveTaskFields(next)};
}
