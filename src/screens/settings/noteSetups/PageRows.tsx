/**
 * The setup page's page rows (docs/dev/history/technical-design-note-setups.md
 * §6.2), one per page kind: a thumbnail of the pieces (no MyStyle image -
 * full-page pictures in list rows cost too much; the text names the
 * background), Default or Own layout, and Customize › / Edit › / Use default.
 * The Default's own pages each get Edit ›.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {layoutFor, pageKindsOf} from '../../../domain/noteSetups';
import {PAGE_KIND_LABELS, pageRowSummary} from '../../../domain/noteSetupText';
import {PageKind} from '../../../domain/pageLayout';
import {GtdParaSettings} from '../../../domain/settings';
import NoteTemplatePreview from '../../../ui/NoteTemplatePreview';
import PagedSection from '../../../ui/PagedSection';
import {PAGE_ROW_HEIGHT, setupStyles} from './noteSetupsStyles';
import {NoteSetupDraft} from './useNoteSetupDraft';

const DEFAULT_PAGE_KINDS: PageKind[] = ['meeting', 'todo', 'first'];
const noSelection = () => undefined;

export default function PageRows(props: {draft: NoteSetupDraft; values: GtdParaSettings; textColor: string; borderColor: string}): React.JSX.Element | null {
  const {draft, values, textColor, borderColor} = props;
  const target = draft.target;
  if (!target) return null;
  const kinds = target.kind === 'setup' ? pageKindsOf(target.setup.kind) : DEFAULT_PAGE_KINDS;

  const button = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={6} style={[setupStyles.pageRowButton, {borderColor}]}>
      <Text style={[setupStyles.pageRowButtonText, {color: textColor}]}>{label}</Text>
    </Pressable>
  );

  return (
    <PagedSection<PageKind>
      header="Pages"
      rows={kinds}
      rowHeight={() => PAGE_ROW_HEIGHT}
      resetKey={kinds.length}
      renderRow={kind => {
        const own = target.kind === 'setup' ? target.setup.pages[kind] ?? null : null;
        const shown = target.kind === 'setup' ? own ?? layoutFor(null, kind, values.noteSetupDefaults) : target.defaults.pages[kind] ?? null;
        return (
          <View key={kind} style={[setupStyles.pageRow, {borderColor}]}>
            <View style={setupStyles.pageThumb}>
              <NoteTemplatePreview pieces={shown?.pieces ?? []} selectedIndex={null} onSelectPiece={noSelection} background="" textColor={textColor} borderColor={borderColor} />
            </View>
            <View style={setupStyles.pageRowMain}>
              <Text style={[setupStyles.pageRowName, {color: textColor}]}>{PAGE_KIND_LABELS[kind]}</Text>
              <Text style={[setupStyles.pageRowMeta, {color: textColor}]} numberOfLines={1}>
                {pageRowSummary(shown, target.kind === 'setup' ? own !== null : null)}
              </Text>
            </View>
            {target.kind === 'default' && button('Edit ›', () => draft.handleEditPage(kind))}
            {target.kind === 'setup' && !own && button('Customize ›', () => draft.handleCustomizePage(kind))}
            {target.kind === 'setup' && own && button('Edit ›', () => draft.handleEditPage(kind))}
            {target.kind === 'setup' && own && button('Use default', () => draft.handleUseDefaultPage(kind))}
          </View>
        );
      }}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}
