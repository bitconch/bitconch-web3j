// @flow

import * as BufferLayout from 'buffer-layout';

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {NUM_TICKS_PER_SEC} from './timing';
import {Transaction, PACKET_DATA_SIZE} from './transaction-controller';
import {sendAndconfmTx} from './util/send-and-confm-tx';
import {sleep} from './util/sleep';
import type {Connection} from './connection';
import {SystemController} from './system-controller';

/**
 * Program loader interface
 */
export class ControllerLoader {
  /**
   * Amount of program data placed in each load Transaction
   */
  static get chunkSize(): number {
    // Keep program chunks under PACKET_DATA_SIZE, leaving enough room for the
    // rest of the Transaction fields
    //
    // TODO: replace 300 with a proper constant for the size of the other
    // Transaction fields
    return PACKET_DATA_SIZE - 300;
  }

  /**
   * Loads a generic program
   *
   * @param connection The connection to use
   * @param payer System account that pays to load the program
   * @param program BusAccount to load the program into
   * @param controllerId Public key that identifies the loader
   * @param data Program octets
   */
  static async load(
    connection: Connection,
    payer: BusAccount,
    program: BusAccount,
    controllerId: PubKey,
    data: Array<number>,
  ): Promise<PubKey> {
    {
      const transaction = SystemController.createNewAccount(
        payer.pubKey,
        program.pubKey,
        1,
        data.length,
        controllerId,
      );
      await sendAndconfmTx(connection, transaction, payer);
    }

    const dataLayout = BufferLayout.struct([
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

    const chunkSize = ControllerLoader.chunkSize;
    let offset = 0;
    let array = data;
    let transactions = [];
    while (array.length > 0) {
      const bytes = array.slice(0, chunkSize);
      const data = Buffer.alloc(chunkSize + 16);
      dataLayout.encode(
        {
          instruction: 0, // Load instruction
          offset,
          bytes,
        },
        data,
      );

      const transaction = new Transaction().add({
        keys: [{pubkey: program.pubKey, isSigner: true, isDebitable: true}],
        controllerId,
        data,
      });
      transactions.push(
        sendAndconfmTx(connection, transaction, payer, program),
      );

      // Delay ~1 tick between write transactions in an attempt to reduce AccountInUse errors
      // since all the write transactions modify the same program account
      await sleep(1000 / NUM_TICKS_PER_SEC);

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

    // Finalize the account loaded with program data for execution
    {
      const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

      const data = Buffer.alloc(dataLayout.span);
      dataLayout.encode(
        {
          instruction: 1, // Finalize instruction
        },
        data,
      );

      const transaction = new Transaction().add({
        keys: [{pubkey: program.pubKey, isSigner: true, isDebitable: true}],
        controllerId,
        data,
      });
      await sendAndconfmTx(connection, transaction, payer, program);
    }
    return program.pubKey;
  }
}
