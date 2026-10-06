/**
 * Review step "Gmail inbox" (docs/dev/technical-design-review-gmail-inbox.md):
 * the Gmail inbox, fetched over IMAP only when the user taps Load/Refresh
 * (never automatically, so a failure can't turn into a retry loop). An
 * email can become a todo or meeting in the Inbox, its text or an
 * attachment can be linked onto what was created, and it can be archived.
 * The list is storage/gmailInboxCache.ts's cache, mirrored into state after
 * every call that changes it; an archived email leaves the list at once.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {setCachedInbox} from '../../../storage/dataCache';
import {linkedFileStatus} from '../../../storage/linkedFiles';
import {addMeetingToDestination, addTaskToDestination, buildMeeting, buildTask, mutateEntryMeetings, mutateEntryTasks} from '../../../storage/itemMutations';
import {summarizeAttachmentsByExtension} from '../../../domain/attachmentSummary';
import {isAttachmentSupported, saveGmailAttachment} from '../../../storage/gmailAttachments';
import {saveGmailEmailAsNote} from '../../../storage/gmailEmailNote';
import {archiveGmailMessage, fetchGmailBody, GmailCacheMessage, getCachedGmailInbox, getGmailFetchedAt, isGmailConfigured, refreshGmailInbox} from '../../../storage/gmailInboxCache';
import {fetchAttachment as fetchGmailAttachmentBytes, GmailAttachmentInfo} from '../../../storage/gmailImapNative';
import {log, logError} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import {ClipIcon} from '../../../ui/icons';
import GmailBodyPane from '../../../ui/GmailBodyPane';
import QuickAddWidget, {MeetingQuickAddFields} from '../../../ui/QuickAddWidget';
import ReviewMasterDetail from '../../../ui/ReviewMasterDetail';
import {common} from '../../../ui/commonStyles';
import {COLORS} from '../../../ui/theme';
import {useErrorStatus, useStatusApi} from '../../../ui/status/StatusProvider';
import MarkWrap from '../../../ui/status/StatusMark';
import {errorMessage} from '../../../utils/errorMessage';
import {formatClock} from '../../../domain/dateFormat';
import {styles} from '../reviewStyles';
import {FIXED_INBOX_DESTINATION, ReviewEmptyDetail, ReviewStepProps} from '../shared';
import {bump, visitStepId} from '../reviewVisit';




/**
 * One Todo/Meeting created from a Gmail message during the current visit
 * (docs/dev/technical-design-review-gmail-inbox.md §8) - `index` is that item's
 * position in `inbox.tasks`/`inbox.meetings` (Gmail-created items are always
 * Inbox-resident, same fixedDestination as Week ahead's own quick-add), kept
 * so the detail panel can offer to link the email's own text or one of its
 * attachments onto exactly that item afterwards (linkedFile is single-valued
 * - domain/types.ts's Task/Meeting - so this is a one-shot "which file"
 * choice per created item, same as everywhere else linkedFile is set).
 */
interface GmailCreatedItem {
  type: 'task' | 'meeting';
  index: number;
  label: string;
  /**
   * What this item is currently linked to (set after a successful link on this
   * visit; linkedFile is single-valued, so a later link overwrites it). `key`
   * is 'body' for the email text (saved as a .note), otherwise the
   * attachment's partId - the panel uses it to mark the active pill "✓" and
   * to show the file name under the item.
   */
  linked?: {kind: 'body' | 'attachment'; name: string; key: string};
}

// Fixed height of one Gmail-inbox left row (a subject line + a
// from/attachment-count line).
const GMAIL_ROW_PX = 60;

/** How long the Archive pill shows inverted (black) before the email leaves the list - long enough to register on e-ink, short enough not to feel slow. */
const ARCHIVE_FLASH_MS = 350;

/** "HH:MM" of a fetch time - same short form the Google Calendar panel's "Refresh (last …)" label uses for today. */

/**
 * The Gmail step's Load/Refresh button label, mirroring
 * ui/GoogleCalendarPanel.tsx's own: "Load Gmail inbox" before anything has
 * been fetched, "Refreshing… Ns" (live elapsed seconds, so a slow IMAP
 * connect - up to the native 20 s timeout - visibly isn't frozen) while
 * loading, and "🔄 Refresh (last HH:MM)" afterwards.
 */
