import {
  deriveMeetingFields,
  deriveTaskFields,
  extractContextTags,
  removeTagFromText,
  splitTextWithTags,
  stripAllTags,
} from '../../src/domain/markdown';
import {setBareTag, setNowTag, stripBareTags} from '../../src/domain/flowState';
import {createNoteSetup, matchingSetups, NoteSetup, setupSubtag, tagMatchesSetupTag} from '../../src/domain/noteSetups';

// docs/dev/history/technical-design-split-by-tag.md §3.1 / §3.2

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
      {kind: 'tag', value: 'coaching/sabina', raw: '#coaching/sabina'},
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

describe('nested tags - Note setup matching', () => {
  const setup = (id: string, tags: string[]): NoteSetup => ({...createNoteSetup(id, 'thread'), name: id, tags});

  it('tagMatchesSetupTag: itself and children only', () => {
    expect(tagMatchesSetupTag('coaching', 'coaching')).toBe(true);
    expect(tagMatchesSetupTag('coaching/sabina', 'coaching')).toBe(true);
    expect(tagMatchesSetupTag('coaching/sabina/2026', 'coaching')).toBe(true);
    expect(tagMatchesSetupTag('coachingx', 'coaching')).toBe(false);
    expect(tagMatchesSetupTag('coaching', 'coaching/sabina')).toBe(false);
  });

  it('matchingSetups matches a setup through a nested tag', () => {
    const coaching = setup('Coaching', ['coaching']);
    expect(matchingSetups(['coaching/sabina'], [coaching])).toEqual([coaching]);
    expect(matchingSetups(['coachingx'], [coaching])).toEqual([]);
  });

  it('keeps list order as priority', () => {
    const first = setup('Sabina', ['coaching/sabina']);
    const second = setup('Coaching', ['coaching']);
    expect(matchingSetups(['coaching/sabina'], [first, second])[0]).toBe(first);
    expect(matchingSetups(['coaching/sabina'], [second, first])[0]).toBe(second);
    expect(matchingSetups(['coaching'], [first, second])).toEqual([second]);
  });

  it('setupSubtag: first nested tag wins, deeper nesting kept, none -> ""', () => {
    expect(setupSubtag(['next', 'coaching/sabina', 'coaching/tom'], ['coaching'])).toBe('sabina');
    expect(setupSubtag(['coaching/sabina/2026'], ['coaching'])).toBe('sabina/2026');
    expect(setupSubtag(['coaching'], ['coaching'])).toBe('');
    expect(setupSubtag(['coachingx/a'], ['coaching'])).toBe('');
    expect(setupSubtag(['Coaching/Sabina'], ['COACHING'])).toBe('sabina');
    expect(setupSubtag(['team/a'], ['coaching', 'team'])).toBe('a');
  });
});
