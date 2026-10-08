/**
 * The overlays App.tsx draws over the tab body (design-overview.md §2.1):
 * the in-app help (docs/dev/history/technical-design-in-app-help.md §3.3).
 * An overlay sits inside StatusFrame, so the TabBar and the status slot stay
 * visible and the tab screens stay mounted underneath, exactly as they were.
 *
 * Any change of tab and leaving the tab shell (capture, focus mode) closes
 * the overlay; closing it requests an e-ink refresh, because the screen
 * behind reappears without a load edge of its own.
 */
import React, {useEffect, useRef, useState} from 'react';
import {helpStartPage, LastHelpPage} from '../domain/helpTopics';
import {USER_DOCS} from '../generated/userDocs';
import {requestEinkRefresh} from '../utils/screenRefresh';
import HelpOverlay from './HelpOverlay';
import {AppTab} from './TabBar';

export interface AppOverlays {
  helpOpen: boolean;
  /** The TabBar's "?" button: opens the help at the page for `activeTab`, or closes it. */
  toggleHelp: () => void;
  /** Closes whatever overlay is open (a TabBar tap). */
  closeOverlays: () => void;
  /** The open overlay's element, or null - rendered last inside the tab body. */
  overlay: React.ReactNode;
}

export function useAppOverlays(inTabs: boolean, activeTab: AppTab): AppOverlays {
  // The page shown in the help overlay, or null while it's closed. The last
  // page read per tab is remembered for this session only.
  const [helpPage, setHelpPage] = useState<string | null>(null);
  const lastHelpRef = useRef<LastHelpPage | null>(null);

  useEffect(() => {
    if (!inTabs) setHelpPage(null);
  }, [inTabs]);
  useEffect(() => {
    setHelpPage(null);
  }, [activeTab]);

  const closeHelp = () => {
    if (helpPage === null) return;
    setHelpPage(null);
    requestEinkRefresh();
  };

  const toggleHelp = () => {
    if (helpPage !== null) {
      closeHelp();
      return;
    }
    const page = helpStartPage(activeTab, lastHelpRef.current, new Set(Object.keys(USER_DOCS.pages)));
    lastHelpRef.current = {tab: activeTab, pageId: page};
    setHelpPage(page);
  };
  const selectHelpPage = (pageId: string) => {
    lastHelpRef.current = {tab: activeTab, pageId};
    setHelpPage(pageId);
  };

  const overlay =
    helpPage !== null ? <HelpOverlay pageId={helpPage} onSelectPage={selectHelpPage} onClose={closeHelp} /> : null;

  return {helpOpen: helpPage !== null, toggleHelp, closeOverlays: closeHelp, overlay};
}
