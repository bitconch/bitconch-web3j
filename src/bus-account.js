// @flow
import nacl from 'tweetnacl';
import type {KeyPair} from 'tweetnacl';

import {PubKey} from './pubkey';

/**
 * 
 */
export class BusAccount {
  _keypair: KeyPair;

  /**
   * 
   *
   * 
   * 
   *
   * @param secretKey 
   */
  constructor(secretKey: ?Buffer = null) {
    if (secretKey) {
      this._keypair = nacl.sign.keyPair.fromSecretKey(secretKey);
    } else {
      this._keypair = nacl.sign.keyPair();
    }
  }

  /**
   * 
   */
  get pubKey(): PubKey {
    return new PubKey(this._keypair.publicKey);
  }

  /**
   * 
   */
  get privateKey(): Buffer {
    return this._keypair.secretKey;
  }
}
