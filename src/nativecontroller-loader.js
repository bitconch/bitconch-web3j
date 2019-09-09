// @flow

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {ControllerLoader} from './controller-loader';
import type {Connection} from './connection';

/**
 * Factory class for transactions to interact with a controller loader
 */
export class NativeControllerLoader {
  /**
   * Public key that identifies the NativeControllerLoader
   */
  static get controllerId(): PubKey {
    return new PubKey('NativeLoader1111111111111111111111111111111');
  }

  /**
   * Loads a native controller
   *
   * @param connection The connection to use
   * @param payer System account that pays to load the controller
   * @param controllerName Name of the native controller
   */
  static load(
    connection: Connection,
    payer: BusAccount,
    controllerName: string,
  ): Promise<PubKey> {
    const bytes = [...Buffer.from(controllerName)];
    const controller = new BusAccount();
    return ControllerLoader.load(
      connection,
      payer,
      controller,
      NativeControllerLoader.controllerId,
      bytes,
    );
  }
}
