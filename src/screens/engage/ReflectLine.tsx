/**
 * "Reflect on this meeting ›" (docs/dev/history/technical-design-meeting-reflection.md
 * §2.8, R9): a quiet line on the meeting's page once the meeting is over,
 * above "Go to … ›". A tap opens the meeting's Reflection page - creating it
 * after the confirm. Hidden while the page shown is already that reflection
 * (Engage treats it as the meeting's page, R10), and before the meeting is over.
 */
import React, {useEffect, useState} from 'react';
import {Text} from 'react-native';
import {Meeting} from '../../domain/types';
import {REFLECT_ON_MEETING_TEXT, reflectionOffered} from '../../domain/reflection';
import {getCurrentPageNum} from '../../supernote/currentPage';
import {getCurrentNotePath} from '../../supernote/fileSystem';
import {useReflectionLookup} from '../../ui/useReflectionLookup';
import {errorMessage} from '../../utils/errorMessage';
import {logWarn} from '../../utils/log';
import {engageStyles as styles} from './engageStyles';

interface Props {
  meeting: Meeting;
  itemPath: string;
  onPress: () => void;
  textColor: string;
}

export default function ReflectLine({meeting, itemPath, onPress, textColor}: Props): React.JSX.Element | null {
  const reflection = useReflectionLookup(meeting, itemPath, 'ReflectLine');
  const [shown, setShown] = useState<{path: string | null; page: number | null} | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getCurrentNotePath(), getCurrentPageNum()])
      .then(([path, page]) => !cancelled && setShown({path, page}))
      .catch(e => {
        logWarn('ReflectLine: reading the open page failed', errorMessage(e));
        if (!cancelled) setShown({path: null, page: null});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!reflectionOffered(meeting, Date.now()) || !shown || reflection.state === 'unknown') return null;
  const onReflection = reflection.found !== null && reflection.found.absolutePath === shown.path && reflection.found.page === shown.page;
  if (onReflection) return null;
  return (
    <Text style={[styles.backLine, {color: textColor}]} numberOfLines={1} onPress={onPress} suppressHighlighting>
      {REFLECT_ON_MEETING_TEXT}
    </Text>
  );
}
