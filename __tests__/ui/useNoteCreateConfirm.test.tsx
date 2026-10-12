// docs/dev/history/technical-design-split-by-tag.md §3.5: the status-slot confirm hook.

jest.mock('../../src/supernote/fileSystem', () => ({
  displayPath: (p: string) => p.replace(/^\/storage\/emulated\/0\//, ''),
}));

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {NoteCreationPlan} from '../../src/domain/noteCreationPlan';
import {createScreenActivity, ScreenActivityContext} from '../../src/ui/screenActivity';
import {StatusEntry, StatusProvider, useStatusList} from '../../src/ui/status/StatusProvider';
import {useNoteCreateConfirm} from '../../src/ui/useNoteCreateConfirm';

const plan: NoteCreationPlan = {
  kind: 'new-page',
  file: 'Meetings/Coaching sabina 2026.note',
  absolutePath: '/storage/emulated/0/Note/2 Areas/Coaching/Meetings/Coaching sabina 2026.note',
  setupName: 'Coaching',
};

let confirm: (p: NoteCreationPlan) => Promise<number | null> = async () => null;
let list: StatusEntry[] = [];

function Probe(): null {
  confirm = useNoteCreateConfirm('Test.noteCreateConfirm');
  list = useStatusList();
  return null;
}

function mount() {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <StatusProvider>
        <Probe />
      </StatusProvider>,
    );
  });
  return renderer!;
}

describe('useNoteCreateConfirm', () => {
  it('shows the plan in the slot and resolves 0 on the button', async () => {
    mount();
    let result: Promise<number | null> = Promise.resolve(null);
    act(() => {
      result = confirm(plan);
    });
    expect(list).toHaveLength(1);
    expect(list[0].msg).toMatchObject({kind: 'confirm', text: 'Coaching: new page in Meetings/Coaching sabina 2026.note'});
    expect(list[0].msg.detail).toContain('Note/2 Areas/Coaching/Meetings/Coaching sabina 2026.note');
    act(() => list[0].msg.actions![0].onPress());
    await expect(result).resolves.toBe(0);
    expect(list).toHaveLength(0);
  });

  it('resolves null on ✕', async () => {
    mount();
    let result: Promise<number | null> = Promise.resolve(0);
    act(() => {
      result = confirm(plan);
    });
    act(() => list[0].msg.onCancel!());
    await expect(result).resolves.toBeNull();
    expect(list).toHaveLength(0);
  });

  it('a second request cancels the first one', async () => {
    mount();
    let first: Promise<number | null> = Promise.resolve(0);
    let second: Promise<number | null> = Promise.resolve(null);
    act(() => {
      first = confirm(plan);
    });
    act(() => {
      second = confirm({...plan, kind: 'new-shared-file'});
    });
    await expect(first).resolves.toBeNull();
    expect(list).toHaveLength(1);
    expect(list[0].msg.text).toContain('new file');
    act(() => list[0].msg.actions![0].onPress());
    await expect(second).resolves.toBe(0);
  });

  it('unmounting resolves a pending confirm false', async () => {
    const renderer = mount();
    let result: Promise<number | null> = Promise.resolve(0);
    act(() => {
      result = confirm(plan);
    });
    act(() => renderer.unmount());
    await expect(result).resolves.toBeNull();
  });
});

describe('useNoteCreateConfirm with an alternative', () => {
  it('shows a second button and resolves 1 on it', async () => {
    mount();
    const alternative: NoteCreationPlan = {kind: 'new-page', file: 'Lab x 2026.note', absolutePath: '/n/Lab x 2026.note', setupName: 'Sparring'};
    let result: Promise<number | null> = Promise.resolve(null);
    act(() => {
      result = confirm({...plan, alternatives: [alternative]});
    });
    expect(list[0].msg.actions!.map(a => [a.label, a.primary])).toEqual([
      ['Add page', true],
      ['In Sparring', false],
    ]);
    act(() => list[0].msg.actions![1].onPress());
    await expect(result).resolves.toBe(1);
  });
});

describe('useNoteCreateConfirm in a kept tab', () => {
  it('hiding the tab resolves a pending confirm false and clears it', async () => {
    const activity = createScreenActivity(true);
    act(() => {
      TestRenderer.create(
        <StatusProvider>
          <ScreenActivityContext.Provider value={activity}>
            <Probe />
          </ScreenActivityContext.Provider>
        </StatusProvider>,
      );
    });
    let result: Promise<number | null> = Promise.resolve(0);
    act(() => {
      result = confirm(plan);
    });
    expect(list).toHaveLength(1);
    act(() => activity.set(false));
    await expect(result).resolves.toBeNull();
    expect(list).toHaveLength(0);
  });
});