function GmailRefreshLabel({
  loading,
  fetchedAt,
  textColor,
}: {
  loading: boolean;
  fetchedAt: number | null;
  textColor: string;
}): React.JSX.Element {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!loading) {
      setStartedAt(null);
      return;
    }
    setStartedAt(Date.now());
    const id = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);
  const elapsed = startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000);
  const label = loading
    ? `Refreshing… ${elapsed}s`
    : fetchedAt !== null
    ? `🔄 Refresh (last ${formatClock(new Date(fetchedAt))})`
    : 'Load Gmail inbox';
  return <Text style={[styles.pillText, {color: textColor}]}>{label}</Text>;
}

/** One left-list row of the Gmail inbox step: subject over "from · 📎N", checkmarked once a Todo/Meeting has been created from it or it's been archived this visit. */
function GmailEmailRow({
  message,
  selected,
  actedOn,
  textColor,
  borderColor,
}: {
  message: GmailCacheMessage;
  selected: boolean;
  actedOn: boolean;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  // 📎 counts only attachments the device can open - signature/inline images don't make a mail "have an attachment".
  const viewableAttachmentCount = message.attachments.filter(a => isAttachmentSupported(a.mimeType)).length;
  return (
    <View
      style={[
        styles.masterRow,
        {height: GMAIL_ROW_PX, minHeight: GMAIL_ROW_PX, borderColor},
        selected && styles.masterRowSelected,
      ]}>
      <Text style={[styles.masterRowText, {color: textColor}, actedOn && styles.masterRowActedOn]} numberOfLines={1}>
        {actedOn ? '✓ ' : ''}
        {message.subject || '(no subject)'}
      </Text>
      <Text style={[common.rowSource, {color: textColor}, actedOn && styles.masterRowActedOn]} numberOfLines={1}>
        {message.from}
        {viewableAttachmentCount > 0 ? ` · 📎 ${viewableAttachmentCount}` : ''}
      </Text>
    </View>
  );
}

/**
 * Gmail inbox detail panel: the message's from/date, a QuickAddWidget to
 * turn it into a Todo or Meeting (always filed to Inbox - an email has no
 * Project/Area of its own), the attachments (one line per attachment inside
 * storage/gmailAttachments.ts's SUPPORTED_ATTACHMENT_MIME_TYPES allow-list;
 * everything else collapses into ONE summary line by file extension, "+4
 * .png, +2 .jpg"), a "link the email's text" action once at
 * least one item has been created from it, and Archive - and, filling ALL the
 * remaining height at the bottom, the email's body (fetched lazily the first
 * time this uid is selected - see the mount effect below) in ui/
 * GmailBodyPane.tsx: scrollable (the app's one deliberate exception to the
 * no-scroll policy) and selectable, with Copy / -> Todo / -> Meeting acting
 * on the selection (docs/dev/technical-design-gmail-body-select.md).
 * -> Todo/-> Meeting hand the selected text to the QuickAddWidget above via
 * its `prefill` prop (appended to the draft, tab switched) - the item is
 * still created with that widget's own +Add, like any other.
 */
function GmailDetailPanel({
  message,
  createdItems,
  onFetchBody,
  onAddTask,
  onAddMeeting,
  onLinkArtifact,
  onArchive,
  textColor,
  borderColor,
  placeholderColor,
}: {
  message: GmailCacheMessage;
  createdItems: GmailCreatedItem[];
  onFetchBody: (uid: string) => Promise<string | 'unsupported'>;
  onAddTask: (message: GmailCacheMessage, text: string) => Promise<void>;
  onAddMeeting: (message: GmailCacheMessage, fields: MeetingQuickAddFields) => Promise<void>;
  onLinkArtifact: (
    message: GmailCacheMessage,
    item: GmailCreatedItem,
    artifact: {kind: 'body'} | {kind: 'attachment'; attachment: GmailAttachmentInfo},
    onProgress?: (text: string) => void,
  ) => Promise<void>;
  onArchive: (message: GmailCacheMessage) => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  /** Archive pill shown inverted (black) for ARCHIVE_FLASH_MS right after the tap, before the email leaves the list. */
  const [archiveFlash, setArchiveFlash] = useState(false);
  const archiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);
    },
    [],
  );
  const handleArchivePress = () => {
    if (archiveFlash) return;
    setError(null);
    setArchiveFlash(true);
    requestEinkRefresh();
    archiveTimerRef.current = setTimeout(() => {
      archiveTimerRef.current = null;
      setArchiveFlash(false);
      onArchive(message);
    }, ARCHIVE_FLASH_MS);
  };
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));
  const [bodyText, setBodyText] = useState<string | 'unfetched' | 'unsupported'>(message.bodyText);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  /** Status text of the link in progress ("Creating note... page 2/5") - shown on the running pill. */
  const [linkProgress, setLinkProgress] = useState<string | null>(null);
  // Attachments split: the ones the device can open get their own
  // line (and a "Save & link" pill); the rest collapse into one "+4 .png, +2
  // .jpg" line - mostly signature/inline images nobody wants listed.
  const viewableAttachments = message.attachments.filter(a => isAttachmentSupported(a.mimeType));
  const unviewableSummary = summarizeAttachmentsByExtension(
    message.attachments.filter(a => !isAttachmentSupported(a.mimeType)).map(a => a.fileName),
  );

  // -> Todo / -> Meeting requests for the QuickAddWidget (its `prefill` prop
  // acts once per nonce). Panel-local on purpose: it resets when the panel
  // unmounts (step left / selection cleared), and a message switch keeps the
  // same nonce so it can never re-apply an old request to the new message.
  const [prefill, setPrefill] = useState<{kind: 'task' | 'meeting'; text: string; nonce: number} | null>(null);
  const prefillNonceRef = useRef(0);
  const sendToWidget = (kind: 'task' | 'meeting', text: string) => {
    prefillNonceRef.current += 1;
    setPrefill({kind, text, nonce: prefillNonceRef.current});
  };

  // Lazily fetches this message's body the first time it's selected - keyed
  // on `message.uid` (not the whole `message` object, which is a fresh
  // reference on every parent re-render) so this doesn't refetch on every
  // unrelated action elsewhere on the step. Guards against a stale write if
  // the user selects a different message before this resolves (same "ignore
  // a stale async result" pattern the rest of this app's own mount effects
  // use for editingInboxItem's linkedFileMissing check, for example).
  useEffect(() => {
    setBodyText(message.bodyText);
    if (message.bodyText !== 'unfetched') return;
    let cancelled = false;
    onFetchBody(message.uid)
      .then(body => {
        if (!cancelled) setBodyText(body);
      })
      .catch(e => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.uid]);

  // requestEinkRefresh() in every .finally: busy state, progress text, success and
  // errors are async state changes the panel would otherwise not repaint on e-ink.
  const runLink = (key: string, fn: (onProgress: (text: string) => void) => Promise<void>) => {
    setError(null);
    setLinkProgress(null);
    setLinkingKey(key);
    requestEinkRefresh();
    fn(text => {
      setLinkProgress(text);
      requestEinkRefresh();
    })
      .catch(e => setError(errorMessage(e)))
      .finally(() => {
        setLinkingKey(null);
        setLinkProgress(null);
        requestEinkRefresh();
      });
  };

  return (
    <View style={styles.gmailDetailRoot}>
      <Text style={[styles.cardTitle, {color: textColor}]}>{message.subject || '(no subject)'}</Text>
      <Text style={[common.rowSource, {color: textColor}]}>{message.from}</Text>

      {message.attachments.length > 0 && (
        <View style={common.sectionSpacingSmall}>
          <Text style={[styles.sectionLabel, {color: textColor}]}>Attachments</Text>
          {viewableAttachments.map(attachment => (
            <View key={attachment.partId} style={styles.shelvedRow}>
              <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
                {attachment.fileName}
              </Text>
            </View>
          ))}
          {unviewableSummary !== '' && (
            <Text style={[common.hint, {color: textColor}]} numberOfLines={1}>
              {unviewableSummary}
            </Text>
          )}
        </View>
      )}

      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <QuickAddWidget
        fixedDestination={FIXED_INBOX_DESTINATION}
        onAddTask={text => onAddTask(message, text)}
        onAddMeeting={fields => onAddMeeting(message, fields)}
        prefill={prefill}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />

      {createdItems.length > 0 && (
        <View style={styles.cardShelved}>
          <Text style={[common.subheading, styles.cardShelvedHeading, {color: textColor}]}>Created from this email</Text>
          {createdItems.map(item => {
            const itemKey = `${item.type}-${item.index}`;
            const bodyKey = `${itemKey}-body`;
            const bodyLinked = item.linked?.key === 'body';
            return (
              <View key={itemKey} style={styles.gmailCreatedItem}>
                <View style={styles.shelvedRow}>
                  <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
                    {item.type === 'meeting' ? '📅 ' : '• '}
                    {item.label}
                  </Text>
                  <View style={styles.pillRow}>
                    <Pressable
                      style={[styles.pill, {borderColor}]}
                      disabled={linkingKey !== null || bodyText === 'unfetched' || bodyLinked}
                      onPress={() => runLink(bodyKey, onProgress => onLinkArtifact(message, item, {kind: 'body'}, onProgress))}
                      hitSlop={8}>
                      <Text style={[styles.pillText, {color: textColor}]}>
                        {linkingKey === bodyKey ? linkProgress ?? 'Creating note...' : bodyLinked ? '✓ Email linked as note' : 'Link email as note'}
                      </Text>
                    </Pressable>
                    {viewableAttachments.map(attachment => {
                      const attachmentKey = `${itemKey}-${attachment.partId}`;
                      const attachmentLinked = item.linked?.key === attachment.partId;
                      return (
                        <Pressable
                          key={attachment.partId}
                          style={[styles.pill, {borderColor}]}
                          disabled={linkingKey !== null || attachmentLinked}
                          onPress={() =>
                            runLink(attachmentKey, onProgress =>
                              onLinkArtifact(message, item, {kind: 'attachment', attachment}, onProgress),
                            )
                          }
                          hitSlop={8}>
                          <Text style={[styles.pillText, {color: textColor}]}>
                            {linkingKey === attachmentKey
                              ? linkProgress ?? 'Saving...'
                              : attachmentLinked
                              ? `✓ "${attachment.fileName}" linked`
                              : `Save & link "${attachment.fileName}"`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {item.linked && (
                  <View style={styles.gmailLinkedLine}>
                    <ClipIcon color={textColor} />
                    <Text style={[common.hint, styles.gmailLinkedName, {color: textColor}]} numberOfLines={1}>
                      {item.linked.name}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, {borderColor}, archiveFlash && styles.pillFlash]}
          disabled={archiveFlash}
          onPress={handleArchivePress}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: archiveFlash ? COLORS.accentText : textColor}]}>Archive</Text>
        </Pressable>
      </View>

      {/* The email text: everything below the controls above, all remaining height, scrolls inside itself. */}
      <View style={styles.gmailBodyArea}>
        {bodyText === 'unfetched' ? (
          <Text style={[common.hint, {color: textColor}]}>Loading…</Text>
        ) : bodyText === 'unsupported' ? (
          <Text style={[common.hint, {color: textColor}]}>This email's text couldn't be read.</Text>
        ) : (
          <GmailBodyPane
            text={bodyText}
            onToTodo={selected => sendToWidget('task', selected)}
            onToMeeting={selected => sendToWidget('meeting', selected)}
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
      </View>
    </View>
  );
}

export default function GmailStep({
  data,
  stepEntryToken,
  textColor,
  borderColor,
  placeholderColor,
}: ReviewStepProps): React.JSX.Element {
  const {settings, inbox, inboxPath, paths, refreshFromCache} = data;
  /**
   * Gmail inbox review step (docs/dev/technical-design-review-gmail-inbox.md) -
   * NOT a frozen snapshot of the usual kind: the source of truth is storage/
   * gmailInboxCache.ts's own module-level cache (a real IMAP fetch, not a
   * resnapshot of the already-warm item cache), mirrored into this plain
   * `useState` and kept in sync explicitly after every cache-mutating call
   * below, the same "storage layer owns the data, this screen just mirrors
   * it into state" split `inbox`/`aggregate` already use for their own
   * sources. `null` means "not fetched yet this session" (distinct from `[]`,
   * an empty inbox) - see loadGmailInbox below.
   */
  const [gmailMessages, setGmailMessages] = useState<GmailCacheMessage[] | null>(getCachedGmailInbox());
  const [gmailLoading, setGmailLoading] = useState(false);
  /** Synchronous double-tap guard for loadGmailInbox - `gmailLoading` state only updates on the next render, so two quick taps could otherwise both start a fetch. */
  const gmailLoadingRef = useRef(false);
  /** Why the last manual refresh failed (already categorised - permission / login / no connection / other - by storage/gmailImapNative.ts's describeGmailFailure). Stays on screen until the user taps Refresh again; nothing clears or retries it automatically. */
  const [gmailError, setGmailError] = useState<string | null>(null);
  /** When the shown list was last fetched successfully - mirrors storage/gmailInboxCache.ts's getGmailFetchedAt, drives the "Refresh (last HH:MM)" label. */
  const [gmailFetchedAt, setGmailFetchedAt] = useState<number | null>(getGmailFetchedAt());
  /** uid -> the Todo/Meeting(s) created from that email during this visit - drives both settings.gmailHideHandled's filtering and the detail panel's "link the email/an attachment to what you just created" affordance. Cleared on every step entry, same as every other step's own acted-on bookkeeping. */
  const [gmailCreatedItems, setGmailCreatedItems] = useState<Record<string, GmailCreatedItem[]>>({});
  /** uid -> linkedFile of the .note already written for that email during this visit, so linking the email text onto a second item of the same email reuses the note instead of writing another one (docs/dev/technical-design-gmail-email-note.md 3.7). Reset with gmailCreatedItems on step entry. */
  const [gmailEmailNotes, setGmailEmailNotes] = useState<Record<string, string>>({});
  /** Generic "did something with this email" checkmark for `ui/ReviewMasterDetail.tsx`'s `actedOnKeys` - set by creating an item from the email (an archived email leaves the list immediately - see handleArchiveGmailMessage - so it never shows this checkmark). */
  const [gmailActedOn, setGmailActedOn] = useState<Set<string>>(new Set());
  /** Gmail step's left-list selection, CONTROLLED here (ui/ReviewMasterDetail.tsx's optional selectedKey prop) so an archive can move it to the neighbouring email. Reset on every step entry / 🔄 via stepEntryToken, like the shell's own internal reset. */
  const [gmailSelectedKey, setGmailSelectedKey] = useState<string | null>(null);
  /** A background archive that failed (the email is back in the list) - shown under the Refresh button until the next archive or refresh. */
  const [gmailArchiveErrorState, setGmailArchiveErrorState] = useState<string | null>(null);
  // Refresh/archive failures go to the central status slot and mark the
  // Refresh pill (docs/dev/technical-design-status-slot.md §7.5). An archive
  // failure is published globally through the (App-level, always mounted)
  // status API, so it still appears when the background IMAP call fails
  // after the user left Review.
  const statusApi = useStatusApi();
  const gmailArchiveError = gmailArchiveErrorState;
  const setGmailArchiveError = useCallback(
    (text: string | null) => {
      setGmailArchiveErrorState(text);
      if (text) {
        statusApi.show('gmail.archiveFailed', {
          kind: 'error',
          scope: 'global',
          text,
          onDismiss: () => statusApi.clear('gmail.archiveFailed'),
        });
      } else {
        statusApi.clear('gmail.archiveFailed');
      }
    },
    [statusApi],
  );
  useErrorStatus('ReviewScreen.gmailError', gmailError && !gmailLoading ? `Gmail refresh failed: ${gmailError}` : null, () => setGmailError(null));
  useEffect(() => {
    setGmailSelectedKey(null);
    setGmailArchiveError(null);
  }, [stepEntryToken, setGmailArchiveError]);

  /**
   * (Re-)fetches the Gmail inbox over IMAP and mirrors the result into this
   * screen's own state - the one place this screen actually talks to the
   * network for this step (every other Gmail helper below only reads/mutates
   * the already-fetched storage/gmailInboxCache.ts cache and re-mirrors it,
   * same "storage owns it, this state just mirrors it" split `load` above
   * uses for `inbox`/`aggregate`). Called ONLY by the step's own manual
   * Load/Refresh button (renderGmailInbox) - never on step entry, never from
   * an effect, never as a retry: an automatic retry would loop on a failure
   * and clear the error text before it could be read.
   * Also NOT by reopening the step or Reload all files (load), since an IMAP round
   * trip is a materially different cost than resnapshotting the already-warm
   * local cache every other step refreshes against. A failure leaves
   * `gmailMessages` as it was and shows `gmailError` until the next tap.
   */
  const loadGmailInbox = useCallback(async () => {
    if (!settings || gmailLoadingRef.current) return;
    gmailLoadingRef.current = true;
    setGmailLoading(true);
    setGmailError(null);
    setGmailArchiveError(null);
    try {
      const messages = await refreshGmailInbox(settings);
      setGmailMessages(messages);
      setGmailFetchedAt(getGmailFetchedAt());
    } catch (e) {
      const message = errorMessage(e);
      logError('ReviewScreen: Gmail inbox load failed', message);
      setGmailError(message);
    } finally {
      gmailLoadingRef.current = false;
      setGmailLoading(false);
      requestEinkRefresh();
    }
  }, [settings, setGmailArchiveError]);

  /**
   * Gmail inbox review step (docs/dev/technical-design-review-gmail-inbox.md
   * §8) - "add task"/"add meeting" from a message. Always to the Inbox
   * (FIXED_INBOX_DESTINATION, same as Week ahead's own quick-add - an email
   * has no Project/Area of its own to file straight into), via the same
   * shared storage/itemMutations.ts calls handleAddTask/handleAddInboxMeeting
   * already use. Records the created item's own index (gmailCreatedItems) so
   * the detail panel can offer to link the email's text or an attachment
   * onto it afterwards, and marks the message acted-on (checkmark).
   */
  const handleAddGmailTask = async (message: GmailCacheMessage, text: string): Promise<void> => {
    const {nextInbox} = await addTaskToDestination(buildTask(text), FIXED_INBOX_DESTINATION, {inbox, inboxPath});
    if (nextInbox) {
      setCachedInbox(nextInbox);
      const index = nextInbox.tasks.length - 1;
      setGmailCreatedItems(prev => ({
        ...prev,
        [message.uid]: [...(prev[message.uid] ?? []), {type: 'task', index, label: text}],
      }));
    } else {
      refreshFromCache();
    }
    bump('tasksAdded');
    bump('gmailItemsCreated');
    setGmailActedOn(prev => new Set(prev).add(message.uid));
    log('ReviewScreen: added task from Gmail message', message.uid);
    requestEinkRefresh();
  };

  /** Meeting counterpart of handleAddGmailTask - see that function's own doc comment. Doesn't bump 'tasksAdded' (this is a meeting, not a task), same distinction handleAddInboxMeeting/handleAddTask already draw elsewhere on this screen. */
  const handleAddGmailMeeting = async (message: GmailCacheMessage, fields: MeetingQuickAddFields): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), FIXED_INBOX_DESTINATION, {inbox, inboxPath});
    if (nextInbox) {
      setCachedInbox(nextInbox);
      const index = nextInbox.meetings.length - 1;
      setGmailCreatedItems(prev => ({
        ...prev,
        [message.uid]: [...(prev[message.uid] ?? []), {type: 'meeting', index, label: fields.title}],
      }));
    } else {
      refreshFromCache();
    }
    bump('gmailItemsCreated');
    setGmailActedOn(prev => new Set(prev).add(message.uid));
    log('ReviewScreen: added meeting from Gmail message', message.uid);
    requestEinkRefresh();
  };

  /** Lazily fetches (and caches) one message's full body - see storage/gmailInboxCache.ts's own fetchGmailBody doc comment for why this isn't done for every listed message up front. */
  const handleFetchGmailBody = async (uid: string): Promise<string | 'unsupported'> => {
    if (!settings) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
    const body = await fetchGmailBody(settings, uid);
    setGmailMessages(getCachedGmailInbox());
    return body;
  };

  /**
   * Links the email's own text, or one of its attachments, onto a Todo/
   * Meeting already created from it (docs/dev/technical-design-review-gmail-
   * inbox.md §8) - the email text is written as a multi-page .note
   * (storage/gmailEmailNote.ts, docs/dev/technical-design-gmail-email-note.md),
   * an attachment as the file itself (storage/gmailAttachments.ts); either way
   * the result is set as that item's `linkedFile` via storage/
   * itemMutations.ts's mutateEntryTasks/mutateEntryMeetings, the same
   * write-through every other linkedFile assignment on this screen uses.
   * `linkedFile` is single-valued (domain/types.ts), so linking a second file
   * onto the same item simply replaces the first - same behavior as re-arming
   * a link elsewhere in this app. Linking the email text onto a second item
   * of the same email reuses the note written for the first one (if it still
   * exists). `onProgress` receives short status texts for the pill.
   */
  const handleLinkGmailArtifact = async (
    message: GmailCacheMessage,
    item: GmailCreatedItem,
    artifact: {kind: 'body'} | {kind: 'attachment'; attachment: GmailAttachmentInfo},
    onProgress?: (text: string) => void,
  ): Promise<void> => {
    if (!settings || !paths || !inboxPath) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
    let linkedFile: string;
    let linkedName: string;
    let linkedKey: string;
    if (artifact.kind === 'body') {
      linkedKey = 'body';
      const existingNote = gmailEmailNotes[message.uid];
      if (existingNote && (await linkedFileStatus(paths, existingNote)) === 'ok') {
        linkedFile = existingNote;
      } else {
        const body = await fetchGmailBody(settings, message.uid);
        setGmailMessages(getCachedGmailInbox());
        if (body === 'unsupported') {
          throw new Error("This email's text couldn't be read - it has no plain-text or HTML content this plugin could parse.");
        }
        const saved = await saveGmailEmailAsNote(
          paths,
          {subject: message.subject, from: message.from, date: message.date},
          body,
          onProgress,
        );
        linkedFile = saved.linkedFile;
        setGmailEmailNotes(prev => ({...prev, [message.uid]: saved.linkedFile}));
      }
      linkedName = linkedFile.slice(linkedFile.lastIndexOf('/') + 1);
    } else {
      linkedKey = artifact.attachment.partId;
      onProgress?.('Saving...');
      const base64 = await fetchGmailAttachmentBytes(
        {email: settings.gmailEmail, appPassword: settings.gmailAppPassword, imapHost: settings.gmailImapHost || 'imap.gmail.com'},
        message.uid,
        artifact.attachment.partId,
      );
      linkedFile = await saveGmailAttachment(paths, message.subject, artifact.attachment.fileName, base64);
      linkedName = linkedFile.slice(linkedFile.lastIndexOf('/') + 1);
    }
    // Index-drift guard: the created item is addressed by its position in the Inbox file, so
    // make sure the item there is still the one this row was created for before writing.
    const driftMessage = `"${item.label}" changed on disk - Settings → Advanced → Reload all files.`;
    if (item.type === 'task') {
      const {nextInbox} = await mutateEntryTasks(
        {item: {kind: 'inbox', path: inboxPath}, taskIndex: item.index, task: {text: item.label}},
        tasks => {
          const next = tasks.slice();
          const current = next[item.index];
          if (!current || current.text.trim() !== item.label.trim()) throw new Error(driftMessage);
          next[item.index] = {...current, linkedFile};
          return next;
        },
        {inbox, inboxPath},
      );
      if (nextInbox) setCachedInbox(nextInbox);
    } else {
      const {nextInbox} = await mutateEntryMeetings(
        {item: {kind: 'inbox', path: inboxPath}, meetingIndex: item.index, meeting: {title: item.label}},
        meetings => {
          const next = meetings.slice();
          const current = next[item.index];
          if (!current || current.title.trim() !== item.label.trim()) throw new Error(driftMessage);
          next[item.index] = {...current, linkedFile};
          return next;
        },
        {inbox, inboxPath},
      );
      if (nextInbox) setCachedInbox(nextInbox);
    }
    setGmailCreatedItems(prev => ({
      ...prev,
      [message.uid]: (prev[message.uid] ?? []).map(entry =>
        entry.type === item.type && entry.index === item.index
          ? {...entry, linked: {kind: artifact.kind, name: linkedName, key: linkedKey}}
          : entry,
      ),
    }));
    log('ReviewScreen: linked Gmail artifact', message.uid, artifact.kind, linkedFile);
    requestEinkRefresh();
  };

  /**
   * Gmail's own "Archive" (remove from Inbox, not deletion - storage/
   * gmailInboxCache.ts's own doc comment; docs/
   * technical-design-review-monthly-focus.md §4): the panel has already
   * flashed the pill black; here the email leaves the list IMMEDIATELY, the
   * selection moves to the neighbouring email (the one below, else the one
   * above), and the IMAP call runs in the background (queued in the cache
   * module). Only a failure brings the email back - at its old position,
   * with a step-level error line - and takes the recap count back.
   * Synchronous on purpose: the panel doesn't wait for the network.
   */
  const handleArchiveGmailMessage = (message: GmailCacheMessage): void => {
    if (!settings) {
      setGmailArchiveError('Settings not loaded yet - Settings → Advanced → Reload all files.');
      return;
    }
    const index = gmailList.findIndex(m => m.uid === message.uid);
    const neighbour = index < 0 ? null : gmailList[index + 1] ?? gmailList[index - 1] ?? null;
    setGmailSelectedKey(neighbour ? neighbour.uid : null);
    setGmailArchiveError(null);
    const archiving = archiveGmailMessage(settings, message.uid);
    // archiveGmailMessage removed the message from the cache synchronously.
    setGmailMessages(getCachedGmailInbox());
    bump('gmailArchived');
    log('ReviewScreen: archiving Gmail message in background', message.uid);
    requestEinkRefresh();
    archiving
      .then(() => log('ReviewScreen: archived Gmail message', message.uid))
      .catch(e => {
        const reason = errorMessage(e);
        logError('ReviewScreen: background Gmail archive failed', message.uid, reason);
        // The cache already put the message back at its old position.
        setGmailMessages(getCachedGmailInbox());
        if (visitStepId() === 'gmailInbox') bump('gmailArchived', -1);
        setGmailArchiveError(`Couldn't archive "${message.subject || '(no subject)'}": ${reason} - it's back in the list.`);
        requestEinkRefresh();
      });
  };

  // Gmail inbox step's own left list - `gmailMessages` (this visit's fetch,
  // or `null` before the first one lands) filtered by settings.gmailHideHandled
  // ("has at least one Todo/Meeting created from it this visit" -
  // gmailCreatedItems; a message handled on a PREVIOUS visit has no way to
  // be known as such here, since Gmail itself carries no such marker - see
  // domain/settings.ts's own gmailHideHandled doc comment).
  const gmailList = (gmailMessages ?? []).filter(
    message => !settings?.gmailHideHandled || !(gmailCreatedItems[message.uid]?.length > 0),
  );

  /**
   * Gmail inbox (docs/dev/technical-design-review-gmail-inbox.md) - a
   * ReviewMasterDetail step like Meetings to close out above, but its rows
   * come from storage/gmailInboxCache.ts's own IMAP-backed cache
   * (`gmailList`) rather than the local item cache, and there is no frozen-
   * membership snapshot: an archived message leaves the list immediately
   * (background archive - handleArchiveGmailMessage), anything
   * else stays in place, so `gmailActedOn` is a plain checkmark, not a
   * "still shown despite not matching anymore" marker like the other
   * steps' acted-on sets. Selection is controlled here
   * (`gmailSelectedKey`) so an archive can move it to the next email.
   */
  const renderGmailInboxDetail = (selectedKey: string | null): React.ReactNode => {
    if (!settings) return null;
    if (!isGmailConfigured(settings)) {
      return (
        <ReviewEmptyDetail
          title="Gmail isn't set up yet"
          text="Add your Gmail address and an app password in Settings → Gmail to triage your inbox here."
          hint="Settings → Gmail."
          textColor={textColor}
        />
      );
    }
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No email selected"
          text="Turn an email into a todo or meeting, save its text or an attachment alongside it, then archive it - all without leaving this step."
          hint="Tap an email on the left to get started."
          textColor={textColor}
        />
      );
    }
    const message = gmailList.find(m => m.uid === selectedKey);
    if (!message) return null;
    return (
      <GmailDetailPanel
        message={message}
        createdItems={gmailCreatedItems[message.uid] ?? []}
        onFetchBody={handleFetchGmailBody}
        onAddTask={handleAddGmailTask}
        onAddMeeting={handleAddGmailMeeting}
        onLinkArtifact={handleLinkGmailArtifact}
        onArchive={handleArchiveGmailMessage}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  const renderGmailInbox = () => {
    if (settings && !isGmailConfigured(settings)) {
      return (
        <View style={styles.stackedColumn}>
          <ReviewEmptyDetail
            title="Gmail isn't set up yet"
            text="Add your Gmail address and an app password in Settings → Gmail to triage your inbox here."
            hint="Settings → Gmail."
            textColor={textColor}
          />
        </View>
      );
    }
    return (
      <View style={styles.stackedColumn}>
        <View style={styles.gmailToolbar}>
          <MarkWrap mark={(gmailError && !gmailLoading) || gmailArchiveError ? 'warning' : null} textColor={textColor}>
            <Pressable style={[styles.pill, {borderColor}]} disabled={gmailLoading} onPress={loadGmailInbox} hitSlop={8}>
              <GmailRefreshLabel
                loading={gmailLoading}
                fetchedAt={gmailMessages === null ? null : gmailFetchedAt}
                textColor={textColor}
              />
            </Pressable>
          </MarkWrap>
        </View>
        <ReviewMasterDetail<GmailCacheMessage>
          header="Gmail inbox"
          rows={gmailList}
          rowHeight={() => GMAIL_ROW_PX}
          isSelectable={() => true}
          rowKey={message => message.uid}
          renderRow={(message, selected, actedOn) => (
            <GmailEmailRow message={message} selected={selected} actedOn={actedOn} textColor={textColor} borderColor={borderColor} />
          )}
          renderDetail={renderGmailInboxDetail}
          actedOnKeys={gmailActedOn}
          resetKey={stepEntryToken}
          selectedKey={gmailSelectedKey}
          onSelectedKeyChange={setGmailSelectedKey}
          emptyHint={
            gmailLoading
              ? 'Loading…'
              : gmailMessages === null
              ? gmailError
                ? 'Nothing loaded - see the message at the top, then tap Refresh.'
                : 'Not loaded yet - tap "Load Gmail inbox" above to fetch it.'
              : 'Gmail inbox is at zero. 🎉'
          }
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
    );
  };


  return renderGmailInbox();
}
