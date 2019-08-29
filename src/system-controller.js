// @flow

import * as BufferLayout from 'buffer-layout';

import {Transaction} from './transaction-controller';
import {PubKey} from './pubkey';
import * as Layout from './resize';

/**
 * Factory class for transactions to interact with the System program
 */
export class SystemController {
  /**
   * Public key that identifies the System program
   */
  static get controllerId(): PubKey {
    return new PubKey(
      '0x000000000000000000000000000000000000000000000000000000000000000',
    );
  }

  /**
   * Generate a Transaction that creates a new account
   */
  static createNewAccount(
    from: PubKey,
    createNewAccount: PubKey,
    difs: number,
    space: number,
    controllerId: PubKey,
  ): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      BufferLayout.ns64('difs'),
      BufferLayout.ns64('space'),
      Layout.pubKey('controllerId'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 0, // Create BusAccount instruction
        difs,
        space,
        controllerId: controllerId.toBuffer(),
      },
      data,
    );

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true, isDebitable: true},
        {pubkey: createNewAccount, isSigner: false, isDebitable: true},
      ],
      controllerId: SystemController.controllerId,
      data,
    });
  }

  /**
   * Generate a Transaction that transfers difs from one account to another
   */
  static transfer(from: PubKey, to: PubKey, amount: number): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      BufferLayout.ns64('amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2, // Move instruction
        amount,
      },
      data,
    );

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true, isDebitable: true},
        {pubkey: to, isSigner: false, isDebitable: false},
      ],
      controllerId: SystemController.controllerId,
      data,
    });
  }

  /**
   * Generate a Transaction that assigns an account to a program
   */
  static assign(from: PubKey, controllerId: PubKey): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.pubKey('controllerId'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 1, // Assign instruction
        controllerId: controllerId.toBuffer(),
      },
      data,
    );

    return new Transaction().add({
      keys: [{pubkey: from, isSigner: true, isDebitable: true}],
      controllerId: SystemController.controllerId,
      data,
    });
  }
}
