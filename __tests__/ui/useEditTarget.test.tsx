// ui/useEditTarget.ts: one selected item (card or edit) and one arm per screen, save-then-switch.
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useEditTarget} from '../../src/ui/useEditTarget';

type Ref = {type: 'task' | 'meeting'; index: number};
type Arm = Ref & {intent: 'link' | 'file'};
let edit: ReturnType<typeof useEditTarget<Ref, Arm>>;

function Probe(): null {
  edit = useEditTarget<Ref, Arm>();
  return null;
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  act(() => {
    TestRenderer.create(<Probe />);
  });
});

describe('useEditTarget', () => {
  it('starts right away when no edit is open', () => {
    act(() => edit.start({type: 'task', index: 1}));
    expect(edit.target).toEqual({type: 'task', index: 1});
  });

  it('switches to another row only after the open edit saved', async () => {
    act(() => edit.start({type: 'task', index: 1}));
    const flush = jest.fn(async () => true);
    edit.flushEditRef.current = flush;
    act(() => edit.start({type: 'meeting', index: 0}));
    expect(flush).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(edit.target).toEqual({type: 'meeting', index: 0});
  });

  it('stays on the open edit when its save fails', async () => {
    act(() => edit.start({type: 'task', index: 1}));
    edit.flushEditRef.current = async () => false;
    act(() => edit.start({type: 'task', index: 2}));
    await flushPromises();
    expect(edit.target).toEqual({type: 'task', index: 1});
  });

  it('arming keeps the edit open; cancel clears both', () => {
    act(() => edit.start({type: 'task', index: 1}));
    act(() => edit.armFor({type: 'task', index: 1, intent: 'file'}));
    expect(edit.target).toEqual({type: 'task', index: 1});
    expect(edit.arm).toEqual({type: 'task', index: 1, intent: 'file'});
    act(() => edit.cancel());
    expect(edit.target).toBeNull();
    expect(edit.arm).toBeNull();
  });

  it('starting another edit ends an open arm', () => {
    act(() => edit.armFor({type: 'meeting', index: 0, intent: 'link'}));
    act(() => edit.start({type: 'task', index: 3}));
    expect(edit.arm).toBeNull();
  });

  it('select shows the card; a second select on it opens the edit form', () => {
    act(() => edit.select({type: 'meeting', index: 0}));
    expect(edit.target).toEqual({type: 'meeting', index: 0});
    expect(edit.mode).toBe('card');
    act(() => edit.select({type: 'meeting', index: 0}));
    expect(edit.mode).toBe('edit');
  });

  it('a tap on the row being edited neither saves nor changes anything', () => {
    act(() => edit.start({type: 'meeting', index: 0}));
    const flush = jest.fn(async () => true);
    edit.flushEditRef.current = flush;
    act(() => edit.select({type: 'meeting', index: 0}));
    expect(flush).not.toHaveBeenCalled();
    expect(edit.mode).toBe('edit');
  });

  it('selecting another row while editing saves first and lands on its card', async () => {
    act(() => edit.start({type: 'meeting', index: 0}));
    const flush = jest.fn(async () => true);
    edit.flushEditRef.current = flush;
    act(() => edit.select({type: 'meeting', index: 1}));
    await flushPromises();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(edit.target).toEqual({type: 'meeting', index: 1});
    expect(edit.mode).toBe('card');
  });

  it('a failed save keeps the edit open', async () => {
    act(() => edit.start({type: 'meeting', index: 0}));
    edit.flushEditRef.current = async () => false;
    act(() => edit.select({type: 'meeting', index: 1}));
    await flushPromises();
    expect(edit.target).toEqual({type: 'meeting', index: 0});
    expect(edit.mode).toBe('edit');
  });

  it('edit() opens the form, saved() returns to the card, cancel() closes it and the arm', () => {
    act(() => edit.select({type: 'meeting', index: 0}));
    act(() => edit.edit());
    expect(edit.mode).toBe('edit');
    act(() => edit.saved());
    expect(edit.mode).toBe('card');
    expect(edit.target).toEqual({type: 'meeting', index: 0});
    act(() => edit.armFor({type: 'meeting', index: 0, intent: 'link'}));
    expect(edit.target).toEqual({type: 'meeting', index: 0});
    act(() => edit.cancel());
    expect(edit.target).toBeNull();
    expect(edit.arm).toBeNull();
  });

  it('start() is select + edit', () => {
    act(() => edit.start({type: 'task', index: 2}));
    expect(edit.mode).toBe('edit');
  });
});
