/**
 * The list of Tag Rules with "+ New tag rule"; Delete is immediate.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {trackingSummary} from '../../../domain/meetingTracking';
import {NoteHeadingStyle} from '../../../domain/settings';
import {TagRule} from '../../../domain/tagRules';
import MiniTabs, {MiniTabDef} from '../../../ui/MiniTabs';
import PagedSection from '../../../ui/PagedSection';
import {styles} from '../settingsStyles';
import {TagRuleDraft} from './useTagRuleDraft';
/** Fixed row height for the Templates tab's PagedSection list (two lines: name + context/tags) - hand-picked, not screenshot-measured, same convention as every other row-height constant in this app. The viewport itself is self-measured (no separate viewport-height constant needed) - see this file's module doc comment. */
const TEMPLATE_DEF_ROW_HEIGHT = 64;
interface TemplateDefRow {
  def: TagRule;
  index: number;
}
import {CONTEXT_TABS} from './TagRuleEditor';

/** sn-plugin-lib's title styles, as the Heading style choice (docs/dev/history/technical-design-projects-findable-notes.md §2.8). */
const HEADING_STYLE_TABS: MiniTabDef<'1' | '2' | '3' | '4'>[] = [
  {key: '1', label: 'Black'},
  {key: '2', label: 'Light grey'},
  {key: '3', label: 'Dark grey'},
  {key: '4', label: 'Shadow'},
];

export default function TagRulesList({
  draft,
  tagRules,
  headingStyle,
  textColor,
  borderColor,
}: {
  draft: TagRuleDraft;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
  tagRules: TagRule[];
  headingStyle: NoteHeadingStyle;
}): React.JSX.Element {
  const {handleAddDefinition, handleEditDefinition, handleDeleteDefinition, handleSetHeadingStyle} = draft;
  return (
    <View style={styles.templatesListBody}>
      <Text style={[styles.label, {color: textColor}]}>Heading style</Text>
      <MiniTabs
        tabs={HEADING_STYLE_TABS}
        activeKey={String(headingStyle) as '1' | '2' | '3' | '4'}
        onChange={key => handleSetHeadingStyle(Number(key) as NoteHeadingStyle)}
        textColor={textColor}
        borderColor={borderColor}
      />
      <Pressable onPress={handleAddDefinition} hitSlop={8} style={styles.addDefRow}>
        <Text style={[styles.addDefRowText, {color: textColor}]}>+ New tag rule</Text>
      </Pressable>
      <PagedSection<TemplateDefRow>
        header="Tag rules"
        rows={tagRules.map((def, index) => ({def, index}))}
        rowHeight={() => TEMPLATE_DEF_ROW_HEIGHT}
        resetKey={tagRules.length}
        emptyHint="None yet — notes keep getting a blank background and no auto-inserted content, same as today."
        renderRow={({def, index}) => (
          <View key={def.id} style={[styles.defRow, {borderColor}]}>
            <Pressable onPress={() => handleEditDefinition(index)} hitSlop={4} style={styles.defRowMain}>
              <Text style={[styles.defRowName, {color: textColor}]}>
                {def.name || 'Untitled'}
                {!def.enabled ? '  (off)' : ''}
              </Text>
              <Text style={[styles.defRowMeta, {color: textColor}]}>
                {CONTEXT_TABS.find(c => c.key === def.context)?.label ?? def.context}
                {' · '}
                {def.tags.length > 0
                  ? def.tags.map(t => `#${t}`).join(' ')
                  : def.isDefault
                  ? 'Default'
                  : 'unreachable (no tag, not default)'}
                {trackingSummary(def) ? ` · tracks ${trackingSummary(def)}` : ''}
              </Text>
            </Pressable>
            <Pressable onPress={() => handleDeleteDefinition(index)} hitSlop={8} style={styles.defRowDelete}>
              <Text style={styles.defRowDeleteText}>Delete</Text>
            </Pressable>
          </View>
        )}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}
