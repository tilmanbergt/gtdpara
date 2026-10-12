/**
 * "Tag Rules are now Note setups" (docs/dev/history/technical-design-note-setups.md
 * §6.6): above the list while the migration report is kept; its lines
 * page, OK clears it.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {MigrationReportEntry} from '../../../domain/noteSetupMigration';
import PagedSection from '../../../ui/PagedSection';
import {NOTICE_ROW_HEIGHT, setupStyles} from './noteSetupsStyles';

export default function MigrationNotice(props: {
  report: readonly MigrationReportEntry[];
  onDismiss: () => void;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const {report, onDismiss, textColor, borderColor} = props;
  return (
    <View style={[setupStyles.noticeCard, {borderColor}]}>
      <Text style={[setupStyles.noticeTitle, {color: textColor}]}>Tag Rules are now Note setups.</Text>
      <View style={setupStyles.listBody}>
        <PagedSection<MigrationReportEntry>
          header={report.length > 0 ? 'What changed' : 'Nothing changed for your notes.'}
          rows={[...report]}
          rowHeight={() => NOTICE_ROW_HEIGHT}
          renderRow={entry => (
            <Text key={`${entry.setup}-${entry.change}-${entry.detail}`} style={[setupStyles.noticeLine, {color: textColor}]} numberOfLines={2}>
              {`${entry.setup}: ${entry.detail}`}
            </Text>
          )}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
      <Pressable onPress={onDismiss} hitSlop={8} style={[setupStyles.noticeOk, {borderColor}]}>
        <Text style={[setupStyles.noticeOkText, {color: textColor}]}>OK</Text>
      </Pressable>
    </View>
  );
}
