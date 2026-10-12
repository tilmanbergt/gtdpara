// The Tag Rules list pages by a fixed row height: each row is drawn at exactly that height, so a 13th
// rule goes to page 2 instead of below the screen.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});
jest.mock('sn-plugin-lib', () => ({NativePluginManager: {}, PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import React from 'react';
import {StyleSheet, View} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {createEmptyTagRule, TagRule} from '../../src/domain/tagRules';
import TagRulesList from '../../src/screens/settings/tagRules/TagRulesList';
import {TagRuleDraft} from '../../src/screens/settings/tagRules/useTagRuleDraft';

describe('TagRulesList', () => {
  it('draws every row at the height the pager counts with', () => {
    const rules: TagRule[] = Array.from({length: 13}, (_, i) => ({
      ...createEmptyTagRule(`r${i}`, 'meeting'),
      name: `Rule ${i} with a rather long name that would wrap onto a second line`,
      tags: ['coaching', 'retro', 'jf', 'workshop', 'interview', 'oneonone'],
      trackPrep: true,
      trackReview: true,
    }));
    const draft = {handleAddDefinition: jest.fn(), handleEditDefinition: jest.fn(), handleDeleteDefinition: jest.fn(), handleSetHeadingStyle: jest.fn()} as unknown as TagRuleDraft;
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <TagRulesList draft={draft} tagRules={rules} headingStyle={3} textColor="#000" borderColor="#000" placeholderColor="#888" />,
      );
    });
    const section = r.root.findAll(n => n.props.header === 'Tag rules' && Array.isArray(n.props.rows))[0];
    const rowHeight: number = section.props.rowHeight(section.props.rows[0]);
    let row!: TestRenderer.ReactTestRenderer;
    act(() => {
      row = TestRenderer.create(section.props.renderRow(section.props.rows[0]));
    });
    const style = StyleSheet.flatten(row.root.findAllByType(View)[0].props.style);
    expect((style.height as number) + (style.marginBottom as number)).toBe(rowHeight);
    expect(row.root.findAll(n => n.props.numberOfLines === 1).length).toBeGreaterThanOrEqual(2);
  });
});
