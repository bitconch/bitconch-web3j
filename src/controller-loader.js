// @flow

import * as BufferLayout from 'buffer-layout';

import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {NUM_TICKS_PER_SECOND} from './timing';
import {Transaction} from './transaction-controller';
import {sendAndConfmTxn} from './util/send-and-confm-tx';
import {sleep} from './util/sleep';
import type {Connection} from './connection';
import {SystemController} from './system-controller';

export class ControllerLoader {

  static get chunkSize(): number {
    return 229;
  }

 
  static async load(
    connection: Connection,
    payer: BusAccount,
    controller: BusAccount,
    controllerId: PubKey,
    data: Array<number>,
  ): Promise<PubKey> {
    {
      const transaction = SystemController.createNewAccount(
        payer.pubKey,
        controller.pubKey,
        1,
        data.length,
        controllerId,
      );
      await sendAndConfmTxn(connection, transaction, payer);
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
          instruction: 0, 
          offset,
          bytes,
        },
        data,
      );

      const transaction = new Transaction().add({
        keys: [{pubkey: controller.pubKey, isSigner: true}],
        controllerId,
        data,
      });
      transactions.push(
        sendAndConfmTxn(connection, transaction, payer, controller),
      );

      await sleep(1000 / NUM_TICKS_PER_SECOND);

      if (transactions.length === 8) {
        await Promise.all(transactions);
        transactions = [];
      }

      offset += chunkSize;
      array = array.slice(chunkSize);
    }
    await Promise.all(transactions);

    {
      const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

      const data = Buffer.alloc(dataLayout.span);
      dataLayout.encode(
        {
          instruction: 1, 
        },
        data,
      );

      const transaction = new Transaction().add({
        keys: [{pubkey: controller.pubKey, isSigner: true}],
        controllerId,
        data,
      });
      await sendAndConfmTxn(connection, transaction, payer, controller);
    }
    return controller.pubKey;
  }
}
