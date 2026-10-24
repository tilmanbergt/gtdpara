/**
 * The Project/Area page's agreements (docs/dev/history/technical-design-meetings-0.21.md
 * R24, §8): in the Todos column's place after "◇ Agreements n ›", the item
 * owner's active agreements (domain/agreementOwner.ts) as one paged list,
 * with "‹ Todos" back. A tap shows the agreement's card in Quick Add's
 * place.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {AgreementRef} from '../../domain/agreementOwner';
import {agreementsLinkText} from '../../domain/agreementText';
import {todayIso} from '../../domain/meetingTime';
import AgreementRow, {AGREEMENT_ROW_HEIGHT} from '../../ui/AgreementRow';
import PagedSection from '../../ui/PagedSection';
import {FONT} from '../../ui/theme';
import {AgreementActions, agreementRefKey} from '../../ui/useAgreementActions';
import {sectionStyles} from './panelLayout';

interface Props {
  refs: readonly AgreementRef[];
  agreements: AgreementActions;
  onBack: () => void;
  textColor: string;
  borderColor: string;
}

export default function AgreementsList({refs, agreements, onBack, textColor, borderColor}: Props): React.JSX.Element {
  const today = todayIso();
  return (
    <View style={sectionStyles.section}>
      <Pressable onPress={onBack} hitSlop={8} style={sectionStyles.hideDoneRow}>
        <Text style={[styles.back, {color: textColor}]}>‹ Todos</Text>
      </Pressable>
      <PagedSection<AgreementRef>
        header="Agreements"
        rows={[...refs]}
        rowHeight={() => AGREEMENT_ROW_HEIGHT}
        emptyHint="No active agreements here."
        renderRow={ref => (
          <AgreementRow
            key={agreementRefKey(ref)}
            agreement={ref}
            today={today}
            onPress={() => agreements.select(ref)}
            state={agreements.rowState(ref)}
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

/** The quiet line at the end of the Todos column: "◇ Agreements n ›" (only when there are some). */
export function AgreementsLink({count, onOpen, textColor}: {count: number; onOpen: () => void; textColor: string}): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <Pressable onPress={onOpen} hitSlop={8} style={styles.link} accessibilityRole="button">
      <Text style={[styles.linkText, {color: textColor}]}>{agreementsLinkText(count)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {fontSize: FONT.small, fontWeight: '700'},
  link: {paddingVertical: 6},
  linkText: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline'},
});
