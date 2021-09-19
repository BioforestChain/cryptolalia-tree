import {
  CryptoHelper as AbstractCryptoHelper,
  HashBuilder as AbstractHashBuilder,
} from "../core/CryptoHelper";
// import { AnyBlob } from "../core/Storage";
import crypto from "node:crypto";

export class CryptoHelper extends AbstractCryptoHelper {
  // async sha256Blob(blob: AnyBlob): Promise<Uint8Array> {
  //   return crypto
  //     .createHash("sha256")
  //     .update(new Uint8Array(await blob.arrayBuffer()))
  //     .digest();
  // }
  async sha256Binary(binary: Uint8Array) {
    return crypto.createHash("sha256").update(binary).digest();
  }
  sha256HashBuilder(): HashBuilder {
    return new HashBuilder(crypto.createHash("sha256"));
  }
}

class HashBuilder extends AbstractHashBuilder {
  constructor(private hash: crypto.Hash) {
    super();
  }

  update(binary: Uint8Array): this {
    this.hash.update(binary);
    return this;
  }
  async digest(): Promise<Uint8Array> {
    return this.hash.digest();
  }
}
