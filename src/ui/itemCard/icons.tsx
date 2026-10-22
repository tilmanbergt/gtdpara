/**
 * The item card's icon-only buttons (docs/dev/history/technical-design-item-card.md
 * K8, UI draft "Reflect icon"): black stroke on white, or white on black
 * when the button stands for something that exists or is on - the same
 * convention as ui/icons.tsx.
 */
import React from 'react';
import {Line, Path, Polyline, Rect, Svg} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

const STROKE = {fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'} as const;

/** Reflect: a loop turning back, with a question mark inside. */
export function ReflectIcon({size = 20, color = '#000000'}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="1 4 1 10 7 10" stroke={color} {...STROKE} />
      <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke={color} {...STROKE} />
      <Path d="M10.1 10a2 2 0 1 1 2.8 1.8c-.6.3-.9.7-.9 1.4" stroke={color} {...STROKE} />
      <Line x1={12} y1={15.7} x2={12} y2={15.8} stroke={color} {...STROKE} />
    </Svg>
  );
}

/** Refile: an arrow going into a tray. */
export function RefileIcon({size = 20, color = '#000000'}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke={color} {...STROKE} />
      <Path d="M12 3v12M7.5 10.5L12 15l4.5-4.5" stroke={color} {...STROKE} />
    </Svg>
  );
}

/** New from this: two overlapping pages. */
export function NewFromThisIcon({size = 20, color = '#000000'}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={9} y={9} width={12} height={12} rx={2} stroke={color} {...STROKE} />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={color} {...STROKE} />
    </Svg>
  );
}

/** Cancel meeting: a calendar with a cross. */
export function CancelMeetingIcon({size = 20, color = '#000000'}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={4} width={18} height={18} rx={2} stroke={color} {...STROKE} />
      <Path d="M16 2v4M8 2v4M3 10h18M10 14l4 4M14 14l-4 4" stroke={color} {...STROKE} />
    </Svg>
  );
}
