/// <reference lib="dom" />

import { afterEach, describe, expect, it, vi } from "vitest";

import { defineStoriesViewer } from "./registration.js";

const registry = () => {
  let registered: CustomElementConstructor | undefined;
  return {
    get: vi.fn(() => registered),
    define: vi.fn((_name: string, constructor: CustomElementConstructor) => {
      registered = constructor;
    }),
  };
};

describe("stories viewer registration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps the main module inert even in a browser-like environment", async () => {
    const { get, define } = registry();
    vi.stubGlobal("window", {});
    vi.stubGlobal("customElements", { get, define });

    await import("./index.js");

    expect(define).not.toHaveBeenCalled();
  });

  it("does not register against a server-side custom-elements polyfill", () => {
    const { get, define } = registry();
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("customElements", { get, define });

    defineStoriesViewer();

    expect(define).not.toHaveBeenCalled();
  });

  it("explicitly defines once in browser-like environments", () => {
    const { get, define } = registry();
    vi.stubGlobal("window", {});
    vi.stubGlobal("customElements", { get, define });

    defineStoriesViewer();
    defineStoriesViewer();

    expect(define).toHaveBeenCalledTimes(1);
    expect(define).toHaveBeenCalledWith("stories-viewer", expect.any(Function));
  });

  it("register entry is inert on the server and registers in browser-like environments", async () => {
    const serverRegistry = registry();
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("customElements", serverRegistry);
    await import("./register.js");
    expect(serverRegistry.define).not.toHaveBeenCalled();

    vi.resetModules();
    const { get, define } = registry();
    vi.stubGlobal("window", {});
    vi.stubGlobal("customElements", { get, define });
    await import("./register.js");

    expect(define).toHaveBeenCalledWith("stories-viewer", expect.any(Function));
  });
});
