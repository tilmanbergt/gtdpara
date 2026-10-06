import {renameLegacyTagRuleKeys} from '../../src/domain/settings';
import {sanitizeProfileSettings} from '../../src/domain/profiles';

const rule = {id: '1', name: 'Meeting (default)'};

describe('Tag Rule keys of 0.8 and earlier', () => {
  it('renames the old keys', () => {
    expect(renameLegacyTagRuleKeys({noteCreationDefinitions: [rule], nextNoteDefinitionId: 2, baseRoot: 'x'})).toEqual({
      tagRules: [rule],
      nextTagRuleId: 2,
      baseRoot: 'x',
    });
  });
  it('keeps current keys and drops old ones next to them', () => {
    expect(renameLegacyTagRuleKeys({tagRules: [], noteCreationDefinitions: [rule], nextTagRuleId: 5, nextNoteDefinitionId: 2})).toEqual({
      tagRules: [],
      nextTagRuleId: 5,
    });
  });
  it('returns the same object when there is nothing to rename', () => {
    const current = {tagRules: [rule], nextTagRuleId: 2};
    expect(renameLegacyTagRuleKeys(current)).toBe(current);
    const empty = {};
    expect(renameLegacyTagRuleKeys(empty)).toBe(empty);
  });
  it('imports Tag Rules from a profile file written by 0.8', () => {
    const imported = sanitizeProfileSettings({noteCreationDefinitions: [rule], nextNoteDefinitionId: 2});
    expect(imported.tagRules).toEqual([rule]);
    expect(imported.nextTagRuleId).toBe(2);
    expect('noteCreationDefinitions' in imported).toBe(false);
  });
});
