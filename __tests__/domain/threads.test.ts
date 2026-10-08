// docs/dev/history/technical-design-tending-threads.md §1.2, §3.2: threads, counterparts and scope.
import {validateAbbrev} from '../../src/domain/abbrev';
import {deriveFlowState, isContextTag} from '../../src/domain/flowState';
import {
  belongsToCounterpart,
  belongsToThread,
  inThreadLens,
  isCounterpartType,
  owedTo,
  scopeOf,
  threadOf,
  threadsOfTags,
  typesForCounterpart,
} from '../../src/domain/threads';
import {item} from '../../test-helpers/fixtures';

describe('threadOf', () => {
  it('splits a nested tag into type, counterpart and thread', () => {
    expect(threadOf('retro/alpha')).toEqual({type: 'retro', counterpart: 'alpha', tag: 'retro/alpha'});
  });
  it('drops deeper segments', () => {
    expect(threadOf('coaching/client-a/2026')).toEqual({type: 'coaching', counterpart: 'client-a', tag: 'coaching/client-a'});
  });
  it('is null for a plain tag', () => {
    expect(threadOf('alpha')).toBeNull();
    expect(threadOf('retro/')).toBeNull();
  });
  it('lists the threads of tags once each', () => {
    expect(threadsOfTags(['next', 'retro/alpha', 'retro/alpha/x', 'wf/max']).map(t => t.tag)).toEqual(['retro/alpha', 'wf/max']);
  });
});

describe('matching', () => {
  const thread = threadOf('retro/alpha')!;
  it('belongs to the thread by its tag or a deeper one', () => {
    expect(belongsToThread(['retro/alpha'], thread)).toBe(true);
    expect(belongsToThread(['retro/alpha/2026'], thread)).toBe(true);
    expect(belongsToThread(['retro/alphabet'], thread)).toBe(false);
  });
  it('never reaches down from a plain parent tag', () => {
    expect(belongsToThread(['retro'], thread)).toBe(false);
    expect(inThreadLens(['retro'], thread)).toBe(false);
  });
  it('shows a plain leaf in every thread of the counterpart', () => {
    expect(belongsToThread(['alpha'], thread)).toBe(false);
    expect(inThreadLens(['alpha'], thread)).toBe(true);
    expect(inThreadLens(['review/alpha'], thread)).toBe(false);
  });
  it('matches a counterpart through its types or the leaf', () => {
    expect(belongsToCounterpart(['review/alpha'], 'alpha', ['retro', 'review'])).toBe(true);
    expect(belongsToCounterpart(['wf/alpha'], 'alpha', ['retro', 'wf'])).toBe(true);
    expect(belongsToCounterpart(['sparring/alpha'], 'alpha', ['retro'])).toBe(false);
    expect(belongsToCounterpart(['alpha'], 'alpha', [])).toBe(true);
  });
  it('collects the types used with a counterpart', () => {
    expect(typesForCounterpart([['retro/alpha'], ['wf/alpha', 'review/beta'], ['review/alpha/x']], 'alpha')).toEqual([
      'retro',
      'wf',
      'review',
    ]);
  });
});

describe('scopeOf', () => {
  const coaching = item('area', 'Coaching');
  const tender = item('project', 'Tender', {area: 'Coaching'});
  const offsite = item('project', 'Offsite', {area: 'Coaching'});
  const loose = item('project', 'Loose');
  const other = item('area', 'Health');
  const items = [coaching, tender, offsite, loose, other];
  const inbox = '/Note/2 Areas/0 Inbox';

  it('takes an Area with its Projects', () => {
    expect(scopeOf(coaching.path, items, inbox).sort()).toEqual([coaching.path, offsite.path, tender.path].sort());
  });
  it('widens a Project with an Area to that Area', () => {
    expect(scopeOf(tender.path, items, inbox).sort()).toEqual([coaching.path, offsite.path, tender.path].sort());
  });
  it('keeps a Project without an Area on its own', () => {
    expect(scopeOf(loose.path, items, inbox)).toEqual([loose.path]);
  });
  it('keeps the Inbox on its own', () => {
    expect(scopeOf(inbox, items, inbox)).toEqual([inbox]);
  });
  it('keeps a Project whose Area does not exist with its sibling Projects', () => {
    const orphan = item('project', 'Orphan', {area: 'Gone'});
    expect(scopeOf(orphan.path, [...items, orphan], inbox)).toEqual([orphan.path]);
  });
  it('keeps an unknown owner on its own', () => {
    expect(scopeOf('/elsewhere', items, inbox)).toEqual(['/elsewhere']);
  });
});

describe('#owe/<counterpart> (D13)', () => {
  it('names the counterparts a todo promises something to', () => {
    expect(owedTo(['owe/sven', 'next', 'owe/sven/budget', 'owe/mieke', 'owe'])).toEqual(['sven', 'mieke']);
    expect(owedTo(['owe', 'wf/sven'])).toEqual([]);
  });
  it('is not a flow state: it combines with #next and #someday', () => {
    expect(deriveFlowState(['owe/sven', 'next'])).toBe('next');
    expect(deriveFlowState(['owe/sven', 'someday'])).toBe('someday');
    expect(deriveFlowState(['owe/sven'])).toBeNull();
  });
  it('names a counterpart, not a thread, like wf', () => {
    expect(isCounterpartType('owe')).toBe(true);
    expect(isCounterpartType('wf')).toBe(true);
    expect(isCounterpartType('retro')).toBe(false);
  });
  it('leaves a bare #owe a plain tag, but OWE is no abbreviation', () => {
    expect(isContextTag('owe')).toBe(true);
    expect(validateAbbrev('OWE', [])).toEqual({valid: false, reason: {kind: 'reserved'}});
    expect(validateAbbrev('OWEN', []).valid).toBe(true);
  });
});
