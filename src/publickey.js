// @flow

import BN from 'bn.js';
import bs58 from 'bs58';

/**
 * 公钥
 */
export class PublicKey {
  _bn: BN;

  /**
   * 创建一个新的PublicKey对象
   */
  constructor(value: number | string | Buffer | Array<number>) {
    if (typeof value === 'string') {
      // 十六进制数
      if (value.startsWith('0x')) {
        this._bn = new BN(value.substring(2), 16);
      } else {
        // 默认情况下base 58编码
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
   * 检查提供的对象是否为PublicKey
   */
  static isPublicKey(o: Object): boolean {
    return o instanceof PublicKey;
  }

  /**
   * 检查两个publicKeys是否相等
   */
  equals(publicKey: PublicKey): boolean {
    return this._bn.eq(publicKey._bn);
  }

  /**
   * 返回公钥的base-58表示
   */
  toBase58(): string {
    return bs58.encode(this.toBuffer());
  }

  /**
   * 返回公钥的Buffer表示形式
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
   * 返回公钥的字符串表示形式
   */
  toString(): string {
    return this.toBase58();
  }
}
