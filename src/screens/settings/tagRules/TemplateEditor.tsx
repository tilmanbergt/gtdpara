/**
 * "Choose background": the MyStyle backgrounds as a paged file list on the
 * left, a preview of the picked one on the right. A tap applies the pick at
 * once; "Apply" only returns to the rule form.
 */
import React from 'react';
import {Image, Pressable, Text, View} from 'react-native';
import {MYSTYLE_FOLDER} from '../../../supernote/fileSystem';
import {common} from '../../../ui/commonStyles';
import PagedSection from '../../../ui/PagedSection';
import {styles} from '../settingsStyles';
import {TagRuleDraft} from './useTagRuleDraft';
import {MyStyleBackgrounds} from './useMyStylePngs';

// The "Choose background" page's file-row height (2026-09-18 - Tilman: "let
// the template pagination work exactly as other file panels we have
// already... (areas, projects)") - same chrome+line-height derivation
// `ui/FileBrowserPane.tsx`'s own `FILE_ENTRY_CHROME_PX`/
// `FILE_ENTRY_LINE_HEIGHT_PX` use for a single-line entry (paddingVertical
// 5+5, FONT.medium's 22px line-height figure), just without that
// component's doubled row+text padding - these rows are plain single-line
// filenames (`numberOfLines={1}`), never the 2-line folder/file names
// FileBrowserPane budgets for.
const TEMPLATE_BROWSE_ROW_HEIGHT = 32;

export default function TemplateEditor({
  draft,
  myStyle,
  textColor,
  borderColor,
}: {
  draft: TagRuleDraft;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
  myStyle: MyStyleBackgrounds;
}): React.JSX.Element | null {
  const {draftDef, templatePreviewFailedFor, setTemplatePreviewFailedFor, handleBackToEditForm, handleChooseTemplate} = draft;
  if (!draftDef) return null;
  return (
    <View style={styles.templateBrowsePage}>
      <View style={styles.headerTopRow}>
        <Pressable onPress={handleBackToEditForm} hitSlop={8}>
          <Text style={[styles.backText, {color: textColor}]}>‹ Cancel</Text>
        </Pressable>
        <Text style={[styles.sectionHeading, {color: textColor}]}>Choose background</Text>
      </View>

      <View style={styles.templateBrowseColumns}>
        <View style={[common.column, common.columnLeft, styles.formColumnCard, {borderColor}]}>
          {myStyle.error && (
            <Text style={common.error}>⚠ Could not list MyStyle: {myStyle.error}</Text>
          )}
          {myStyle.pngs === null && !myStyle.error ? (
            <Text style={[common.hint, {color: textColor}]}>Loading…</Text>
          ) : (
            <PagedSection<string>
              header="MyStyle backgrounds"
              rows={['', ...(myStyle.pngs ?? [])]}
              rowHeight={() => TEMPLATE_BROWSE_ROW_HEIGHT}
              emptyHint={`No .png files found in ${MYSTYLE_FOLDER}.`}
              renderRow={fileName => {
                const isNone = fileName === '';
                const selected = draftDef.template === fileName;
                return (
                  <Pressable
                    key={fileName || '(none)'}
                    onPress={() => handleChooseTemplate(fileName)}
                    hitSlop={4}
                    style={styles.templateBrowseListRow}>
                    <Text
                      style={[
                        styles.templateBrowseListRowText,
                        {color: textColor},
                        selected && styles.templateBrowseListRowTextSelected,
                      ]}
                      numberOfLines={1}>
                      {selected ? '✓ ' : isNone ? '' : '🖼 '}
                      {isNone ? 'None (blank note)' : fileName}
                    </Text>
                  </Pressable>
                );
              }}
              textColor={textColor}
              borderColor={borderColor}
            />
          )}
        </View>

        <View style={[common.column, styles.formColumnCard, {borderColor}]}>
          {/* Real MyStyle background, not a blank box (2026-09-18) -
              `templateBrowsePreviewBox` already sizes itself to the
              column's full width at the real page aspect ratio
              (NOTE_PAGE_WIDTH_PX/HEIGHT_PX), so the image just fills it
              exactly; `resizeMode="cover"` rather than "stretch" so a
              MyStyle PNG that isn't pixel-exact to that ratio doesn't
              visibly distort. Keyed by filename so switching the
              selection mounts a fresh <Image> instead of reusing one
              still showing the previous background while the new file
              decodes. "None" (fileName === '') renders no <Image> at
              all - an empty bordered box, same as before this change. */}
          <View style={[styles.templateBrowsePreviewBox, {borderColor}]}>
            {draftDef.template !== '' && templatePreviewFailedFor !== draftDef.template && (
              <Image
                key={draftDef.template}
                source={{uri: `file://${MYSTYLE_FOLDER}/${draftDef.template}`}}
                style={styles.templateBrowsePreviewImage}
                resizeMode="cover"
                onError={() => setTemplatePreviewFailedFor(draftDef.template)}
              />
            )}
            {draftDef.template !== '' && templatePreviewFailedFor === draftDef.template && (
              <Text style={[styles.templatePreviewErrorText, {color: textColor}]} numberOfLines={2}>
                ⚠ Could not load {draftDef.template}
              </Text>
            )}
          </View>
          <Pressable
            onPress={handleBackToEditForm}
            hitSlop={8}
            style={[styles.saveButton, styles.templateApplyButton]}>
            <Text style={styles.saveButtonText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
