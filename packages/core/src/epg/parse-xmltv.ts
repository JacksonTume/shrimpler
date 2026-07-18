// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8.2 / ADR-0015 — streaming XMLTV parser. XMLTV EPGs are often tens of MB
// (and gzipped); this consumes decoded text chunks and emits <channel>/<programme>
// elements incrementally, never buffering the whole document. Hand-rolled (no
// DOMParser — core is DOM-less, and a full DOM would defeat the point). Lenient in
// the house style (parse-m3u / addon manifest): a malformed element is skipped, not
// thrown, so one bad entry never sinks the feed.

/** A parsed <channel> — id plus its first display-name (for fuzzy matching). */
export interface XmltvChannel {
  id: string;
  displayName?: string;
}

/** A parsed <programme>, times normalized to UTC epoch ms. */
export interface XmltvProgramme {
  /** The XMLTV `channel` attribute (a tvg-id). */
  channel: string;
  start: number;
  stop: number;
  title: string;
  desc?: string;
  category?: string;
}

export interface XmltvHandlers {
  onChannel?: (channel: XmltvChannel) => void;
  onProgramme?: (programme: XmltvProgramme) => void;
}

// Safety valve: if input is so malformed that no element ever closes, don't let
// the buffer grow without bound. A real element is a few KB, so this never trips
// on well-formed feeds.
const MAX_BUFFER = 8_000_000;

/**
 * Parse a streamed XMLTV document, invoking handlers per element. Resolves when
 * the stream ends. Never throws for content reasons (malformed elements are
 * skipped); only a rejection from the underlying `chunks` iterator propagates.
 */
export async function parseXmltvStream(
  chunks: AsyncIterable<string>,
  handlers: XmltvHandlers,
): Promise<void> {
  let buf = "";
  for await (const chunk of chunks) {
    buf = drain(buf + chunk, handlers);
    if (buf.length > MAX_BUFFER) {
      // Pathological input with no closing tag — keep only the tail so we can
      // still recover if a valid element appears later.
      buf = buf.slice(buf.length - 1024);
    }
  }
  drain(buf, handlers);
}

/** Process every complete element in `buf`; return the unconsumed remainder. */
function drain(buf: string, handlers: XmltvHandlers): string {
  for (;;) {
    const cIdx = buf.indexOf("<channel");
    const pIdx = buf.indexOf("<programme");
    const present = [cIdx, pIdx].filter((i) => i >= 0);
    if (present.length === 0) {
      // Retain a possible partial start tag split across the chunk boundary.
      const lt = buf.lastIndexOf("<");
      return lt >= 0 ? buf.slice(lt) : "";
    }
    const startIdx = Math.min(...present);
    const isChannel = cIdx >= 0 && (pIdx < 0 || cIdx < pIdx);

    const gt = buf.indexOf(">", startIdx);
    if (gt < 0) {
      return buf.slice(startIdx); // start tag not fully arrived yet
    }
    if (buf[gt - 1] === "/") {
      // Self-closing element (e.g. a channel with no display-name): body-less.
      handleElement(buf.slice(startIdx, gt + 1), isChannel, handlers);
      buf = buf.slice(gt + 1);
      continue;
    }
    const closeTag = isChannel ? "</channel>" : "</programme>";
    const closeIdx = buf.indexOf(closeTag, gt);
    if (closeIdx < 0) {
      return buf.slice(startIdx); // element spans past the current buffer
    }
    const end = closeIdx + closeTag.length;
    handleElement(buf.slice(startIdx, end), isChannel, handlers);
    buf = buf.slice(end);
  }
}

function handleElement(
  element: string,
  isChannel: boolean,
  handlers: XmltvHandlers,
): void {
  try {
    if (isChannel) {
      const channel = parseChannel(element);
      if (channel) handlers.onChannel?.(channel);
    } else {
      const programme = parseProgramme(element);
      if (programme) handlers.onProgramme?.(programme);
    }
  } catch {
    // Lenient: drop a malformed element rather than aborting the stream.
  }
}

function parseChannel(element: string): XmltvChannel | null {
  const id = attr(element, "id");
  if (id === undefined || id === "") return null;
  const channel: XmltvChannel = { id };
  const name = innerText(element, "display-name");
  if (name !== undefined && name !== "") channel.displayName = name;
  return channel;
}

function parseProgramme(element: string): XmltvProgramme | null {
  const channel = attr(element, "channel");
  const start = parseXmltvTime(attr(element, "start"));
  const stop = parseXmltvTime(attr(element, "stop"));
  const title = innerText(element, "title");
  if (
    channel === undefined ||
    channel === "" ||
    start === undefined ||
    stop === undefined ||
    title === undefined ||
    title === ""
  ) {
    return null;
  }
  const programme: XmltvProgramme = { channel, start, stop, title };
  const desc = innerText(element, "desc");
  if (desc !== undefined && desc !== "") programme.desc = desc;
  const category = innerText(element, "category");
  if (category !== undefined && category !== "") programme.category = category;
  return programme;
}

/** Read an attribute from the element's start tag (double or single quoted). */
function attr(element: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(element);
  if (m === null) return undefined;
  return decodeEntities(m[1] ?? m[2] ?? "");
}

/** Inner text of the first `<tag …>…</tag>`, tags stripped + entities decoded. */
function innerText(element: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(element);
  if (m === null) return undefined;
  return decodeEntities(m[1]!.replace(/<[^>]*>/g, "")).trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Parse an XMLTV timestamp (`YYYYMMDDHHMMSS` + optional ` ±HHMM` offset) to UTC
 * epoch ms. A missing offset is treated as UTC (deterministic; the alternative,
 * local time, is untestable and machine-dependent).
 */
export function parseXmltvTime(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(
    value.trim(),
  );
  if (m === null) return undefined;
  const [, y, mo, d, h, mi, s, tz] = m;
  let offsetMin = 0;
  if (tz !== undefined) {
    const sign = tz[0] === "-" ? -1 : 1;
    offsetMin = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  }
  const utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s === undefined ? 0 : Number(s),
  );
  return utc - offsetMin * 60_000;
}
