// SPDX-License-Identifier: AGPL-3.0-or-later
// Stream picker overlay (§6.3, §10 step 4) — the RN mirror of the web component.
// A sheet of ranked candidates for a content id (useStreamPicker → core.streams);
// selecting one resolves it via debrid and hands the playable source up, and the
// host navigates to playback. Rendered from the detail screen so detail → pick →
// play stays one screen deep. Copy routes through labels (ADR-0007).

import { useCallback } from "react";
import { labels, useStreamPicker } from "@shrimpler/shared-ui";
import type { ContentId, MediaType, PlayableSource } from "@shrimpler/core";
import { Badge, Callout, Dialog, ListRow } from "../ui";

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
    <Dialog title={labels.streamsTitle} onClose={onClose}>
      {isLoading ? (
        <Callout tone="status">{labels.streamsLoading}</Callout>
      ) : error !== null ? (
        <Callout tone="error">{error}</Callout>
      ) : streams.length === 0 ? (
        <Callout tone="muted">{labels.streamsEmpty}</Callout>
      ) : (
        streams.map((source) => (
          <ListRow
            key={source.id}
            testID={`stream-${source.id}`}
            title={streamLabel(source)}
            trailing={
              source.cached === true ? (
                <Badge tone="cached">⚡</Badge>
              ) : undefined
            }
            onPress={() => void onSelect(source)}
          />
        ))
      )}

      {isResolving && <Callout tone="status">{labels.streamsLoading}</Callout>}
      {resolveError !== null && <Callout tone="error">{resolveError}</Callout>}
    </Dialog>
  );
}
