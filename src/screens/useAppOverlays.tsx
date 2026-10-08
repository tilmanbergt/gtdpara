/**
 * The overlays App.tsx draws over the tab body (design-overview.md §2.1): the
 * in-app help (docs/dev/history/technical-design-in-app-help.md §3.3) and the
 * thread overview (docs/dev/history/technical-design-tending-threads.md §3.5).
 * An overlay sits inside StatusFrame, so the TabBar and the status slot stay
 * visible and the tab screens stay mounted underneath, exactly as they were.
 *
 * At most one overlay is open: opening the help closes the overview and vice
 * versa. Any change of tab and leaving the tab shell (capture, focus mode)
 * close both; an overview requested outside the tab shell is dropped. Closing
 * an overlay requests an e-ink refresh, because the screen behind reappears
 * without a load edge of its own.
 */
import React, {useEffect, useRef, useState} from 'react';
import {helpStartPage, LastHelpPage} from '../domain/helpTopics';
import {USER_DOCS} from '../generated/userDocs';
import ThreadOverview from './thread/ThreadOverview';
import {requestEinkRefresh} from '../utils/screenRefresh';
import HelpOverlay from '../ui/HelpOverlay';
import {AppTab, tabLabel} from '../ui/TabBar';
import {closeThreadOverview, useThreadOverview} from '../ui/threadOverlayStore';

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
  const thread = useThreadOverview();

  useEffect(() => {
    if (!inTabs) setHelpPage(null);
  }, [inTabs]);
  useEffect(() => {
    if (!inTabs && thread) closeThreadOverview();
  }, [inTabs, thread]);
  useEffect(() => {
    setHelpPage(null);
    closeThreadOverview();
  }, [activeTab]);
  // An overview opened while the help shows replaces it.
  useEffect(() => {
    if (thread) setHelpPage(null);
  }, [thread]);

  const closeHelp = () => {
    if (helpPage === null) return;
    setHelpPage(null);
    requestEinkRefresh();
  };
  const closeThread = () => {
    if (!thread) return;
    closeThreadOverview();
    requestEinkRefresh();
  };

  const toggleHelp = () => {
    if (helpPage !== null) {
      closeHelp();
      return;
    }
    closeThreadOverview();
    const page = helpStartPage(activeTab, lastHelpRef.current, new Set(Object.keys(USER_DOCS.pages)));
    lastHelpRef.current = {tab: activeTab, pageId: page};
    setHelpPage(page);
  };
  const selectHelpPage = (pageId: string) => {
    lastHelpRef.current = {tab: activeTab, pageId};
    setHelpPage(pageId);
  };

  let overlay: React.ReactNode = null;
  if (helpPage !== null) {
    overlay = <HelpOverlay pageId={helpPage} onSelectPage={selectHelpPage} onClose={closeHelp} />;
  } else if (thread && inTabs) {
    overlay = <ThreadOverview request={thread} backLabel={`‹ ${tabLabel(activeTab)}`} onClose={closeThread} />;
  }

  return {
    helpOpen: helpPage !== null,
    toggleHelp,
    closeOverlays: () => {
      closeHelp();
      closeThread();
    },
    overlay,
  };
}
