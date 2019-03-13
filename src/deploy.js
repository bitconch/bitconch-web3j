// @flow

import * as BufferLayout from 'buffer-layout';

import {Account} from './account';
import {PublicKey} from './publickey';
import {Transaction} from './transaction';
import {sendAndConfirmTransaction} from './user-transaction';
import type {Connection} from './connection';

/**
 * Program loader interface
 */
export class Loader {
  /**
   * @private
   */
  connection: Connection;

  /**
   * @private
   */
  programId: PublicKey;

  /**
   * Amount of program data placed in each load Transaction
   */
  static get chunkSize(): number {
    return 256;
  }

  /**
   * @param connection The connection to use
   * @param programId Public key that identifies the loader
   */
  constructor(connection: Connection, programId: PublicKey) {
    Object.assign(this, {connection, programId});
  }

  /**
   * Load program data
   *
   * @param program Account to load the program info
   * @param data Program data
   */
  async load(program: Account, data: Array<number>) {
    const userdataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      BufferLayout.u32('offset'),
      BufferLayout.u32('bytesLength'),
      BufferLayout.u32('bytesLengthPadding'),
      BufferLayout.seq(
        BufferLayout.u8('byte'),
        BufferLayout.offset(BufferLayout.u32(), -8),
        'bytes',
      ),
    ]);

    const chunkSize = Loader.chunkSize;
    let offset = 0;
    let array = data;
    let transactions = [];
    while (array.length > 0) {
      const bytes = array.slice(0, chunkSize);
      const userdata = Buffer.alloc(chunkSize + 16);
      userdataLayout.encode(
        {
          instruction: 0, // Load instruction
          offset,
          bytes,
        },
        userdata,
      );

      const transaction = new Transaction().add({
        keys: [program.publicKey],
        programId: this.programId,
        userdata,
      });
      transactions.push(
        sendAndConfirmTransaction(this.connection, transaction, program),
      );

      // Run up to 8 Loads in parallel to prevent too many parallel transactions from
      // getting rejected with AccountInUse.
      //
      // TODO: 8 was selected empirically and should probably be revisited
      if (transactions.length === 8) {
        await Promise.all(transactions);
        transactions = [];
      }

      offset += chunkSize;
      array = array.slice(chunkSize);
    }
    await Promise.all(transactions);
  }

  /**
   * Finalize an account loaded with program data for execution
   *
   * @param program `load()`ed Account
   */
  async finalize(program: Account) {
    const userdataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
    ]);

    const userdata = Buffer.alloc(userdataLayout.span);
    userdataLayout.encode(
      {
        instruction: 1, // Finalize instruction
      },
      userdata,
    );

    const transaction = new Transaction().add({
      keys: [program.publicKey],
      programId: this.programId,
      userdata,
    });
    await sendAndConfirmTransaction(this.connection, transaction, program);
  }
}
