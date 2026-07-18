// SPDX-License-Identifier: AGPL-3.0-or-later
// Stream picker overlay (§6.3, §10 step 4): a modal list of ranked candidates for
// a content id (useStreamPicker → core.streams). Selecting one resolves it via
// debrid to a playable source and hands it up via onPlay; the host navigates to
// the playback screen. Rendered from the detail screen so detail → pick → play
// stays one screen deep. The Dialog scaffold owns the focus context + a back
// handler so Back closes the overlay, not the screen. Copy via labels (ADR-0007).

import { useCallback } from "react";
import { labels, useStreamPicker } from "@shrimpler/shared-ui";
import type { ContentId, MediaType, PlayableSource } from "@shrimpler/core";
import { Badge, Callout, Dialog, ListRow } from "../ui";

const OVERLAY_FOCUS_KEY = "STREAM_PICKER";
const CLOSE_FOCUS_KEY = "STREAM_PICKER_CLOSE";

/** A neutral one-line label for a candidate; never a hard-coded source name. */
function streamLabel(source: PlayableSource): string {
  return source.title ?? source.quality ?? labels.streamsTitle;
}

interface StreamPickerOverlayProps {
  id: ContentId;
  type: MediaType;
  onClose: () => void;
  /** The resolved source plus the content identity it was picked for (the
   *  playback screen needs the id/type for continue-watching progress). */
  onPlay: (source: PlayableSource, id: ContentId, type: MediaType) => void;
}

export function StreamPickerOverlay({
  id,
  type,
  onClose,
  onPlay,
}: StreamPickerOverlayProps) {
  const { streams, isLoading, error, isResolving, resolveError, select } =
    useStreamPicker(id, type);

  const onSelect = useCallback(
    async (source: PlayableSource): Promise<void> => {
      if (isResolving) {
        return;
      }
      const resolved = await select(source);
      if (resolved !== null) {
        onPlay(resolved, id, type);
      }
    },
    [select, onPlay, id, type, isResolving],
  );

  return (
    <Dialog
      title={labels.streamsTitle}
      onClose={onClose}
      dialogFocusKey={OVERLAY_FOCUS_KEY}
      closeFocusKey={CLOSE_FOCUS_KEY}
    >
      {isLoading ? (
        <Callout tone="status" role="status">
          {labels.streamsLoading}
        </Callout>
      ) : error !== null ? (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      ) : streams.length === 0 ? (
        <Callout tone="muted">{labels.streamsEmpty}</Callout>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {streams.map((source) => (
            <ListRow
              key={source.id}
              title={streamLabel(source)}
              trailing={
                source.cached === true ? (
                  <Badge tone="cached">⚡</Badge>
                ) : undefined
              }
              onPress={() => void onSelect(source)}
            />
          ))}
        </div>
      )}

      {isResolving && (
        <Callout tone="status" role="status">
          {labels.streamsLoading}
        </Callout>
      )}
      {resolveError !== null && (
        <Callout tone="error" role="alert">
          {resolveError}
        </Callout>
      )}
    </Dialog>
  );
}
