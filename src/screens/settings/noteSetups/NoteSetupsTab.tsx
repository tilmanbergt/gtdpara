/**
 * Settings → Note setups (docs/dev/history/technical-design-note-setups.md §6):
 * three levels, each with one job - the list (which setups exist), the
 * setup page (what a setup does, with its tag picker) and the page layout
 * (how one page looks).
 */
import React from 'react';
import {GtdParaSettings} from '../../../domain/settings';
import NoteSetupEditor from './NoteSetupEditor';
import NoteSetupsList from './NoteSetupsList';
import PageLayoutEditor from './PageLayoutEditor';
import SetupTagPicker from './SetupTagPicker';
import {MyStyleBackgrounds} from './useMyStylePngs';
import {NoteSetupDraft} from './useNoteSetupDraft';

export default function NoteSetupsTab(props: {
  draft: NoteSetupDraft;
  values: GtdParaSettings;
  myStyle: MyStyleBackgrounds;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element | null {
  const {draft, values, myStyle, ...colors} = props;
  switch (draft.view) {
    case 'list':
      return <NoteSetupsList draft={draft} values={values} textColor={colors.textColor} borderColor={colors.borderColor} />;
    case 'setup':
      return <NoteSetupEditor draft={draft} values={values} {...colors} />;
    case 'tags':
      return <SetupTagPicker draft={draft} values={values} {...colors} />;
    case 'layout':
      return <PageLayoutEditor draft={draft} myStyle={myStyle} {...colors} />;
  }
}
