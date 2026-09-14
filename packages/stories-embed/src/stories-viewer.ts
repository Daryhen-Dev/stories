import { LitElement, css, html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { loadManifest } from "./manifest-loader.js";
import type { ManifestModel, ManifestStoryModel } from "./manifest-model.js";

const MANIFEST_REFRESH_MS = 60_000;
const PROGRESS_TICK_MS = 100;
const STORY_DURATION_MS = 5_000;

const emptyModel = (): ManifestModel => ({
  projectId: "",
  generatedAt: "",
  stories: [],
});

/** Browser-only, full-screen manifest viewer with client-side expiry defense. */
export class StoriesViewer extends LitElement {
  static override properties = {
    manifestUrl: { attribute: "manifest-url" },
  };

  static override styles = css`
    :host {
      background: #000;
      color: #fff;
      display: block;
      inset: 0;
      position: fixed;
    }

    .viewer {
      block-size: 100%;
      inline-size: 100%;
      overflow: hidden;
      position: relative;
      touch-action: manipulation;
    }

    .media,
    img,
    video {
      block-size: 100%;
      inline-size: 100%;
    }

    img,
    video {
      display: block;
      object-fit: cover;
    }

    .progress {
      display: flex;
      gap: 0.25rem;
      inset: 1rem 1rem auto;
      position: absolute;
      z-index: 1;
    }

    .progress-segment {
      background: rgb(255 255 255 / 35%);
      block-size: 0.25rem;
      flex: 1;
      overflow: hidden;
    }

    .progress-segment::before {
      background: #fff;
      block-size: 100%;
      content: "";
      display: block;
      inline-size: var(--progress, 0%);
    }

    .zone {
      background: transparent;
      border: 0;
      cursor: pointer;
      inset-block: 0;
      padding: 0;
      position: absolute;
      width: 50%;
    }

    .previous {
      inset-inline-start: 0;
    }

    .next {
      inset-inline-end: 0;
    }

    .empty {
      align-items: center;
      block-size: 100%;
      display: flex;
      justify-content: center;
    }
  `;

  declare manifestUrl: string | null;

  #currentIndex = 0;
  #elapsedProgressMs = 0;
  #forcedRefreshVersion: number | undefined;
  #lastFetchedAt: number | undefined;
  #loadVersion = 0;
  #model: ManifestModel = emptyModel();
  #progressPaused = false;
  #progressStartedAt = 0;
  #progressTimer: ReturnType<typeof globalThis.setInterval> | undefined;
  #requestedUrl: string | null | undefined;

  get model(): ManifestModel {
    return this.#model;
  }

  get currentStory(): ManifestStoryModel | undefined {
    return this.#model.stories[this.#currentIndex];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.tabIndex = 0;
    this.addEventListener("keydown", this.handleKeydown);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    void this.loadCurrentUrl();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.handleKeydown);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.removePointerReleaseListeners();
    this.stopProgressTimer();
    this.#forcedRefreshVersion = undefined;
    this.#loadVersion += 1;
    this.#requestedUrl = undefined;
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("manifestUrl") && this.isConnected) {
      void this.loadCurrentUrl();
    }
  }

  next(): void {
    this.navigate(1);
  }

  previous(): void {
    this.navigate(-1);
  }

  protected override render(): TemplateResult {
    const story = this.currentStory;
    if (story === undefined) {
      return html`<section class="viewer">
        <p class="empty" role="status">No active stories.</p>
      </section>`;
    }

    return html`
      <section
        aria-label="Stories viewer"
        class="viewer"
        @pointerdown=${this.handlePointerDown}
      >
        <div aria-label="Story progress" class="progress">
          ${this.#model.stories.map(
            (_item, index) => html`
              <div
                aria-valuemax="100"
                aria-valuemin="0"
                aria-valuenow=${this.progressValue(index)}
                class="progress-segment"
                data-progress-segment=${index}
                role="progressbar"
                style=${`--progress: ${this.progressValue(index)}%`}
              ></div>
            `,
          )}
        </div>
        <div class="media">${this.renderMedia(story)}</div>
        <button
          aria-label="Previous story"
          class="previous zone"
          type="button"
          @click=${this.previous}
        ></button>
        <button
          aria-label="Next story"
          class="next zone"
          type="button"
          @click=${this.next}
        ></button>
      </section>
    `;
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.previous();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.next();
    }
  };

  private readonly handlePointerDown = (): void => {
    if (this.#progressPaused) {
      return;
    }
    this.#elapsedProgressMs = this.currentProgressMs();
    this.#progressPaused = true;
    document.addEventListener("pointercancel", this.handlePointerRelease);
    document.addEventListener("pointerup", this.handlePointerRelease);
    this.stopProgressTimer();
    this.currentVideo()?.pause();
    this.requestUpdate();
  };

  private readonly handlePointerRelease = (): void => {
    this.removePointerReleaseListeners();
    if (!this.#progressPaused) {
      return;
    }
    this.#progressPaused = false;
    this.#progressStartedAt = Date.now();
    this.startProgressTimer();
    void this.currentVideo()
      ?.play()
      .catch(() => undefined);
    this.requestUpdate();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") {
      return;
    }
    const lastFetchedAt = this.#lastFetchedAt;
    if (
      lastFetchedAt === undefined ||
      Date.now() - lastFetchedAt <= MANIFEST_REFRESH_MS
    ) {
      return;
    }
    void this.refreshCurrentUrl();
  };

  private activeStories(): readonly ManifestStoryModel[] {
    return this.#model.stories.filter(
      (story) => new Date(story.expiresAt).getTime() > Date.now(),
    );
  }

  private currentProgressMs(): number {
    if (this.#progressPaused || this.#progressTimer === undefined) {
      return this.#elapsedProgressMs;
    }
    return this.#elapsedProgressMs + (Date.now() - this.#progressStartedAt);
  }

  private currentVideo(): HTMLVideoElement | null | undefined {
    return this.shadowRoot?.querySelector("video");
  }

  private findActiveIndex(
    stories: readonly ManifestStoryModel[],
    activeStories: readonly ManifestStoryModel[],
    currentId: string | undefined,
    direction: -1 | 1,
  ): number {
    if (activeStories.length === 0) {
      return 0;
    }
    const currentActiveIndex =
      currentId === undefined
        ? -1
        : activeStories.findIndex((story) => story.id === currentId);
    if (currentActiveIndex >= 0) {
      return (
        (currentActiveIndex + direction + activeStories.length) %
        activeStories.length
      );
    }

    for (let offset = 1; offset <= stories.length; offset += 1) {
      const sourceIndex =
        (this.#currentIndex + direction * offset + stories.length) %
        stories.length;
      const story = stories[sourceIndex];
      if (story !== undefined) {
        const activeIndex = activeStories.findIndex(
          (item) => item.id === story.id,
        );
        if (activeIndex >= 0) {
          return activeIndex;
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
    await this.loadUrl(url, ++this.#loadVersion);
  }

  private async refreshCurrentUrl(): Promise<void> {
    const url = this.manifestUrl;
    if (
      url === null ||
      url === "" ||
      url !== this.#requestedUrl ||
      this.#forcedRefreshVersion !== undefined
    ) {
      return;
    }

    const loadVersion = ++this.#loadVersion;
    this.#forcedRefreshVersion = loadVersion;
    await this.loadUrl(url, loadVersion);
  }

  private async loadUrl(
    url: string | null,
    loadVersion: number,
  ): Promise<void> {
    if (url === null || url === "") {
      this.#lastFetchedAt = undefined;
      this.#model = emptyModel();
      this.#currentIndex = 0;
      this.resetProgress();
      this.requestUpdate();
      this.finishForcedRefresh(loadVersion);
      return;
    }

    try {
      const model = await loadManifest(url, {
        fetcher: browserFetch,
        warn: console.warn,
      });
      if (loadVersion !== this.#loadVersion || url !== this.manifestUrl) {
        return;
      }
      this.#lastFetchedAt = Date.now();
      this.#model = model;
      this.#currentIndex = 0;
      this.resetProgress();
      this.requestUpdate();
    } finally {
      this.finishForcedRefresh(loadVersion);
    }
  }

  private navigate(direction: -1 | 1): void {
    const stories = this.#model.stories;
    const currentId = this.currentStory?.id;
    const activeStories = this.activeStories();
    this.#model = { ...this.#model, stories: activeStories };
    this.#currentIndex = this.findActiveIndex(
      stories,
      activeStories,
      currentId,
      direction,
    );
    this.resetProgress();
    this.requestUpdate();
  }

  private progressValue(index: number): number {
    if (index < this.#currentIndex) {
      return 100;
    }
    if (index > this.#currentIndex) {
      return 0;
    }
    return Math.min(100, (this.currentProgressMs() / STORY_DURATION_MS) * 100);
  }

  private renderMedia(story: ManifestStoryModel): TemplateResult {
    if (story.type === "photo") {
      return html`<img alt="Story media" src=${story.mediaUrl} />`;
    }
    return html`
      <video
        ?autoplay=${true}
        ?muted=${true}
        @ended=${this.next}
        playsinline
        poster=${ifDefined(story.posterUrl)}
        src=${story.mediaUrl}
      ></video>
    `;
  }

  private removePointerReleaseListeners(): void {
    document.removeEventListener("pointercancel", this.handlePointerRelease);
    document.removeEventListener("pointerup", this.handlePointerRelease);
  }

  private resetProgress(): void {
    this.removePointerReleaseListeners();
    this.stopProgressTimer();
    this.#elapsedProgressMs = 0;
    this.#progressPaused = false;
    this.#progressStartedAt = Date.now();
    this.startProgressTimer();
  }

  private startProgressTimer(): void {
    if (
      !this.isConnected ||
      this.currentStory === undefined ||
      this.#progressPaused
    ) {
      return;
    }
    this.stopProgressTimer();
    this.#progressTimer = globalThis.setInterval(
      this.updateProgress,
      PROGRESS_TICK_MS,
    );
  }

  private stopProgressTimer(): void {
    if (this.#progressTimer === undefined) {
      return;
    }
    globalThis.clearInterval(this.#progressTimer);
    this.#progressTimer = undefined;
  }

  private readonly updateProgress = (): void => {
    if (this.#progressPaused || this.currentStory === undefined) {
      return;
    }
    if (this.currentProgressMs() >= STORY_DURATION_MS) {
      this.next();
      return;
    }
    this.requestUpdate();
  };

  private finishForcedRefresh(loadVersion: number): void {
    if (this.#forcedRefreshVersion === loadVersion) {
      this.#forcedRefreshVersion = undefined;
    }
  }
}

const browserFetch = (url: string) => fetch(url);
