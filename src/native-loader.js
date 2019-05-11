// @flow

import {Account} from './account';
import {PublicKey} from './publickey';
import {Loader} from './loader';
import {SystemProgram} from './system-program';
import {sendAndConfirmTransaction} from './util/send-and-confirm-transaction';
import type {Connection} from './connection';

/**
 * 用于与程序加载器交互的事务的工厂类
 */
export class NativeLoader {
  /**
   * 标识NativeLoader的公钥
   */
  static get programId(): PublicKey {
    return new PublicKey(
      '0x100000000000000000000000000000000000000000000000000000000000000',
    );
  }

  /**
   * 加载本机程序
   *
   * @param connection 要使用的连接
   * @param owner 用于加载程序的用户帐户
   * @param programName 本机程序的名称
   */
  static async load(
    connection: Connection,
    owner: Account,
    programName: string,
  ): Promise<PublicKey> {
    const bytes = [...Buffer.from(programName)];

    const programAccount = new Account();

    // 为程序帐户分配内存
    const transaction = SystemProgram.createAccount(
      owner.publicKey,
      programAccount.publicKey,
      1 + 1 + 1,
      bytes.length + 1,
      NativeLoader.programId,
    );
    await sendAndConfirmTransaction(connection, transaction, owner);

    const loader = new Loader(connection, NativeLoader.programId);
    await loader.load(programAccount, bytes);
    await loader.finalize(programAccount);

    return programAccount.publicKey;
  }
}
