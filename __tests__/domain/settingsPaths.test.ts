import {
  DEFAULT_SETTINGS,
  findEnclosingItem,
  isInboxFolder,
  isUnderInboxFolder,
  resolvePaths,
  validateInboxFolderName,
} from '../../src/domain/settings';
import {PROFILE_KEYS} from '../../src/domain/profiles';

const BASE = '/storage/emulated/0/Note';

describe('Inbox paths', () => {
  it('puts the Inbox in its own folder under Areas by default', () => {
    const p = resolvePaths(DEFAULT_SETTINGS);
    expect(p.inboxFolder).toBe(`${BASE}/2 Areas/0 Inbox`);
    expect(p.inbox).toBe(`${BASE}/2 Areas/0 Inbox/Inbox.txt`);
  });

  it('follows custom names and ignores stray slashes and spaces', () => {
    const p = resolvePaths({...DEFAULT_SETTINGS, baseRoot: `${BASE}/`, areasFolder: 'Areas/', inboxFolder: ' Inbox '});
    expect(p.inboxFolder).toBe(`${BASE}/Areas/Inbox`);
    expect(resolvePaths({...DEFAULT_SETTINGS, inboxFolder: ''}).inboxFolder).toBe(`${BASE}/2 Areas/0 Inbox`);
  });

  it('recognizes the Inbox folder and what is under it', () => {
    const p = resolvePaths(DEFAULT_SETTINGS);
    expect(isInboxFolder(p, `${BASE}/2 Areas/0 Inbox`)).toBe(true);
    expect(isInboxFolder(p, `${BASE}/2 Areas/0 Inbox/`)).toBe(true);
    expect(isInboxFolder(p, `${BASE}/2 Areas/0 Inbox 2`)).toBe(false);
    expect(isUnderInboxFolder(p, `${BASE}/2 Areas/0 Inbox/Todos/x.note`)).toBe(true);
    expect(isUnderInboxFolder(p, `${BASE}/2 Areas/Home/Todos/x.note`)).toBe(false);
  });

  it('never treats a note in the Inbox folder as an Area note', () => {
    const p = resolvePaths(DEFAULT_SETTINGS);
    expect(findEnclosingItem(p, `${BASE}/2 Areas/0 Inbox/Todos/x.note`)).toBeNull();
    expect(findEnclosingItem(p, `${BASE}/2 Areas/0 Inbox 2/x.note`)).toEqual({kind: 'area', name: '0 Inbox 2', path: `${BASE}/2 Areas/0 Inbox 2`});
    expect(findEnclosingItem(p, `${BASE}/2 Areas/Home/Todos/x.note`)).toEqual({kind: 'area', name: 'Home', path: `${BASE}/2 Areas/Home`});
  });

  it('validates Inbox folder names', () => {
    expect(validateInboxFolderName('0 Inbox')).toBeNull();
    expect(validateInboxFolderName('  ')).not.toBeNull();
    expect(validateInboxFolderName('a/b')).not.toBeNull();
    expect(validateInboxFolderName('.hidden')).not.toBeNull();
    expect(validateInboxFolderName('x'.repeat(61))).not.toBeNull();
  });

  it('switches with the profile', () => {
    expect(PROFILE_KEYS).toContain('inboxFolder');
  });
});
