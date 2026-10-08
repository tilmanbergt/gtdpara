// docs/dev/history/technical-design-tending-threads.md §3.4, D11: provenance key, line and resolution.
jest.mock('sn-plugin-lib', () => ({PluginManager: {}}));
jest.mock('../../src/supernote/fileSystem', () => ({}));
import {deriveMeetingFields, parseTasksSpan, serializeTaskLine} from '../../src/domain/markdown';
import {buildTask} from '../../src/storage/itemMutations';
import {applyProvenance, meetingKey, provenanceLabel, provenanceOf, resolveProvenance} from '../../src/domain/provenance';
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
    const line = applyProvenance('Send agenda', provenanceOf(mieke));
    expect(line).toBe('Send agenda #101/mieke [meeting:: 2026-10-08 1:1 Mieke mh 101/mieke]');
    expect(buildTask(line, {today: '2026-10-08'}).tags).toEqual(['101/mieke']);
  });
  it('leaves out brackets so the field stays one token', () => {
    expect(meetingKey(m('2026-09-30', 'Plan [draft]'))).toBe('2026-09-30 Plan draft');
  });
});

describe('applyProvenance', () => {
  it('appends missing thread tags and the meeting field before other fields', () => {
    expect(applyProvenance('Send notes #next [due:: 2026-10-09]', provenanceOf(retro))).toBe(
      'Send notes #next #retro/alpha [meeting:: 2026-09-30 Retro alpha retro/alpha] [due:: 2026-10-09]',
    );
  });
  it('does not repeat a tag the text already has, itself or deeper', () => {
    expect(applyProvenance('Send #retro/alpha/x', provenanceOf(retro))).toBe(
      'Send #retro/alpha/x [meeting:: 2026-09-30 Retro alpha retro/alpha]',
    );
  });
  it('round-trips through buildTask and the task line writer', () => {
    const line = applyProvenance('Send notes', provenanceOf(retro));
    const built = buildTask(line, {today: '2026-10-08'});
    expect(built.text).toBe('Send notes #retro/alpha');
    expect(built.tags).toEqual(['retro/alpha']);
    expect(built.fields.meeting).toBe('2026-09-30 Retro alpha retro/alpha');
    expect(serializeTaskLine(built)).toBe(
      '- [ ] Send notes #retro/alpha [meeting:: 2026-09-30 Retro alpha retro/alpha] [created:: 2026-10-08]',
    );
    expect(parseTasksSpan(`## Tasks\n${serializeTaskLine(built)}\n`).tasks[0].fields.meeting).toBe(built.fields.meeting);
  });
});

describe('provenanceLabel', () => {
  it('names the meeting, its day and the added tags', () => {
    expect(provenanceLabel(retro, '2026-10-08')).toBe('↳ from Retro alpha · Wed 30.9. · adds #retro/alpha');
  });
  it('leaves out "adds" without thread tags', () => {
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

  it('falls back to date and a shared thread tag after a rename', () => {
    const renamed = m('2026-09-30', 'Sprint retro #retro/alpha');
    const sources = [{path: '/area', meetings: [m('2026-09-30', 'Other #review/beta'), renamed]}];
    expect(resolveProvenance(agreed('2026-09-30 Retro alpha #retro/alpha'), sources, ['/area'])).toMatchObject({
      meetingIndex: 1,
      exact: false,
    });
  });

  it('is unresolved without a match', () => {
    const sources = [{path: '/area', meetings: [m('2026-09-30', 'Other #review/beta')]}];
    expect(resolveProvenance(agreed('2026-09-30 Retro alpha #retro/alpha'), sources, ['/area'])).toBeNull();
    expect(resolveProvenance(agreed('2026-09-30 Retro alpha', 'Send notes'), sources, ['/area'])).toBeNull();
    expect(resolveProvenance(task('No field'), sources, ['/area'])).toBeNull();
  });
});
