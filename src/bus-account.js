// @flow
import nacl from 'tweetnacl';
import type {KeyPair} from 'tweetnacl';

import {PubKey} from './pubkey';

/**
 * An account key pair (public and secret keys).
 */
export class BusAccount {
  _keypair: KeyPair;

  /**
   * Create a new BusAccount object
   *
   * If the privateKey parameter is not provided a new key pair is randomly
   * created for the account
   *
   * @param privateKey Secret key for the account
   */
  constructor(privateKey: ?Buffer = null) {
    if (privateKey) {
      this._keypair = nacl.sign.keyPair.fromSecretKey(privateKey);
    } else {
      this._keypair = nacl.sign.keyPair();
    }
  }

  /**
   * The public key for this account
   */
  get pubKey(): PubKey {
    return new PubKey(this._keypair.publicKey);
  }

  /**
   * The **unencrypted** secret key for this account
   */
  get privateKey(): Buffer {
    return this._keypair.secretKey;
  }
}
