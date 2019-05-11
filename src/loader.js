// @flow

import * as BufferLayout from 'buffer-layout';

import {Account} from './account';
import {PublicKey} from './publickey';
import {NUM_TICKS_PER_SECOND} from './timing';
import {Transaction} from './transaction';
import {sendAndConfirmTransaction} from './util/send-and-confirm-transaction';
import {sleep} from './util/sleep';
import type {Connection} from './connection';

/**
 * 程序加载器接口
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
   * 每个加载交易中放置的程序数据量
   */
  static get chunkSize(): number {
    return 256;
  }

  /**
   * @param connection 要使用的连接
   * @param programId 标识加载程序的公钥
   */
  constructor(connection: Connection, programId: PublicKey) {
    Object.assign(this, {connection, programId});
  }

  /**
   * 加载程序数据
   *
   * @param program 帐户加载程序信息
   * @param data 程序数据
   */
  async load(program: Account, data: Array<number>) {
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

    const chunkSize = Loader.chunkSize;
    let offset = 0;
    let array = data;
    let transactions = [];
    while (array.length > 0) {
      const bytes = array.slice(0, chunkSize);
      const data = Buffer.alloc(chunkSize + 16);
      dataLayout.encode(
        {
          instruction: 0, // 加载指令
          offset,
          bytes,
        },
        data,
      );

      const transaction = new Transaction().add({
        keys: [program.publicKey],
        programId: this.programId,
        data,
      });
      transactions.push(
        sendAndConfirmTransaction(this.connection, transaction, program),
      );

      // 写入事务之间的延迟〜1滴答以尝试减少AccountInUse错误，因为所有写入事务都修改了相同的程序帐户
      await sleep(1000 / NUM_TICKS_PER_SECOND);

      // 并行运行最多8个Loads，以防止过多的并行事务被AccountInUse拒绝。
      //
      // TODO：8经验选择，应该重新审视
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
   * 完成加载程序数据以执行的帐户
   *
   * @param program `load()`ed Account
   */
  async finalize(program: Account) {
    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 1, // 完成指令
      },
      data,
    );

    const transaction = new Transaction().add({
      keys: [program.publicKey],
      programId: this.programId,
      data,
    });
    await sendAndConfirmTransaction(this.connection, transaction, program);
  }
}
