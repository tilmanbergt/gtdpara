import {
  deriveMeetingFields,
  deriveTaskFields,
  extractContextTags,
  removeTagFromText,
  splitTextWithTags,
  stripAllTags,
} from '../../src/domain/markdown';
import {setBareTag, setNowTag, stripBareTags} from '../../src/domain/flowState';
import {
  createEmptyTagRule,
  TagRule,
  resolveNoteTemplate,
  ruleSubtag,
  tagMatchesRuleTag,
} from '../../src/domain/tagRules';

// docs/dev/technical-design-split-by-tag.md §3.1 / §3.2

describe('nested tags - parsing', () => {
  it('reads #parent/child as one tag', () => {
    expect(deriveMeetingFields('Session #coaching/sabina').tags).toEqual(['coaching/sabina']);
    expect(deriveMeetingFields('#a/b/c x').tags).toEqual(['a/b/c']);
  });

  it('keeps a trailing slash out of the tag', () => {
    expect(deriveMeetingFields('#coaching/ end').tags).toEqual(['coaching']);
  });

  it('allows a :value after nested segments', () => {
    expect(deriveMeetingFields('#a/b:c').tags).toEqual(['a/b:c']);
  });

  it('lowercases nested tags like every tag', () => {
    expect(deriveMeetingFields('#Coaching/Sabina').tags).toEqual(['coaching/sabina']);
  });

  it('leaves the existing tag kinds unchanged', () => {
    const fields = deriveTaskFields('Call #next #due:2026-10-05 #team-jf');
    expect(fields.tags).toEqual(['next', 'due:2026-10-05', 'team-jf']);
    expect(fields.flowState).toBe('next');
    expect(fields.dueDate).toBe('2026-10-05');
  });

  it('treats a nested tag as a context tag', () => {
    expect(extractContextTags('Session #coaching/sabina #next')).toEqual(['coaching/sabina']);
  });

  it('splits text into one tag segment per nested tag', () => {
    expect(splitTextWithTags('Session #coaching/sabina today')).toEqual([
      {kind: 'text', value: 'Session '},
      {kind: 'tag', value: 'coaching/sabina'},
      {kind: 'text', value: ' today'},
    ]);
    expect(stripAllTags('Session #coaching/sabina today')).toBe('Session today');
  });
});

describe('nested tags - whole-tag guards', () => {
  it('removing the parent tag does not touch a nested tag', () => {
    expect(removeTagFromText('x #coaching/sabina', 'coaching')).toBe('x #coaching/sabina');
    expect(removeTagFromText('x #coaching/sabina #coaching', 'coaching')).toBe('x #coaching/sabina');
  });

  it('removing a nested tag removes exactly that tag', () => {
    expect(removeTagFromText('x #coaching/sabina #coaching/tom', 'coaching/sabina')).toBe('x #coaching/tom');
  });

  it('still guards the other tag shapes', () => {
    expect(removeTagFromText('x #team-jf #team', 'team')).toBe('x #team-jf');
    expect(removeTagFromText('x #wait:anna #wait', 'wait')).toBe('x #wait:anna');
  });

  it('bare-tag helpers leave #now/x alone', () => {
    expect(stripBareTags('Do it #now/later', ['now'])).toBe('Do it #now/later');
    expect(setNowTag('Do it #now/later', false)).toBe('Do it #now/later');
    expect(setBareTag('Do it #now', 'now', false)).toBe('Do it');
  });
});

describe('nested tags - Tag Rule matching', () => {
  const rule = (id: string, tags: string[], extra: Partial<TagRule> = {}): TagRule => ({
    ...createEmptyTagRule(id, 'meeting'),
    name: id,
    tags,
    enabled: true,
    ...extra,
  });

  it('tagMatchesRuleTag: itself and children only', () => {
    expect(tagMatchesRuleTag('coaching', 'coaching')).toBe(true);
    expect(tagMatchesRuleTag('coaching/sabina', 'coaching')).toBe(true);
    expect(tagMatchesRuleTag('coaching/sabina/2026', 'coaching')).toBe(true);
    expect(tagMatchesRuleTag('coachingx', 'coaching')).toBe(false);
    expect(tagMatchesRuleTag('coaching', 'coaching/sabina')).toBe(false);
  });

  it('resolveNoteTemplate matches a rule through a nested tag', () => {
    const coaching = rule('Coaching', ['coaching']);
    expect(resolveNoteTemplate('meeting', ['coaching/sabina'], [coaching])).toBe(coaching);
    expect(resolveNoteTemplate('meeting', ['coachingx'], [coaching])).toBeNull();
  });

  it('keeps list order as priority', () => {
    const first = rule('Sabina', ['coaching/sabina']);
    const second = rule('Coaching', ['coaching']);
    expect(resolveNoteTemplate('meeting', ['coaching/sabina'], [first, second])).toBe(first);
    expect(resolveNoteTemplate('meeting', ['coaching/sabina'], [second, first])).toBe(second);
    expect(resolveNoteTemplate('meeting', ['coaching'], [first, second])).toBe(second);
  });

  it('ruleSubtag: first nested tag wins, deeper nesting kept, none -> ""', () => {
    expect(ruleSubtag(['next', 'coaching/sabina', 'coaching/tom'], ['coaching'])).toBe('sabina');
    expect(ruleSubtag(['coaching/sabina/2026'], ['coaching'])).toBe('sabina/2026');
    expect(ruleSubtag(['coaching'], ['coaching'])).toBe('');
    expect(ruleSubtag(['coachingx/a'], ['coaching'])).toBe('');
    expect(ruleSubtag(['Coaching/Sabina'], ['COACHING'])).toBe('sabina');
    expect(ruleSubtag(['team/a'], ['coaching', 'team'])).toBe('a');
  });
});
