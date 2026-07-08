// SPDX-License-Identifier: AGPL-3.0-or-later
// Debrid resolver seam (§6.4, ADR-0005). Real-Debrid is the v1 provider
// (ADR-0013, §13.3); the seam stays generic for AllDebrid/Premiumize/torrent
// engines later.
export type { DebridProvider } from "./provider";
export { RealDebridProvider } from "./real-debrid";
export type { RealDebridProviderOptions } from "./real-debrid";
