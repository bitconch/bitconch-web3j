// @flow
import nacl from 'tweetnacl';
import type {KeyPair} from 'tweetnacl';

import {PublicKey} from './publickey';

/**
 * 帐户密钥对（公钥和密钥）。
 */
export class Account {
  _keypair: KeyPair;

  /**
   * 创建一个新的Account对象
   *
   * 如果未提供secretKey参数，
   *  为该帐户随机创建一个新密钥对
   *
   *
   * @param secretKey 帐户的密钥
   */
  constructor(secretKey: ?Buffer = null) {
    if (secretKey) {
      this._keypair = nacl.sign.keyPair.fromSecretKey(secretKey);
    } else {
      this._keypair = nacl.sign.keyPair();
    }
  }

  /**
   * 此帐户的公钥
   */
  get publicKey(): PublicKey {
    return new PublicKey(this._keypair.publicKey);
  }

  /**
   * 此帐户的**未加密**密钥
   */
  get secretKey(): Buffer {
    return this._keypair.secretKey;
  }
}
