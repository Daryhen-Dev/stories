export { AdapterError } from "./errors.js";
export type { AdapterErrorCode } from "./errors.js";
export { createFakeStorageAdapter } from "./fake-adapter.js";
export type {
  FakeStorageAdapter,
  FakeStorageAdapterOptions,
  StoredObjectMetadata,
} from "./fake-adapter.js";
export { runStorageAdapterContractSuite } from "./contract-suite.js";
export type {
  ContractSuiteCase,
  ContractSuiteReport,
  ContractSuiteVariants,
} from "./contract-suite.js";
export type {
  AdapterConfig,
  ObjectExpectation,
  ProviderId,
  PublicReadCheck,
  StorageAdapter,
  UploadInput,
  VerifyResult,
} from "./types.js";
