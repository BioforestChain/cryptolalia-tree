import { Injectable } from "@bfchain/util-dep-inject";
import { AnyBlob } from "./StorageAdaptor";

@Injectable()
export abstract class CryptoHelper {
  abstract sha256Blob(blob: AnyBlob): Promise<Uint8Array>;
  abstract sha256HashBuilder(): HashBuilder;
}
export abstract class HashBuilder {
  abstract update(binary: Uint8Array): this;
  abstract digest(): Promise<Uint8Array>;
}
