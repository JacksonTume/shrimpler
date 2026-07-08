// SPDX-License-Identifier: AGPL-3.0-or-later
// Stream picker overlay (§6.3, §10 step 4): a modal-style list of ranked
// candidates for a content id (useStreamPicker → core.streams). Selecting one
// resolves it via debrid to a playable source and hands it up via onPlay; the
// host navigates to the playback screen. Rendered from the detail screen so the
// detail → pick → play flow stays one screen deep. Pushes its own back handler
// (focus/back stack, ADR-0010) so Back closes the overlay, not the screen. Copy
// via labels (ADR-0007); focus follows the AddonManagerScreen conventions.

import { useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import { labels, useStreamPicker } from "@shrimpler/shared-ui";
import type { ContentId, MediaType, PlayableSource } from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";

const OVERLAY_FOCUS_KEY = "STREAM_PICKER";
const CLOSE_FOCUS_KEY = "STREAM_PICKER_CLOSE";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

/** A neutral one-line label for a candidate; never a hard-coded source name. */
function streamLabel(source: PlayableSource): string {
  const main = source.title ?? source.quality ?? labels.streamsTitle;
  return source.cached === true ? `${main} · ⚡` : main;
}

function StreamRow({
  source,
  disabled,
  onSelect,
}: {
  source: PlayableSource;
  disabled: boolean;
  onSelect: (source: PlayableSource) => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => {
      if (!disabled) {
        onSelect(source);
      }
    },
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      disabled={disabled}
      onClick={() => onSelect(source)}
      style={{
        ...focusOutline(focused),
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "0.5rem",
      }}
    >
      {streamLabel(source)}
    </button>
  );
}

interface StreamPickerOverlayProps {
  id: ContentId;
  type: MediaType;
  onClose: () => void;
  onPlay: (source: PlayableSource) => void;
}

export function StreamPickerOverlay({
  id,
  type,
  onClose,
  onPlay,
}: StreamPickerOverlayProps) {
  const {
    streams,
    isLoading,
    error,
    isResolving,
    resolveError,
    select,
  } = useStreamPicker(id, type);

  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: OVERLAY_FOCUS_KEY,
    saveLastFocusedChild: true,
  });
  const closeButton = useFocusable<object, HTMLButtonElement>({
    focusKey: CLOSE_FOCUS_KEY,
    onEnterPress: onClose,
  });

  // Back closes the overlay (top of the stack), not the detail screen.
  useBackHandler(onClose);

  useEffect(() => {
    void setFocus(CLOSE_FOCUS_KEY);
  }, []);

  const onSelect = useCallback(
    async (source: PlayableSource): Promise<void> => {
      const resolved = await select(source);
      if (resolved !== null) {
        onPlay(resolved);
      }
    },
    [select, onPlay],
  );

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        role="dialog"
        aria-label={labels.streamsTitle}
        ref={ref}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.8)",
          padding: "2rem",
          overflowY: "auto",
          zIndex: 20,
        }}
      >
        <header style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button
            ref={closeButton.ref}
            type="button"
            data-focused={closeButton.focused}
            onClick={onClose}
            style={focusOutline(closeButton.focused)}
          >
            {labels.back}
          </button>
          <h2>{labels.streamsTitle}</h2>
        </header>

        {isLoading ? (
          <p role="status">{labels.streamsLoading}</p>
        ) : error !== null ? (
          <p role="alert" style={{ color: "#e66" }}>
            {error}
          </p>
        ) : streams.length === 0 ? (
          <p>{labels.streamsEmpty}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {streams.map((source) => (
              <li key={source.id}>
                <StreamRow
                  source={source}
                  disabled={isResolving}
                  onSelect={(s) => void onSelect(s)}
                />
              </li>
            ))}
          </ul>
        )}

        {isResolving && <p role="status">{labels.streamsLoading}</p>}
        {resolveError !== null && (
          <p role="alert" style={{ color: "#e66" }}>
            {resolveError}
          </p>
        )}
      </div>
    </FocusContext.Provider>
  );
}
