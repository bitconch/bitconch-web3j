// @flow

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {ControllerLoader} from './controller-loader';
import type {Connection} from './connection';

/**
 * 
 */
export class BpfControllerLoader {
  /**
   * 
   */
  static get controllerId(): PubKey {
    return new PubKey('BPFControllerLoader1111111111111111111111111111111111');
  }

  /**
   * 
   *
   * @param connection 
   * @param owner 
   * @param elfBytes 
   */
  static load(
    connection: Connection,
    payer: BusAccount,
    elf: Array<number>,
  ): Promise<PubKey> {
    const controller = new BusAccount();
    return ControllerLoader.load(connection, payer, controller, BpfControllerLoader.controllerId, elf);
  }
}
