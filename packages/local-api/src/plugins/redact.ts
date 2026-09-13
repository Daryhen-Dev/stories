const REDACTED_VALUE = "[REDACTED]";
const CREDENTIAL_KEY = /(credential|secret|token|api.?key|service.?role)/i;

export type RedactedPayload =
  string | number | boolean | null | RedactedPayload[] | RedactedRecord;

export interface RedactedRecord {
  readonly [key: string]: RedactedPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

/** D8 defense-in-depth redaction for every Fastify serialized payload. */
export function redactDeep(value: unknown): RedactedPayload {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        CREDENTIAL_KEY.test(key) ? REDACTED_VALUE : redactDeep(nestedValue),
      ]),
    );
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return REDACTED_VALUE;
}

export const REDACTION = {
  credentialKey: CREDENTIAL_KEY,
  value: REDACTED_VALUE,
} as const;
