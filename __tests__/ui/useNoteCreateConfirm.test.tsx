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
  ruleName: 'Coaching',
};

let confirm: (p: NoteCreationPlan) => Promise<boolean> = async () => false;
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
  it('shows the plan in the slot and resolves true on the button', async () => {
    mount();
    let result: Promise<boolean> = Promise.resolve(false);
    act(() => {
      result = confirm(plan);
    });
    expect(list).toHaveLength(1);
    expect(list[0].msg).toMatchObject({kind: 'confirm', text: 'Rule Coaching: new page in Meetings/Coaching sabina 2026.note'});
    expect(list[0].msg.detail).toContain('Note/2 Areas/Coaching/Meetings/Coaching sabina 2026.note');
    act(() => list[0].msg.actions![0].onPress());
    await expect(result).resolves.toBe(true);
    expect(list).toHaveLength(0);
  });

  it('resolves false on ✕', async () => {
    mount();
    let result: Promise<boolean> = Promise.resolve(true);
    act(() => {
      result = confirm(plan);
    });
    act(() => list[0].msg.onCancel!());
    await expect(result).resolves.toBe(false);
    expect(list).toHaveLength(0);
  });

  it('a second request cancels the first one', async () => {
    mount();
    let first: Promise<boolean> = Promise.resolve(true);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = confirm(plan);
    });
    act(() => {
      second = confirm({...plan, kind: 'new-shared-file'});
    });
    await expect(first).resolves.toBe(false);
    expect(list).toHaveLength(1);
    expect(list[0].msg.text).toContain('new file');
    act(() => list[0].msg.actions![0].onPress());
    await expect(second).resolves.toBe(true);
  });

  it('unmounting resolves a pending confirm false', async () => {
    const renderer = mount();
    let result: Promise<boolean> = Promise.resolve(true);
    act(() => {
      result = confirm(plan);
    });
    act(() => renderer.unmount());
    await expect(result).resolves.toBe(false);
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
    let result: Promise<boolean> = Promise.resolve(true);
    act(() => {
      result = confirm(plan);
    });
    expect(list).toHaveLength(1);
    act(() => activity.set(false));
    await expect(result).resolves.toBe(false);
    expect(list).toHaveLength(0);
  });
});
