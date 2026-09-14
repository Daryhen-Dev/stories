import { LitElement, html, type TemplateResult } from "lit";

import { loadManifest } from "./manifest-loader.js";
import type { ManifestModel, ManifestStoryModel } from "./manifest-model.js";

const emptyModel = (): ManifestModel => ({
  projectId: "",
  generatedAt: "",
  stories: [],
});

/** Headless manifest consumer; visual viewer UX is intentionally deferred to PR 14. */
export class StoriesViewer extends LitElement {
  static override properties = {
    manifestUrl: { attribute: "manifest-url" },
  };

  declare manifestUrl: string | null;

  #loadVersion = 0;
  #requestedUrl: string | null | undefined;
  #currentIndex = 0;
  #model: ManifestModel = emptyModel();

  get model(): ManifestModel {
    return this.#model;
  }

  get currentStory(): ManifestStoryModel | undefined {
    return this.#model.stories[this.#currentIndex];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadCurrentUrl();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#requestedUrl = undefined;
    this.#loadVersion += 1;
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("manifestUrl") && this.isConnected) {
      void this.loadCurrentUrl();
    }
  }

  next(): void {
    const stories = this.#model.stories;
    const currentId = this.currentStory?.id;
    const activeStories = stories.filter(
      (story) => new Date(story.expiresAt).getTime() > Date.now(),
    );
    this.#model = { ...this.#model, stories: activeStories };
    const activeCurrentIndex =
      currentId === undefined
        ? -1
        : activeStories.findIndex((story) => story.id === currentId);
    this.#currentIndex = this.nextActiveIndex(
      stories,
      activeStories,
      activeCurrentIndex,
    );
    this.requestUpdate();
  }

  protected override render(): TemplateResult {
    return html`<span role="status">${this.currentStory?.id ?? ""}</span>`;
  }

  private nextActiveIndex(
    stories: readonly ManifestStoryModel[],
    activeStories: readonly ManifestStoryModel[],
    activeCurrentIndex: number,
  ): number {
    if (activeStories.length === 0) {
      return 0;
    }
    if (activeCurrentIndex >= 0) {
      return (activeCurrentIndex + 1) % activeStories.length;
    }

    for (let offset = 1; offset <= stories.length; offset += 1) {
      const story = stories[(this.#currentIndex + offset) % stories.length];
      if (story !== undefined) {
        const index = activeStories.findIndex((item) => item.id === story.id);
        if (index >= 0) {
          return index;
        }
      }
    }
    return 0;
  }

  private async loadCurrentUrl(): Promise<void> {
    const url = this.manifestUrl;
    if (url === this.#requestedUrl) {
      return;
    }
    this.#requestedUrl = url;
    const loadVersion = ++this.#loadVersion;
    if (url === null || url === "") {
      this.#model = emptyModel();
      this.#currentIndex = 0;
      this.requestUpdate();
      return;
    }
    const model = await loadManifest(url, {
      fetcher: browserFetch,
      warn: console.warn,
    });
    if (loadVersion !== this.#loadVersion || url !== this.manifestUrl) {
      return;
    }
    this.#model = model;
    this.#currentIndex = 0;
    this.requestUpdate();
  }
}

const browserFetch = (url: string) => fetch(url);
