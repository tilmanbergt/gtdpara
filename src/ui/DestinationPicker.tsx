/**
 * The "where should this go" destination picker for Task/Meeting quick-add
 * flows - Inbox, or any cached Active Project/Area (domain/destination.ts's
 * destinationCandidates: focused items float to the top). Shared by
 * DailyView.tsx and ui/TaskQuickAdd.tsx (Daily view and the Weekly Review
 * look-ahead step) so they use the same picker. Unlike most presentation in
 * the codebase, which stays per-screen (design-overview.md §3), this one is
 * shared. CaptureScreen.tsx keeps its own separate copy of this picker.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Destination, destinationCandidates, destinationLabel, sameDestination} from '../domain/destination';
import {CachedItem} from '../storage/dataCache';
import {common} from './commonStyles';
import {FONT} from './theme';

interface Props {
  destination: Destination;
  onSelect: (destination: Destination) => void;
  open: boolean;
  onToggleOpen: () => void;
  items: CachedItem[];
  textColor: string;
  borderColor: string;
}

export default function DestinationPicker({
  destination,
  onSelect,
  open,
  onToggleOpen,
  items,
  textColor,
  borderColor,
}: Props): React.JSX.Element {
  // Only Active items, focused (daily/weekly) ones first - see
  // domain/destination.ts's destinationCandidates.
  const projects = destinationCandidates(items.filter(item => item.kind === 'project'));
  const areas = destinationCandidates(items.filter(item => item.kind === 'area'));

  return (
    <View style={styles.wrap}>
      <Pressable style={[styles.row, {borderColor}]} onPress={onToggleOpen}>
        <Text style={[styles.text, {color: textColor}]}>{destinationLabel(destination)}</Text>
        <Text style={[styles.text, {color: textColor}]}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={[styles.list, {borderColor}]}>
          <Option
            label="Inbox"
            selected={destination.type === 'inbox'}
            textColor={textColor}
            onPress={() => onSelect({type: 'inbox'})}
          />
          {projects.length > 0 && <Text style={[common.subheading, {color: textColor}]}>Projects</Text>}
          {projects.map(item => (
            <Option
              key={item.path}
              label={item.name}
              selected={sameDestination(destination, {type: 'item', kind: item.kind, name: item.name, path: item.path})}
              textColor={textColor}
              onPress={() => onSelect({type: 'item', kind: item.kind, name: item.name, path: item.path})}
            />
          ))}
          {areas.length > 0 && <Text style={[common.subheading, {color: textColor}]}>Areas</Text>}
          {areas.map(item => (
            <Option
              key={item.path}
              label={item.name}
              selected={sameDestination(destination, {type: 'item', kind: item.kind, name: item.name, path: item.path})}
              textColor={textColor}
              onPress={() => onSelect({type: 'item', kind: item.kind, name: item.name, path: item.path})}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Option({
  label,
  selected,
  textColor,
  onPress,
}: {
  label: string;
  selected: boolean;
  textColor: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Text style={[styles.text, {color: textColor}, selected && styles.textSelected]}>
        {selected ? '● ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  list: {
    borderWidth: 1,
    borderTopWidth: 0,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  option: {
    paddingVertical: 6,
  },
  text: {
    fontSize: FONT.medium,
  },
  textSelected: {
    fontWeight: '600',
  },
});
