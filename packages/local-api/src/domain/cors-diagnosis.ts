import type { PublicReadCheck, ProviderId } from "@stories/storage-adapters";

export const CONNECTION_DIAGNOSIS_CODE = {
  CONNECTED: "connected",
  NETWORK: "network",
  AUTH: "auth",
  BUCKET: "bucket",
  PUBLIC_READ: "public-read",
  CORS: "cors",
  VIDEO_SEEKING: "video-seeking",
} as const;

export type ConnectionDiagnosisCode =
  (typeof CONNECTION_DIAGNOSIS_CODE)[keyof typeof CONNECTION_DIAGNOSIS_CODE];

export interface ConnectionDiagnosis {
  readonly code: ConnectionDiagnosisCode;
  readonly message: string;
  readonly remediation?: string;
}

export interface BrowserProbeOutcome {
  readonly ok: boolean;
  readonly error?: string;
  readonly httpStatus?: number;
}

export interface ConnectionDiagnosisInput {
  readonly provider: ProviderId;
  readonly nodeGet: PublicReadCheck;
  readonly browserGet?: BrowserProbeOutcome;
  readonly browserRange?: BrowserProbeOutcome;
}

const CORS_REMEDIATION: Record<ProviderId, string> = {
  // Spike B: Supabase Storage delegates hosted CORS to its gateway; documentation
  // cannot prove a universal configuration, so re-test from the real site origin.
  supabase:
    "Supabase: confirm the bucket is public, then test GET and Range from the target site origin. Hosted Storage CORS is gateway-managed; configure the project gateway or contact Supabase support if browser fetches remain blocked.",
  // Spike B: InsForge documents S3 compatibility but no bucket CORS API.
  insforge:
    "InsForge: configure the S3-compatible bucket CORS policy to allow the target origin, GET, and the Range header, then re-run the browser probes.",
};

function diagnosis(
  code: ConnectionDiagnosisCode,
  message: string,
  remediation?: string,
): ConnectionDiagnosis {
  return remediation === undefined
    ? { code, message }
    : { code, message, remediation };
}

/**
 * D2 precedence: a failing Node probe is DNS/TLS/auth/bucket/public-read evidence,
 * never CORS. Only a passing Node probe lets browser outcomes diagnose CORS.
 */
export function diagnoseConnection(
  input: ConnectionDiagnosisInput,
): ConnectionDiagnosis {
  const { nodeGet } = input;
  if (!nodeGet.ok) {
    switch (nodeGet.code) {
      case "AUTH_FAILED":
        return diagnosis(
          CONNECTION_DIAGNOSIS_CODE.AUTH,
          "The provider rejected the saved credentials.",
          nodeGet.remediation,
        );
      case "BUCKET_NOT_FOUND":
        return diagnosis(
          CONNECTION_DIAGNOSIS_CODE.BUCKET,
          "The configured bucket was not found.",
          nodeGet.remediation,
        );
      case "BUCKET_NOT_PUBLIC":
        return diagnosis(
          CONNECTION_DIAGNOSIS_CODE.PUBLIC_READ,
          "The bucket is reachable but public reads are not allowed.",
          nodeGet.remediation,
        );
      case "NETWORK_ERROR":
        return diagnosis(
          CONNECTION_DIAGNOSIS_CODE.NETWORK,
          "The Node probe could not reach the storage provider.",
          nodeGet.remediation,
        );
      default:
        // Even a provider incorrectly labelling a Node failure CORS_BLOCKED cannot
        // establish browser policy; retain a non-CORS reachability diagnosis.
        return diagnosis(
          CONNECTION_DIAGNOSIS_CODE.NETWORK,
          "The Node probe did not complete successfully.",
          nodeGet.remediation,
        );
    }
  }

  if (input.browserGet?.ok === false) {
    return diagnosis(
      CONNECTION_DIAGNOSIS_CODE.CORS,
      "Node can read the public object, but the browser rejected the cross-origin GET.",
      CORS_REMEDIATION[input.provider],
    );
  }
  if (input.browserRange?.ok === false) {
    return diagnosis(
      CONNECTION_DIAGNOSIS_CODE.VIDEO_SEEKING,
      "The browser GET succeeded, but the ranged media request failed; video seeking will not work.",
      CORS_REMEDIATION[input.provider],
    );
  }
  return diagnosis(
    CONNECTION_DIAGNOSIS_CODE.CONNECTED,
    "Node and completed browser probes can read the configured public storage.",
  );
}
