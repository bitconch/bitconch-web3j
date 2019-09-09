// @flow

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {ControllerLoader} from './controller-loader';
import type {Connection} from './connection';

/**
 * Factory class for transactions to interact with a controller loader
 */
export class BpfControllerLoader {
  /**
   * Public key that identifies the BpfControllerLoader
   */
  static get controllerId(): PubKey {
    return new PubKey('BPFLoader1111111111111111111111111111111111');
  }

  /**
   * Load a BPF controller
   *
   * @param connection The connection to use
   * @param owner User account to load the controller into
   * @param elfBytes The entire ELF containing the BPF controller
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
