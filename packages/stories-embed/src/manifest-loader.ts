import { MANIFEST_VERSION, manifestSchemaV1 } from "@stories/manifest-schema";

import { filterActiveStories, type ManifestModel } from "./manifest-model.js";

export interface ManifestFetchResponse {
  readonly ok: boolean;
  text(): Promise<string>;
}

export type ManifestFetcher = (url: string) => Promise<ManifestFetchResponse>;

export type ManifestWarning = (message: string) => void;

export interface ManifestLoaderOptions {
  readonly fetcher: ManifestFetcher;
  readonly now?: Date;
  readonly warn: ManifestWarning;
}

/** Fetches only through the injected seam, then validates before producing a model. */
export async function loadManifest(
  url: string,
  options: ManifestLoaderOptions,
): Promise<ManifestModel> {
  const { warn } = options;
  let response: ManifestFetchResponse;
  try {
    response = await options.fetcher(url);
  } catch {
    return warnAndReturnEmpty(warn, "Unable to fetch stories manifest.");
  }

  if (!response.ok) {
    return warnAndReturnEmpty(
      warn,
      "Stories manifest request was unsuccessful.",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    return warnAndReturnEmpty(
      warn,
      "Stories manifest contained malformed JSON.",
    );
  }

  const version = inspectManifestVersion(payload);
  if (version.value !== MANIFEST_VERSION) {
    return warnAndReturnEmpty(
      warn,
      `Ignoring unsupported stories manifest version: ${version.display}.`,
    );
  }

  const parsed = manifestSchemaV1.safeParse(payload);
  if (!parsed.success) {
    return warnAndReturnEmpty(
      warn,
      "Stories manifest failed schema validation.",
    );
  }

  return filterActiveStories(parsed.data, options.now ?? new Date());
}

interface ObservedManifestVersion {
  readonly display: string;
  readonly value: number | undefined;
}

function inspectManifestVersion(payload: unknown): ObservedManifestVersion {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("version" in payload)
  ) {
    return { display: "missing", value: undefined };
  }
  const version = payload.version;
  return typeof version === "number"
    ? { display: String(version), value: version }
    : { display: "invalid", value: undefined };
}

function warnAndReturnEmpty(
  warn: ManifestWarning,
  message: string,
): ManifestModel {
  warn(message);
  return { projectId: "", generatedAt: "", stories: [] };
}
