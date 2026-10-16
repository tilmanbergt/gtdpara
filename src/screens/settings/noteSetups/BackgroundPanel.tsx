/**
 * The layout page's Background panel (docs/dev/history/technical-design-note-setups.md
 * §6.3): the MyStyle backgrounds, paged; a tap sets the page's background
 * and the preview beside it shows it at once.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {PageLayout} from '../../../domain/pageLayout';
import {MYSTYLE_FOLDER} from '../../../supernote/fileSystem';
import {common} from '../../../ui/commonStyles';
import PagedSection from '../../../ui/PagedSection';
import {MyStyleBackgrounds} from './useMyStylePngs';
import {PANEL_ROW_HEIGHT, setupStyles} from './noteSetupsStyles';
import {LayoutDraft} from './useLayoutDraft';

export default function BackgroundPanel(props: {
  layout: PageLayout | null;
  draft: LayoutDraft;
  myStyle: MyStyleBackgrounds;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const {layout, draft, myStyle, textColor, borderColor} = props;
  const current = layout?.template ?? '';
  return (
    <View style={setupStyles.panelBody}>
      {myStyle.error && <Text style={common.error}>⚠ Could not list MyStyle: {myStyle.error}</Text>}
      {myStyle.pngs === null && !myStyle.error ? (
        <Text style={[common.hint, {color: textColor}]}>Loading…</Text>
      ) : (
        <View style={setupStyles.listBody}>
          <PagedSection<string>
            header="MyStyle backgrounds"
            rows={['', ...(myStyle.pngs ?? [])]}
            rowHeight={() => PANEL_ROW_HEIGHT}
            emptyHint={`No .png files found in ${MYSTYLE_FOLDER}.`}
            renderRow={fileName => {
              const selected = current === fileName;
              return (
                <Pressable
                  key={fileName || '(none)'}
                  onPress={() => draft.handleChooseBackground(fileName)}
                  style={[setupStyles.panelRow, {borderColor}, selected && setupStyles.panelRowSelected]}>
                  <Text style={[setupStyles.panelRowText, {color: textColor}, selected && setupStyles.panelRowTextOn]} numberOfLines={1}>
                    {`${selected ? '✓ ' : ''}${fileName === '' ? 'None (blank page)' : fileName}`}
                  </Text>
                </Pressable>
              );
            }}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      )}
    </View>
  );
}
