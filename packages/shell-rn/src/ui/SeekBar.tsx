// SPDX-License-Identifier: AGPL-3.0-or-later
// The player's draggable position control — the RN counterpart of the web's
// `.reef-seek` <input type="range">, in the same coral tide palette.
//
// Built on PanResponder rather than a slider package on purpose: the mobile shell
// targets an Expo dev client, and every extra native module means the user has to
// rebuild it. PanResponder is pure JS. Gesture maths stay in page-independent
// terms — the grant's `locationX` (relative to this view) plus the gesture's `dx`
// — so no measure() round-trip is needed.

import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { color, DISABLED_OPACITY, radius, space } from "./tokens";

interface SeekBarProps {
  positionSec: number;
  durationSec: number;
  disabled?: boolean;
  /** Fired once, on release — not on every drag frame. */
  onSeek: (positionSec: number) => void;
}

export function SeekBar({
  positionSec,
  durationSec,
  disabled,
  onSeek,
}: SeekBarProps) {
  // While dragging, the thumb follows the finger instead of the player's clock.
  const [dragSec, setDragSec] = useState<number | null>(null);

  // The responder is built once; everything it reads lives in refs so it never
  // closes over a stale duration/width/callback.
  const widthRef = useRef(0);
  const durationRef = useRef(durationSec);
  durationRef.current = durationSec;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const responder = useMemo(() => {
    let grantX = 0;
    const toSeconds = (x: number): number => {
      const width = widthRef.current;
      if (width <= 0) {
        return 0;
      }
      return Math.max(0, Math.min(1, x / width)) * durationRef.current;
    };
    const enabled = (): boolean => disabledRef.current !== true;

    return PanResponder.create({
      onStartShouldSetPanResponder: enabled,
      onMoveShouldSetPanResponder: enabled,
      onPanResponderGrant: (event) => {
        grantX = event.nativeEvent.locationX;
        setDragSec(toSeconds(grantX));
      },
      onPanResponderMove: (_event, gesture) => {
        setDragSec(toSeconds(grantX + gesture.dx));
      },
      onPanResponderRelease: (_event, gesture) => {
        const seconds = toSeconds(grantX + gesture.dx);
        setDragSec(null);
        onSeekRef.current(seconds);
      },
      onPanResponderTerminate: () => setDragSec(null),
    });
  }, []);

  const shown = dragSec ?? positionSec;
  const fraction =
    durationSec > 0 ? Math.max(0, Math.min(1, shown / durationSec)) : 0;
  // Annotated, not inferred: a bare template literal widens to `string`, which
  // RN's DimensionValue (number | `${number}%` | …) rejects.
  const percent: `${number}%` = `${fraction * 100}%`;

  function onLayout(event: LayoutChangeEvent): void {
    widthRef.current = event.nativeEvent.layout.width;
  }

  return (
    <View
      {...responder.panHandlers}
      onLayout={onLayout}
      accessibilityRole="adjustable"
      style={[styles.hitArea, disabled === true && styles.disabled]}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: percent }]} />
      </View>
      <View style={[styles.thumb, { left: percent }]} />
    </View>
  );
}

const THUMB = 16;

const styles = StyleSheet.create({
  // A 6px bar is not a touch target; the padding makes the grab area ~30px.
  hitArea: { flex: 1, paddingVertical: space.md, justifyContent: "center" },
  disabled: { opacity: DISABLED_OPACITY },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: color.coral },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    backgroundColor: color.coral,
  },
});
