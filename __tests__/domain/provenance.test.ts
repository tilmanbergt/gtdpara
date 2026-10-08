// docs/dev/history/technical-design-tending-threads.md §3.4, D11, D12, D14: provenance key, line and resolution.
jest.mock('sn-plugin-lib', () => ({PluginManager: {}}));
jest.mock('../../src/supernote/fileSystem', () => ({}));
import {deriveMeetingFields, parseTasksSpan, serializeTaskLine} from '../../src/domain/markdown';
import {buildTask} from '../../src/storage/itemMutations';
import {applyProvenance, meetingKey, provenanceLabel, resolveProvenance} from '../../src/domain/provenance';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {Meeting} from '../../src/domain/types';
import {meeting, task} from '../../test-helpers/fixtures';

function m(date: string, title: string, extra: Partial<Meeting> = {}): Meeting {
  return meeting(date, title, {...deriveMeetingFields(title), ...extra});
}

const retro = m('2026-09-30', 'Retro alpha #retro/alpha #reviewed');

describe('meetingKey', () => {
  it('is the page keyword without state tags', () => {
    expect(meetingKey(retro)).toBe('2026-09-30 Retro alpha retro/alpha');
  });
  it('drops "#" but keeps the tag text, so Obsidian sees no tags in the field', () => {
    const mieke = m('2026-10-08', '1:1 Mieke #mh #101/mieke');
    expect(meetingKey(mieke)).toBe('2026-10-08 1:1 Mieke mh 101/mieke');
    const line = applyProvenance('Send agenda', meetingKey(mieke));
    expect(line).toBe('Send agenda [meeting:: 2026-10-08 1:1 Mieke mh 101/mieke]');
    expect(buildTask(line, {today: '2026-10-08'}).tags).toEqual([]);
  });
  it('leaves out brackets so the field stays one token', () => {
    expect(meetingKey(m('2026-09-30', 'Plan [draft]'))).toBe('2026-09-30 Plan draft');
  });
});

describe('applyProvenance', () => {
  it('sets only the meeting field, before other fields, and adds no tags', () => {
    expect(applyProvenance('Send notes #next [due:: 2026-10-09]', meetingKey(retro))).toBe(
      'Send notes #next [meeting:: 2026-09-30 Retro alpha retro/alpha] [due:: 2026-10-09]',
    );
  });
  it('keeps the tags the user typed, also those of another thread', () => {
    const mieke = m('2026-09-30', '1:1 Mieke #101/mieke');
    expect(applyProvenance('Raise budget question #101/sven', meetingKey(mieke))).toBe(
      'Raise budget question #101/sven [meeting:: 2026-09-30 1:1 Mieke 101/mieke]',
    );
  });
  it('round-trips through buildTask and the task line writer', () => {
    const line = applyProvenance('Send notes', meetingKey(retro));
    const built = buildTask(line, {today: '2026-10-08'});
    expect(built.text).toBe('Send notes');
    expect(built.tags).toEqual([]);
    expect(built.fields.meeting).toBe('2026-09-30 Retro alpha retro/alpha');
    expect(serializeTaskLine(built)).toBe(
      '- [ ] Send notes [meeting:: 2026-09-30 Retro alpha retro/alpha] [created:: 2026-10-08]',
    );
    expect(parseTasksSpan(`## Tasks\n${serializeTaskLine(built)}\n`).tasks[0].fields.meeting).toBe(built.fields.meeting);
  });
});

describe('provenanceLabel', () => {
  it('names the meeting and its day, nothing else', () => {
    expect(provenanceLabel(retro, '2026-10-08')).toBe('↳ from Retro alpha · Wed 30.9.');
    expect(provenanceLabel(m('2026-09-30', 'Kickoff #client'), '2026-10-08')).toBe('↳ from Kickoff · Wed 30.9.');
  });
});

describe('resolveProvenance', () => {
  const agreed = (key: string, text = 'Send notes #retro/alpha') =>
    task(text, {fields: {...emptyTaskFields(), meeting: key}});

  it('finds the exact meeting, preferring the scope', () => {
    const sources = [
      {path: '/other', meetings: [retro]},
      {path: '/area', meetings: [m('2026-09-23', 'Retro alpha #retro/alpha'), retro]},
    ];
    expect(resolveProvenance(agreed(meetingKey(retro)), sources, ['/area'])).toMatchObject({path: '/area', meetingIndex: 1, exact: true});
    expect(resolveProvenance(agreed(meetingKey(retro)), sources, [])).toMatchObject({path: '/other', meetingIndex: 0, exact: true});
  });

  it('tells two same-titled meetings on one day apart by their tags', () => {
    const a = m('2026-10-08', '1:1 #101/mieke');
    const b = m('2026-10-08', '1:1 #101/tom');
    expect(meetingKey(a)).not.toBe(meetingKey(b));
    const sources = [{path: '/area', meetings: [a, b]}];
    expect(resolveProvenance(agreed(meetingKey(b), 'Follow up #101/tom'), sources, ['/area'])).toMatchObject({meetingIndex: 1, exact: true});
    expect(resolveProvenance(agreed(meetingKey(a), 'Follow up #101/mieke'), sources, ['/area'])).toMatchObject({meetingIndex: 0, exact: true});
  });

  it('matches a hand-written key that still has "#"', () => {
    const sources = [{path: '/area', meetings: [retro]}];
    expect(resolveProvenance(agreed('2026-09-30 Retro alpha #retro/alpha'), sources, ['/area'])).toMatchObject({exact: true});
  });

  it('falls back to the date and the meeting\'s thread tags found in the key after a rename', () => {
    const renamed = m('2026-09-30', 'Sprint retro #retro/alpha');
    const sources = [{path: '/area', meetings: [m('2026-09-30', 'Other #review/beta'), renamed]}];
    expect(resolveProvenance(agreed('2026-09-30 Retro alpha retro/alpha'), sources, ['/area'])).toMatchObject({
      meetingIndex: 1,
      exact: false,
    });
  });

  it('does not consult the todo\'s own tags for the fallback', () => {
    const renamed = m('2026-09-30', '1:1 #101/mieke');
    const sources = [{path: '/area', meetings: [m('2026-09-30', 'Sync #101/sven'), renamed]}];
    // Agreed with Mieke, to be raised with Sven: the key names Mieke's thread, the tag Sven's.
    const raised = agreed('2026-09-30 1:1 Mieke 101/mieke', 'Raise budget #101/sven');
    expect(resolveProvenance(raised, sources, ['/area'])).toMatchObject({meetingIndex: 1, exact: false});
    // A key without thread tags has no fallback, whatever the todo is tagged with.
    expect(resolveProvenance(agreed('2026-09-30 1:1 Mieke', 'Raise budget #101/mieke'), sources, ['/area'])).toBeNull();
  });

  it('matches a deeper tag in the key to the meeting\'s thread', () => {
    const sources = [{path: '/area', meetings: [m('2026-09-30', 'Renamed #retro/alpha')]}];
    expect(resolveProvenance(agreed('2026-09-30 Retro retro/alpha/2026'), sources, ['/area'])).toMatchObject({exact: false});
  });

  it('is unresolved without a match', () => {
    const sources = [{path: '/area', meetings: [m('2026-09-30', 'Other #review/beta')]}];
    expect(resolveProvenance(agreed('2026-09-30 Retro alpha #retro/alpha'), sources, ['/area'])).toBeNull();
    expect(resolveProvenance(agreed('2026-09-30 Retro alpha', 'Send notes'), sources, ['/area'])).toBeNull();
    expect(resolveProvenance(task('No field'), sources, ['/area'])).toBeNull();
  });
});
