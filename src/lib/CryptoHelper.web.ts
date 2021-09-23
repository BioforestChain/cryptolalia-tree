import {
  CryptoHelper as AbstractCryptoHelper,
  HashBuilder as AbstractHashBuilder,
} from "../core/CryptoHelper";

export class CryptoHelper extends AbstractCryptoHelper {
  async sha256Binary(binary: Uint8Array) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", binary));
  }
  sha256HashBuilder(): HashBuilder {
    return new HashBuilder();
  }
}

class HashBuilder extends AbstractHashBuilder {
  private chunks: Uint8Array[] = [];

  private len = 0;
  update(binary: Uint8Array): this {
    this.chunks.push(binary);
    this.len += binary.length;
    return this;
  }
  async digest(): Promise<Uint8Array> {
    const binary = new Uint8Array(this.len);
    let offset = 0;
    for (const chunk of this.chunks) {
      binary.set(chunk, offset);
      offset += chunk.length;
    }
    return new Uint8Array(await crypto.subtle.digest("SHA-256", binary));
  }
}
