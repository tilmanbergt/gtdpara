/**
 * Renders the markdown subset of domain/markdownBlocks.ts, paged without
 * scrolling (docs/dev/history/technical-design-about-debug-experimental.md §3.5).
 * Used by Settings → About's "What's new"; meant to be reused by the in-app
 * Help later.
 *
 * Each block is one PagedSection row. Row heights are estimated with the
 * app's shared line estimator against the measured column width, so a page
 * holds as many blocks as fit; a block is never split across pages.
 */
import React, {useMemo, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, Text, View} from 'react-native';
import {blockText, InlineSpan, MarkdownBlock, parseMarkdownBlocks} from '../domain/markdownBlocks';
import PagedSection from './PagedSection';
import {activeLineEstimator} from './textLineEstimator';
import {FONT} from './theme';

const BODY_LINE = 21;
const CODE_LINE = 19;
const CODE_PAD = 6;
const HEADING_LINE = 24;
const ITEM_INDENT = 18;
const NESTED_INDENT = 18;
const BLOCK_GAP = 4;
const HEADING_TOP = 8;
/** Estimates err on the safe side: a slightly short page beats a clipped block. */
const SAFETY = 1.08;

function indentOf(block: MarkdownBlock): number {
  return block.kind === 'item' ? ITEM_INDENT + block.depth * NESTED_INDENT : 0;
}

export function markdownBlockHeight(block: MarkdownBlock, widthPx: number): number {
  if (block.kind === 'code') {
    const available = Math.max(40, widthPx - 2 * CODE_PAD);
    const lines = block.lines.reduce(
      (n, line) => n + Math.max(1, activeLineEstimator.estimateLines(line, available, FONT.small)),
      0,
    );
    return Math.ceil(lines * CODE_LINE * SAFETY) + 2 * CODE_PAD + BLOCK_GAP;
  }
  const heading = block.kind === 'heading';
  const font = heading ? FONT.medium : FONT.small;
  const lineHeight = heading ? HEADING_LINE : BODY_LINE;
  const available = Math.max(40, widthPx - indentOf(block));
  const lines = Math.max(1, activeLineEstimator.estimateLines(blockText(block), available, font));
  return Math.ceil(lines * lineHeight * SAFETY) + BLOCK_GAP + (heading ? HEADING_TOP : 0);
}

function Spans({spans, textColor}: {spans: InlineSpan[]; textColor: string}): React.JSX.Element {
  return (
    <>
      {spans.map((span, i) => (
        <Text key={i} style={[span.bold && styles.bold, span.code && styles.code, {color: textColor}]}>
          {span.text}
        </Text>
      ))}
    </>
  );
}

export function MarkdownBlockView({block, textColor}: {block: MarkdownBlock; textColor: string}): React.JSX.Element {
  if (block.kind === 'code') {
    return (
      <View style={[styles.codeBox, {borderColor: textColor}]}>
        <Text style={[styles.codeText, {color: textColor}]}>{block.lines.join('\n')}</Text>
      </View>
    );
  }
  if (block.kind === 'heading') {
    return (
      <Text style={[styles.heading, {color: textColor}]}>
        <Spans spans={block.spans} textColor={textColor} />
      </Text>
    );
  }
  if (block.kind === 'item') {
    return (
      <View style={[styles.itemRow, {paddingLeft: block.depth * NESTED_INDENT}]}>
        <Text style={[styles.marker, {color: textColor}]}>{block.marker}</Text>
        <Text style={[styles.body, styles.itemText, {color: textColor}]}>
          <Spans spans={block.spans} textColor={textColor} />
        </Text>
      </View>
    );
  }
  return (
    <Text style={[styles.body, styles.paragraph, {color: textColor}]}>
      <Spans spans={block.spans} textColor={textColor} />
    </Text>
  );
}

interface Props {
  markdown: string;
  header: React.ReactNode;
  /** Changes when a different document is shown, so paging starts at page 1 again. */
  resetKey: string;
  emptyHint?: string;
  textColor: string;
  borderColor: string;
}

/** Fills its (bounded, flex) parent; pages with ‹ › in the header line. */
export default function MarkdownPager({markdown, header, resetKey, emptyHint, textColor, borderColor}: Props): React.JSX.Element {
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) {setWidth(w);}
  };
  const rows = useMemo(() => blocks.map((block, index) => ({block, index})), [blocks]);
  return (
    <View style={styles.root} onLayout={onLayout}>
      {width > 0 && (
        <PagedSection
          header={header}
          rows={rows}
          rowHeight={row => markdownBlockHeight(row.block, width)}
          resetKey={`${resetKey}|${width}`}
          renderRow={row => (
            <View key={row.index} style={styles.blockBox}>
              <MarkdownBlockView block={row.block} textColor={textColor} />
            </View>
          )}
          emptyHint={emptyHint}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  blockBox: {marginBottom: BLOCK_GAP},
  heading: {
    fontSize: FONT.medium,
    lineHeight: HEADING_LINE,
    fontWeight: '700',
    marginTop: HEADING_TOP,
  },
  body: {
    fontSize: FONT.small,
    lineHeight: BODY_LINE,
  },
  paragraph: {},
  itemRow: {flexDirection: 'row'},
  marker: {
    width: ITEM_INDENT,
    fontSize: FONT.small,
    lineHeight: BODY_LINE,
  },
  itemText: {flex: 1},
  bold: {fontWeight: '700'},
  code: {fontFamily: 'monospace'},
  codeBox: {borderLeftWidth: 2, paddingHorizontal: CODE_PAD, paddingVertical: CODE_PAD},
  codeText: {fontFamily: 'monospace', fontSize: FONT.small, lineHeight: CODE_LINE},
});
