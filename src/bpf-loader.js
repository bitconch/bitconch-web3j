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
export class BpfLoader {
  /**
   * 标识BVM加载器的公钥
   */
  static get programId(): PublicKey {
    return new PublicKey(
      '0x8000000000000000000000000000000000000000000000000000000000000000',
    );
  }

  /**
   * 加载BVM程序
   *
   * @param connection 要使用的连接
   * @param owner 用于加载程序的用户帐户
   * @param elfBytes 包含BPF程序的整个ELF
   */
  static async load(
    connection: Connection,
    owner: Account,
    elf: Array<number>,
  ): Promise<PublicKey> {
    const programAccount = new Account();

    const transaction = SystemProgram.createAccount(
      owner.publicKey,
      programAccount.publicKey,
      1 + Math.ceil(elf.length / Loader.chunkSize) + 1,
      elf.length,
      BpfLoader.programId,
    );
    await sendAndConfirmTransaction(connection, transaction, owner);

    const loader = new Loader(connection, BpfLoader.programId);
    await loader.load(programAccount, elf);
    await loader.finalize(programAccount);

    return programAccount.publicKey;
  }
}
