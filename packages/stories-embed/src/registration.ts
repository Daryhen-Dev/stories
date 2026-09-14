/// <reference lib="dom" />

import { StoriesViewer } from "./stories-viewer.js";

const TAG_NAME = "stories-viewer";

/** Explicit browser-only registration; safe to import from SSR environments. */
export function defineStoriesViewer(): void {
  if (!hasBrowserCustomElementsRegistry()) {
    return;
  }
  if (customElements.get(TAG_NAME) === undefined) {
    customElements.define(TAG_NAME, StoriesViewer);
  }
}

function hasBrowserCustomElementsRegistry(): boolean {
  return typeof window !== "undefined" && typeof customElements !== "undefined";
}
