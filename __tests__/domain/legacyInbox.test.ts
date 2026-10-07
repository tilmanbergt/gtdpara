import {checkLegacyInboxLeftovers, legacyInboxLeftovers, ListedEntry} from '../../src/domain/integrityCheck';

const BASE = '/storage/emulated/0/Note';
const TARGET = `${BASE}/2 Areas/0 Inbox`;
const file = (name: string): ListedEntry => ({name, isFolder: false});
const folder = (name: string): ListedEntry => ({name, isFolder: true});

describe('Inbox left at the base root (up to 0.1.0)', () => {
  it('lists leftovers at the root', () => {
    expect(legacyInboxLeftovers([file('Inbox.txt'), folder('Todos'), folder('2 Areas')])).toEqual(['Inbox.txt', 'Todos/']);
    expect(legacyInboxLeftovers([folder('2 Areas'), file('Todos')])).toEqual([]);
  });

  it('turns leftovers into one Integrity Check finding that says how to move them', () => {
    expect(checkLegacyInboxLeftovers([folder('2 Areas')], BASE, TARGET)).toEqual([]);
    const findings = checkLegacyInboxLeftovers([file('Inbox.txt'), folder('Meetings')], BASE, TARGET);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({checkId: 'legacyInboxLeftovers', itemKind: 'inbox', entityLabel: 'Inbox.txt, Meetings/'});
    expect(findings[0].message).toContain('by hand');
  });
});
