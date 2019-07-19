// @flow

import BN from 'bn.js';
import bs58 from 'bs58';

export class PubKey {
  _bn: BN;

  constructor(value: number | string | Buffer | Array<number>) {
    if (typeof value === 'string') {
      if (value.startsWith('0x')) {
        this._bn = new BN(value.substring(2), 16);
      } else {
        this._bn = new BN(bs58.decode(value));
      }
    } else {
      this._bn = new BN(value);
    }

    if (this._bn.byteLength() > 32) {
      throw new Error(`Invalid public key input`);
    }
  }

  static isPubKey(o: Object): boolean {
    return o instanceof PubKey;
  }

  equals(pubKey: PubKey): boolean {
    return this._bn.eq(pubKey._bn);
  }


  toBase58(): string {
    return bs58.encode(this.toBuffer());
  }

  toBuffer(): Buffer {
    const b = this._bn.toArrayLike(Buffer);
    if (b.length === 32) {
      return b;
    }

    const zeroPad = Buffer.alloc(32);
    b.copy(zeroPad, 32 - b.length);
    return zeroPad;
  }

  toString(): string {
    return this.toBase58();
  }
}
