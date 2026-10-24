// docs/dev/history/technical-design-kept-gtd.md §3.3: the one-time copy of saved profiles.
import {profilesToCopy} from '../../src/domain/profileCopy';

it('copies every profile file but the demo while the new folder holds none (K1)', () => {
  expect(profilesToCopy([], ['work.json', 'home.json', 'demo.json'], 'demo')).toEqual(['work.json', 'home.json']);
});

it('copies nothing once the new folder holds a profile file (K2, K3)', () => {
  expect(profilesToCopy(['work.json'], ['work.json', 'home.json'], 'demo')).toEqual([]);
  expect(profilesToCopy(['demo.json'], ['home.json'], 'demo')).toEqual([]);
});

it('copies nothing when the old folder is missing or empty (K4)', () => {
  expect(profilesToCopy([], [], 'demo')).toEqual([]);
});

it('ignores files that are not profiles, in either folder', () => {
  expect(profilesToCopy(['notes.txt'], ['readme.txt', 'Work.JSON'], 'demo')).toEqual(['Work.JSON']);
  expect(profilesToCopy([], ['DEMO.json'], 'demo')).toEqual([]);
});
