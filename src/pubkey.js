// @flow

import BN from 'bn.js';
import bs58 from 'bs58';

/**
 * A public key
 */
export class PubKey {
  _bn: BN;

  /**
   * Create a new PubKey object
   */
  constructor(value: number | string | Buffer | Array<number>) {
    if (typeof value === 'string') {
      // hexadecimal number
      if (value.startsWith('0x')) {
        this._bn = new BN(value.substring(2), 16);
      } else {
        // assume base 58 encoding by default
        this._bn = new BN(bs58.decode(value));
      }
    } else {
      this._bn = new BN(value);
    }

    if (this._bn.byteLength() > 32) {
      throw new Error(`Invalid public key input`);
    }
  }

  /**
   * Checks if the provided object is a PubKey
   */
  static isPubKey(o: Object): boolean {
    return o instanceof PubKey;
  }

  /**
   * Checks if two publicKeys are equal
   */
  equals(pubKey: PubKey): boolean {
    return this._bn.eq(pubKey._bn);
  }

  /**
   * Return the base-58 representation of the public key
   */
  toBase58(): string {
    return bs58.encode(this.toBuffer());
  }

  /**
   * Return the Buffer representation of the public key
   */
  toBuffer(): Buffer {
    const b = this._bn.toArrayLike(Buffer);
    if (b.length === 32) {
      return b;
    }

    const zeroPad = Buffer.alloc(32);
    b.copy(zeroPad, 32 - b.length);
    return zeroPad;
  }

  /**
   * Returns a string representation of the public key
   */
  toString(): string {
    return this.toBase58();
  }
}
