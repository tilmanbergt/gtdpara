// screens/review/useFrozenStepList.ts: a Review step's list stays as it was when the step was entered.
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {FrozenStepList, useFrozenStepList} from '../../src/screens/review/useFrozenStepList';

let frozen: FrozenStepList<string>;

function Probe({source, resetKey}: {source: string[] | null; resetKey: number}): null {
  frozen = useFrozenStepList(source, resetKey);
  return null;
}

describe('useFrozenStepList', () => {
  it('freezes the first source and ignores later changes', () => {
    let r: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe source={['a', 'b']} resetKey={1} />);
    });
    act(() => r.update(<Probe source={['b']} resetKey={1} />));
    expect(frozen.list).toEqual(['a', 'b']);
  });

  it('freezes once the source arrives', () => {
    let r: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe source={null} resetKey={1} />);
    });
    expect(frozen.list).toEqual([]);
    act(() => r.update(<Probe source={['a']} resetKey={1} />));
    act(() => r.update(<Probe source={['a', 'c']} resetKey={1} />));
    expect(frozen.list).toEqual(['a']);
  });

  it('marks and unmarks acted-on rows; a new reset key refreezes and clears them', () => {
    let r: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe source={['a', 'b']} resetKey={1} />);
    });
    act(() => frozen.markActed('a'));
    expect(frozen.actedOn.has('a')).toBe(true);
    act(() => frozen.markActed('a', false));
    expect(frozen.actedOn.has('a')).toBe(false);
    act(() => frozen.markActed('b'));
    act(() => r.update(<Probe source={['c']} resetKey={2} />));
    expect(frozen.list).toEqual(['c']);
    expect(frozen.actedOn.size).toBe(0);
  });

  it('appends a row once', () => {
    act(() => {
      TestRenderer.create(<Probe source={['a']} resetKey={1} />);
    });
    act(() => frozen.append('b', x => x));
    act(() => frozen.append('b', x => x));
    expect(frozen.list).toEqual(['a', 'b']);
  });
});
