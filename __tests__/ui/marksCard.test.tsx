// Lasso 0.8 §3.10: the "marks to process" card.
const mockMarks: {list: unknown[]} = {list: []};
jest.mock('../../src/ui/useOpenMarks', () => ({useOpenMarks: () => mockMarks.list}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/domain/meetingTime', () => ({todayIso: () => '2026-10-06'}));

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import MarksCard from '../../src/ui/MarksCard';
import {setOpenMarksHandler} from '../../src/ui/marksNav';

const om = (path: string, createdAt: string) => ({mark: {id: 'm', createdAt, notePath: path, page: 0, text: null}, owner: {type: 'inbox'}, absPath: path});

it('is hidden without marks, shows count and age, and opens the marks screen', () => {
  const opened: unknown[] = [];
  setOpenMarksHandler((scope, returnTo) => opened.push([scope, returnTo]));
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<MarksCard scope={{type: 'all'}} returnTo="inbox" textColor="#000" borderColor="#ddd" />);
  });
  expect(r.toJSON()).toBeNull();
  mockMarks.list = [om('/a.note', '2026-10-04 10:00'), om('/b.note', '2026-10-06 09:00')];
  act(() => {
    r.update(<MarksCard scope={{type: 'item', path: '/P/Garden'}} returnTo="current" textColor="#000" borderColor="#ddd" />);
  });
  const texts = r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
  expect(texts).toEqual(['2 marks to process', '2 notes · oldest 2 days', 'Process ›']);
  act(() => {
    r.root.findByProps({accessibilityRole: 'button'}).props.onPress();
  });
  expect(opened).toEqual([[{type: 'item', path: '/P/Garden'}, 'current']]);
  setOpenMarksHandler(null);
});
