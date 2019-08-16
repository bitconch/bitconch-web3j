// @flow

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {ControllerLoader} from './controller-loader';
import type {Connection} from './connection';

/**
 * Factory class for transactions to interact with a program loader
 */
export class BpfControllerLoader {
  /**
   * Public key that identifies the BpfControllerLoader
   */
  static get controllerId(): PubKey {
    return new PubKey('BPFLoader1111111111111111111111111111111111');
  }

  /**
   * Load a BPF program
   *
   * @param connection The connection to use
   * @param owner User account to load the program into
   * @param elfBytes The entire ELF containing the BPF program
   */
  static load(
    connection: Connection,
    payer: BusAccount,
    elf: Array<number>,
  ): Promise<PubKey> {
    const program = new BusAccount();
    return ControllerLoader.load(connection, payer, program, BpfControllerLoader.controllerId, elf);
  }
}
