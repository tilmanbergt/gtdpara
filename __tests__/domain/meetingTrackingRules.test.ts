/** Prep/review tracking applies when any matching meeting rule asks for it (docs/dev/history/technical-design-loops.md §1.2). */
import {resolveMeetingTracking} from '../../src/domain/meetingTracking';
import {createEmptyTagRule, TagRule} from '../../src/domain/tagRules';

const rule = (id: string, tags: string[], extra: Partial<TagRule> = {}): TagRule => ({
  ...createEmptyTagRule(id, 'meeting'),
  name: id,
  tags,
  enabled: true,
  ...extra,
});
const NOW = new Date('2026-10-10T08:00:00');
const meeting = (tags: string[]) => ({date: '2026-10-12', time: '', tags, cancelled: false});

describe('resolveMeetingTracking', () => {
  it('tracks when a later matching rule asks for it', () => {
    const rules = [rule('jf', ['jf']), rule('workshop', ['workshop'], {trackPrep: true})];
    expect(resolveMeetingTracking(meeting(['jf/demand', 'workshop/offsite']), rules, NOW)).toEqual({kind: 'prep', done: false});
  });
  it('falls back to the default rule, and tracks nothing without any rule', () => {
    expect(resolveMeetingTracking(meeting(['x']), [rule('d', [], {isDefault: true, trackPrep: true})], NOW)).toEqual({kind: 'prep', done: false});
    expect(resolveMeetingTracking(meeting(['x']), [rule('jf', ['jf'], {trackPrep: true})], NOW)).toBeNull();
  });
});
