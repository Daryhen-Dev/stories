import { describe, expect, it } from "vitest";

import {
  diagnoseConnection,
  CONNECTION_DIAGNOSIS_CODE,
} from "./cors-diagnosis.js";

describe("two-context connection diagnosis (PM R3 / R4)", () => {
  it("keeps Node network, auth, bucket, and public-read failures ahead of browser CORS evidence", () => {
    const nodeFailures = [
      ["NETWORK_ERROR", CONNECTION_DIAGNOSIS_CODE.NETWORK],
      ["AUTH_FAILED", CONNECTION_DIAGNOSIS_CODE.AUTH],
      ["BUCKET_NOT_FOUND", CONNECTION_DIAGNOSIS_CODE.BUCKET],
      ["BUCKET_NOT_PUBLIC", CONNECTION_DIAGNOSIS_CODE.PUBLIC_READ],
    ] as const;

    for (const [code, expected] of nodeFailures) {
      expect(
        diagnoseConnection({
          provider: "supabase",
          nodeGet: { ok: false, code, remediation: "fix provider setup" },
          browserGet: { ok: false, error: "browser fetch rejected" },
          browserRange: { ok: false, error: "range rejected" },
        }).code,
      ).toBe(expected);
    }
  });

  it("uses provider-specific CORS remediation only after Node public-read succeeds", () => {
    const cors = diagnoseConnection({
      provider: "insforge",
      nodeGet: { ok: true, httpStatus: 200 },
      browserGet: { ok: false, error: "TypeError: Failed to fetch" },
      browserRange: { ok: true },
    });
    const range = diagnoseConnection({
      provider: "insforge",
      nodeGet: { ok: true, httpStatus: 200 },
      browserGet: { ok: true },
      browserRange: { ok: false, error: "Range is not allowed" },
    });

    expect(cors).toMatchObject({
      code: CONNECTION_DIAGNOSIS_CODE.CORS,
      remediation: expect.stringContaining("InsForge"),
    });
    expect(range).toMatchObject({
      code: CONNECTION_DIAGNOSIS_CODE.VIDEO_SEEKING,
      remediation: expect.stringContaining("Range"),
    });
  });
});
