import { describe, expect, it } from "vitest";

import { AdapterError, type AdapterErrorCode } from "./errors.js";
import { createFakeStorageAdapter } from "./fake-adapter.js";

const ALL_CODES: readonly AdapterErrorCode[] = [
  "AUTH_FAILED",
  "BUCKET_NOT_FOUND",
  "BUCKET_NOT_PUBLIC",
  "UPLOAD_FAILED",
  "OBJECT_NOT_FOUND",
  "VERIFY_MISMATCH",
  "DELETE_FAILED",
  "NETWORK_ERROR",
  "CORS_BLOCKED",
  "UNKNOWN",
];

describe("AdapterError (MSA R2 — typed taxonomy)", () => {
  it("constructs an AdapterError for every taxonomy code", () => {
    expect(ALL_CODES).toHaveLength(10);
    for (const code of ALL_CODES) {
      const error = new AdapterError(
        code,
        "supabase",
        `failure: ${code}`,
        "operator remediation",
        new Error("raw provider failure"),
      );
      expect(error).toBeInstanceOf(AdapterError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("AdapterError");
      expect(error.code).toBe(code);
      expect(error.provider).toBe("supabase");
      expect(error.message).toBe(`failure: ${code}`);
      expect(error.remediation).toBe("operator remediation");
      expect(error.cause).toBeInstanceOf(Error);
    }
  });

  it("allows omitting remediation and cause", () => {
    const error = new AdapterError("UNKNOWN", "insforge", "mystery failure");
    expect(error.remediation).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("raw provider errors never cross the boundary: adapters normalize to AdapterError", async () => {
    const adapter = createFakeStorageAdapter({
      bucket: "stories",
      publicBaseUrl: "https://cdn.example.com",
      authFailure: true,
    });
    const raised = await adapter
      .upload({
        key: "k",
        body: new TextEncoder().encode("x"),
        contentType: "text/plain",
        contentLength: 1,
        cacheControlSeconds: 60,
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(raised).toBeInstanceOf(AdapterError);
    if (!(raised instanceof AdapterError)) return;
    expect(raised.code).toBe("AUTH_FAILED");
    expect(raised.remediation).toBeTruthy();
    expect(raised.cause).toBeInstanceOf(Error);
  });
});
