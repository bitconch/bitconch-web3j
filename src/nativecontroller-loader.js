// @flow

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {ControllerLoader} from './controller-loader';
import type {Connection} from './connection';

export class NativeControllerLoader {
  static get controllerId(): PubKey {
    return new PubKey('NativeControllerLoader1111111111111111111111111111111');
  }

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
