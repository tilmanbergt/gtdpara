/**
 * Settings → Tag Rules: what happens to notes of items with certain tags in
 * a context - their background, auto-inserted pieces, note target and (for
 * meetings) prep/review tracking. Four pages: the list, the rule form, and
 * the two pages the form opens (background, Add piece).
 */
import React from 'react';
import {NoteHeadingStyle} from '../../../domain/settings';
import {TagRule} from '../../../domain/tagRules';
import PieceEditor from './PieceEditor';
import TagRuleEditor from './TagRuleEditor';
import TagRulesList from './TagRulesList';
import TemplateEditor from './TemplateEditor';
import {MyStyleBackgrounds} from './useMyStylePngs';
import {TagRuleDraft} from './useTagRuleDraft';

export default function TagRulesTab(props: {
  draft: TagRuleDraft;
  tagRules: TagRule[];
  headingStyle: NoteHeadingStyle;
  myStyle: MyStyleBackgrounds;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element | null {
  const {draft, tagRules, headingStyle, myStyle, ...colors} = props;
  switch (draft.templatesView) {
    case 'list':
      return <TagRulesList draft={draft} tagRules={tagRules} headingStyle={headingStyle} {...colors} />;
    case 'edit':
      return <TagRuleEditor draft={draft} {...colors} />;
    case 'edit-template':
      return <TemplateEditor draft={draft} myStyle={myStyle} {...colors} />;
    case 'edit-piece':
      return <PieceEditor draft={draft} {...colors} />;
  }
}
