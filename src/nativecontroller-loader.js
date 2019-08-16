// @flow

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {ControllerLoader} from './controller-loader';
import type {Connection} from './connection';

/**
 * Factory class for transactions to interact with a program loader
 */
export class NativeControllerLoader {
  /**
   * Public key that identifies the NativeControllerLoader
   */
  static get controllerId(): PubKey {
    return new PubKey('NativeLoader1111111111111111111111111111111');
  }

  /**
   * Loads a native program
   *
   * @param connection The connection to use
   * @param payer System account that pays to load the program
   * @param programName Name of the native program
   */
  static load(
    connection: Connection,
    payer: BusAccount,
    programName: string,
  ): Promise<PubKey> {
    const bytes = [...Buffer.from(programName)];
    const program = new BusAccount();
    return ControllerLoader.load(
      connection,
      payer,
      program,
      NativeControllerLoader.controllerId,
      bytes,
    );
  }
}
