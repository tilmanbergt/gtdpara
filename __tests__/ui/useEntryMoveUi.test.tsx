// docs/dev/history/technical-design-files-0.6.md §3.4: confirm + success message for moving an entry with its note.
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {EntryMoveUi} from '../../src/storage/entryMove';
import {createScreenActivity, ScreenActivityContext} from '../../src/ui/screenActivity';
import {StatusEntry, StatusProvider, useStatusList} from '../../src/ui/status/StatusProvider';
import {useEntryMoveUi} from '../../src/ui/useEntryMoveUi';

jest.mock('../../src/storage/entryMove', () => ({}));

let moveUi: EntryMoveUi | null = null;
let list: StatusEntry[] = [];

function Probe(): null {
  moveUi = useEntryMoveUi('Test');
  list = useStatusList();
  return null;
}

const text = {text: 'Move "Call" to Beta? Its note Call.note moves along.', detail: 'detail', actionLabel: 'Move'};

describe('useEntryMoveUi', () => {
  it('confirms, then shows the success message until the tab is hidden', async () => {
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
    let result: Promise<boolean> = Promise.resolve(false);
    act(() => {
      result = moveUi!.confirm(text);
    });
    expect(list[0].msg).toMatchObject({kind: 'confirm', text: text.text});
    act(() => list[0].msg.actions![0].onPress());
    await expect(result).resolves.toBe(true);

    act(() => moveUi!.done('Moved "Call" to Beta, with its note.'));
    expect(list).toHaveLength(1);
    expect(list[0].msg).toMatchObject({kind: 'success', text: 'Moved "Call" to Beta, with its note.'});
    act(() => activity.set(false));
    expect(list).toHaveLength(0);
  });

  it('a new move clears the previous success message', async () => {
    act(() => {
      TestRenderer.create(
        <StatusProvider>
          <Probe />
        </StatusProvider>,
      );
    });
    act(() => moveUi!.done('Moved "A" to Beta, with its note.'));
    act(() => {
      moveUi!.confirm(text);
    });
    expect(list).toHaveLength(1);
    expect(list[0].msg.kind).toBe('confirm');
  });
});
