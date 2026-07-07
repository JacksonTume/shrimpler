// SPDX-License-Identifier: AGPL-3.0-or-later
// Placeholder home screen. Empty-by-default per §9.1: no sources, no
// suggestions — the user supplies everything.

import { labels } from "@shrimpler/shared-ui";

export function HomeScreen() {
  return (
    <main>
      <h1>{labels.appName}</h1>
      <p>{labels.tagline}</p>
      <section>
        <h2>{labels.emptyHome}</h2>
        <p>{labels.emptyHomeHint}</p>
      </section>
      <footer>
        <small>{labels.disclaimer}</small>
      </footer>
    </main>
  );
}
