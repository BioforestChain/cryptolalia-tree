import { Injectable } from "@bfchain/util-dep-inject";
// import { AnyBlob } from "./Storage";

@Injectable()
export abstract class CryptoHelper {
  // abstract sha256Blob(blob: AnyBlob): Promise<Uint8Array>;
  abstract sha256Binary(blob: Uint8Array): Promise<Uint8Array>;
  abstract sha256HashBuilder(): HashBuilder;
}
export abstract class HashBuilder {
  abstract update(binary: Uint8Array): this;
  abstract digest(): Promise<Uint8Array>;
}
