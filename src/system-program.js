// @flow

import * as BufferLayout from 'buffer-layout';

import {Transaction} from './transaction';
import {PublicKey} from './publickey';
import * as Layout from './layout';

/**
 * 用于与System程序交互的交易的工厂类
 */
export class SystemProgram {
  /**
   * 标识系统程序的公钥
   */
  static get programId(): PublicKey {
    return new PublicKey(
      '0x000000000000000000000000000000000000000000000000000000000000000',
    );
  }

  /**
   * 生成创建新帐户的交易
   */
  static createAccount(
    from: PublicKey,
    newAccount: PublicKey,
    difs: number,
    space: number,
    programId: PublicKey,
  ): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      BufferLayout.ns64('difs'),
      BufferLayout.ns64('space'),
      Layout.publicKey('programId'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 0, // Create Account instruction
        difs,
        space,
        programId: programId.toBuffer(),
      },
      data,
    );

    return new Transaction().add({
      keys: [from, newAccount],
      programId: SystemProgram.programId,
      data,
    });
  }

  /**
   * 生成将Difs从一个帐户移动到另一个帐户的事务
   */
  static move(from: PublicKey, to: PublicKey, amount: number): Transaction {
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
      keys: [from, to],
      programId: SystemProgram.programId,
      data,
    });
  }

  /**
   * Generate a Transaction that assigns an account to a program
   */
  static assign(from: PublicKey, programId: PublicKey): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.publicKey('programId'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 1, // Assign instruction
        programId: programId.toBuffer(),
      },
      data,
    );

    return new Transaction().add({
      keys: [from],
      programId: SystemProgram.programId,
      data,
    });
  }
}
