// docs/dev/history/technical-design-engage.md §3.5: the current todo in the settings, per profile.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {PROFILE_KEYS} from '../../src/domain/profiles';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {getEngageCurrent, setEngageCurrent} from '../../src/storage/engageCurrent';

const owner = {kind: 'loop' as const, itemPath: '/Note/2 Areas/Coaching', tag: 'proj/launch'};
const key = {itemPath: '/Note/2 Areas/Coaching', taskText: 'Brief #next', taskIndex: 2};

describe('engageCurrent', () => {
  it('defaults to none and switches with the profile', () => {
    expect(DEFAULT_SETTINGS.engageCurrent).toBeNull();
    expect(PROFILE_KEYS).toContain('engageCurrent');
  });
  it('round-trips and forgets', async () => {
    expect(await getEngageCurrent()).toBeNull();
    await setEngageCurrent(owner, key);
    expect(await getEngageCurrent()).toEqual({owner, key});
    await setEngageCurrent(owner, null);
    expect(await getEngageCurrent()).toBeNull();
  });
});
