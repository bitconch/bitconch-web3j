/**
 * @flow
 */

import assert from 'assert';
import BN from 'bn.js';
import * as BufferLayout from 'buffer-layout';

import * as Layout from './layout';
import {Account} from './account';
import {PublicKey} from './publickey';
import {SystemProgram} from './system-program';
import {Transaction, TransactionInstruction} from './transaction';
import type {TransactionSignature} from './transaction';
import {sendAndConfirmTransaction} from './util/send-and-confirm-transaction';
import type {Connection} from './connection';

/**
 * 一些代币
 */
export class TokenAmount extends BN {
  /**
   * 转换为缓冲区表示
   */
  toBuffer(): Buffer {
    const a = super.toArray().reverse();
    const b = Buffer.from(a);
    if (b.length === 8) {
      return b;
    }
    assert(b.length < 8, 'TokenAmount too large');

    const zeroPad = Buffer.alloc(8);
    b.copy(zeroPad);
    return zeroPad;
  }

  /**
   * 从Buffer表示构造TokenAmount
   */
  static fromBuffer(buffer: Buffer): TokenAmount {
    assert(buffer.length === 8, `Invalid buffer length: ${buffer.length}`);
    return new BN(
      [...buffer]
        .reverse()
        .map(i => `00${i.toString(16)}`.slice(-2))
        .join(''),
      16,
    );
  }
}

/**
 * 有关代币的信息
 */
type TokenInfo = {|
  /**
   * 代币总供应量
   */
  supply: TokenAmount,

  /**
   * 小数点右侧的基数10位数
   */
  decimals: number,

  /**
   * 此代币的描述性名称
   */
  name: string,

  /**
   * 代币的代号
   */
  symbol: string,
|};

/**
 * @private
 */
const TokenInfoLayout = BufferLayout.struct([
  Layout.uint64('supply'),
  BufferLayout.u8('decimals'),
  Layout.rustString('name'),
  Layout.rustString('symbol'),
]);

/**
 * 有关代币帐户的信息
 */
type TokenAccountInfo = {|
  /**
   * 此帐户拥有的代币种类
   */
  token: PublicKey,

  /**
   * 此帐户的所有者
   */
  owner: PublicKey,

  /**
   * 此帐户持有的代币金额
   */
  amount: TokenAmount,

  /**
   * 代币的源帐户。
   *
   * 如果`source`为null，则源为此帐户。如果`source`不为null，
   * 则此帐户中的“amount”标记表示可以从源帐户转移的代币余额
   */
  source: null | PublicKey,

  /**
   * 此委托帐户被授权使用的原始代币数量如果`source`为null，则originalAmount为零
   */
  originalAmount: TokenAmount,
|};

/**
 * @private
 */
const TokenAccountInfoLayout = BufferLayout.struct([
  Layout.publicKey('token'),
  Layout.publicKey('owner'),
  Layout.uint64('amount'),
  BufferLayout.u8('sourceOption'),
  Layout.publicKey('source'),
  Layout.uint64('originalAmount'),
]);

// 存在此类型以解决esdoc解析错误
type TokenAndPublicKey = [Token, PublicKey];

/**
 * 内置代币程序
 */
export const SYSTEM_TOKEN_PROGRAM_ID = new PublicKey(
  '0x8300000000000000000000000000000000000000000000000000000000000000',
);

/**
 * 类似ERC20的令牌
 */
export class Token {
  /**
   * @private
   */
  connection: Connection;

  /**
   * 标识此代币的公钥
   */
  token: PublicKey;

  /**
   * 代币程序的程序标识符
   */
  programId: PublicKey;

  /**
   * 创建附加到特定代币的代币对象
   *
   * @param connection 要使用的连接
   * @param token 代币的公钥
   * @param programId 可选代币programId，默认使用系统programId
   */
  constructor(
    connection: Connection,
    token: PublicKey,
    programId: PublicKey = SYSTEM_TOKEN_PROGRAM_ID,
  ) {
    Object.assign(this, {connection, token, programId});
  }

  /**
   * 创建一个新的代币
   *
   * @param connection 要使用的连接
   * @param owner 拥有返回的令牌帐户的用户帐户
   * @param supply 新令牌的总供应量
   * @param name 此令牌的描述性名称
   * @param symbol 此令牌的符号
   * @param decimals 小数位的位置
   * @param programId 可选令牌programId默认使用系统programId
   * @return 新签名令牌的令牌对象，令牌帐户的公钥持有新令牌的总供应量
   */
  static async createNewToken(
    connection: Connection,
    owner: Account,
    supply: TokenAmount,
    name: string,
    symbol: string,
    decimals: number,
    programId: PublicKey = SYSTEM_TOKEN_PROGRAM_ID,
  ): Promise<TokenAndPublicKey> {
    const tokenAccount = new Account();
    const token = new Token(connection, tokenAccount.publicKey, programId);
    const initialAccountPublicKey = await token.newAccount(owner, null);

    let transaction;

    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.uint64('supply'),
      BufferLayout.u8('decimals'),
      Layout.rustString('name'),
      Layout.rustString('symbol'),
    ]);

    let data = Buffer.alloc(1024);
    {
      const encodeLength = dataLayout.encode(
        {
          instruction: 0,
          supply: supply.toBuffer(),
          decimals,
          name,
          symbol,
        },
        data,
      );
      data = data.slice(0, encodeLength);
    }

    // 为tokenAccount帐户分配内存
    transaction = SystemProgram.createAccount(
      owner.publicKey,
      tokenAccount.publicKey,
      1,
      1 + data.length,
      programId,
    );
    await sendAndConfirmTransaction(connection, transaction, owner);

    transaction = new Transaction().add({
      keys: [tokenAccount.publicKey, initialAccountPublicKey],
      programId,
      data,
    });
    transaction.fee = 0;
    await sendAndConfirmTransaction(connection, transaction, tokenAccount);

    return [token, initialAccountPublicKey];
  }

  /**
   * 创建一个新的空令牌帐户。
   *
   * 然后该帐户可以用作`transfer（）`或`approve（）`。
   *
   * @param owner 拥有新令牌帐户的用户帐户
   * @param source 如果不为null，则创建一个委托帐户，授权后可以从此`source`帐户转移令牌
   * @return 新空令牌帐户的公钥
   */
  async newAccount(
    owner: Account,
    source: null | PublicKey = null,
  ): Promise<PublicKey> {
    const tokenAccount = new Account();
    let transaction;

    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 1,
      },
      data,
    );

    // 为令牌分配内存
    transaction = SystemProgram.createAccount(
      owner.publicKey,
      tokenAccount.publicKey,
      1,
      1 + TokenAccountInfoLayout.span,
      this.programId,
    );
    await sendAndConfirmTransaction(this.connection, transaction, owner);

    //
    const keys = [tokenAccount.publicKey, owner.publicKey, this.token];
    if (source) {
      keys.push(source);
    }
    transaction = new Transaction().add({
      keys,
      programId: this.programId,
      data,
    });
    transaction.fee = 0; // TODO: Batch with the `SystemProgram.createAccount` and remove this line
    await sendAndConfirmTransaction(this.connection, transaction, tokenAccount);

    return tokenAccount.publicKey;
  }

  /**
   * 检索令牌信息
   */
  async tokenInfo(): Promise<TokenInfo> {
    const accountInfo = await this.connection.getAccountInfo(this.token);
    if (!accountInfo.owner.equals(this.programId)) {
      throw new Error(
        `Invalid token owner: ${JSON.stringify(accountInfo.owner)}`,
      );
    }

    const data = Buffer.from(accountInfo.data);

    if (data.readUInt8(0) !== 1) {
      throw new Error(`Invalid token data`);
    }
    const tokenInfo = TokenInfoLayout.decode(data, 1);
    tokenInfo.supply = TokenAmount.fromBuffer(tokenInfo.supply);
    return tokenInfo;
  }

  /**
   * 检索帐户信息
   *
   * @param account 令牌帐户的公钥
   */
  async accountInfo(account: PublicKey): Promise<TokenAccountInfo> {
    const accountInfo = await this.connection.getAccountInfo(account);
    if (!accountInfo.owner.equals(this.programId)) {
      throw new Error(`Invalid token account owner`);
    }

    const data = Buffer.from(accountInfo.data);
    if (data.readUInt8(0) !== 2) {
      throw new Error(`Invalid token account data`);
    }
    const tokenAccountInfo = TokenAccountInfoLayout.decode(data, 1);

    tokenAccountInfo.token = new PublicKey(tokenAccountInfo.token);
    tokenAccountInfo.owner = new PublicKey(tokenAccountInfo.owner);
    tokenAccountInfo.amount = TokenAmount.fromBuffer(tokenAccountInfo.amount);
    if (tokenAccountInfo.sourceOption === 0) {
      tokenAccountInfo.source = null;
      tokenAccountInfo.originalAmount = new TokenAmount();
    } else {
      tokenAccountInfo.source = new PublicKey(tokenAccountInfo.source);
      tokenAccountInfo.originalAmount = TokenAmount.fromBuffer(
        tokenAccountInfo.originalAmount,
      );
    }

    if (!tokenAccountInfo.token.equals(this.token)) {
      throw new Error(
        `Invalid token account token: ${JSON.stringify(
          tokenAccountInfo.token,
        )} !== ${JSON.stringify(this.token)}`,
      );
    }
    return tokenAccountInfo;
  }

  /**
   * 将令牌转移到另一个帐户
   *
   * @param owner 源令牌帐户的所有者
   * @param source 源令牌帐户
   * @param destination 目标令牌帐户
   * @param amount 要转移的令牌数量
   */
  async transfer(
    owner: Account,
    source: PublicKey,
    destination: PublicKey,
    amount: number | TokenAmount,
  ): Promise<?TransactionSignature> {
    return await sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(
        await this.transferInstruction(
          owner.publicKey,
          source,
          destination,
          amount,
        ),
      ),
      owner,
    );
  }

  /**
   * 授予第三方权限以从帐户转移指定数量的令牌
   *
   * @param owner 源令牌帐户的所有者
   * @param account 令牌帐户的公钥
   * @param delegate 令牌帐户被授权从源帐户执行转移令牌
   * @param amount 代表可以转移的最大令牌数
   */
  async approve(
    owner: Account,
    account: PublicKey,
    delegate: PublicKey,
    amount: number | TokenAmount,
  ): Promise<void> {
    await sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(
        this.approveInstruction(owner.publicKey, account, delegate, amount),
      ),
      owner,
    );
  }

  /**
   * 取消转让任何剩余令牌的批准
   *
   * @param owner 源令牌帐户的所有者
   * @param account 令牌帐户的公钥
   * @param delegate 令牌帐户撤销授权
   */
  revoke(
    owner: Account,
    account: PublicKey,
    delegate: PublicKey,
  ): Promise<void> {
    return this.approve(owner, account, delegate, 0);
  }

  /**
   * 将新所有者分配给该帐户
   *
   * @param owner 令牌帐户的所有者
   * @param account 令牌帐户的公钥
   * @param newOwner 令牌帐户的新所有者
   */
  async setOwner(
    owner: Account,
    account: PublicKey,
    newOwner: PublicKey,
  ): Promise<void> {
    await sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(
        this.setOwnerInstruction(owner.publicKey, account, newOwner),
      ),
      owner,
    );
  }

  /**
   * 构造转移指令
   *
   * @param owner 源令牌帐户的所有者
   * @param source 源令牌帐户
   * @param destination 目标令牌帐户
   * @param amount 要转移的令牌数量
   */
  async transferInstruction(
    owner: PublicKey,
    source: PublicKey,
    destination: PublicKey,
    amount: number | TokenAmount,
  ): Promise<TransactionInstruction> {
    const accountInfo = await this.accountInfo(source);
    if (!owner.equals(accountInfo.owner)) {
      throw new Error('Account owner mismatch');
    }

    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.uint64('amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2,
        amount: new TokenAmount(amount).toBuffer(),
      },
      data,
    );

    const keys = [owner, source, destination];
    if (accountInfo.source) {
      keys.push(accountInfo.source);
    }
    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * 构建一个Approve指令
   *
   * @param owner 源令牌帐户的所有者
   * @param account 令牌帐户的公钥
   * @param delegate 令牌帐户被授权从源帐户执行转移令牌
   * @param amount 代表可以转移的最大令牌数
   */
  approveInstruction(
    owner: PublicKey,
    account: PublicKey,
    delegate: PublicKey,
    amount: number | TokenAmount,
  ): TransactionInstruction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.uint64('amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 3,
        amount: new TokenAmount(amount).toBuffer(),
      },
      data,
    );

    return new TransactionInstruction({
      keys: [owner, account, delegate],
      programId: this.programId,
      data,
    });
  }

  /**
   * 构造一个Revoke指令
   *
   * @param owner 源令牌帐户的所有者
   * @param account 令牌帐户的公钥
   * @param delegate 令牌帐户被授权从源帐户执行转移令牌
   */
  revokeInstruction(
    owner: PublicKey,
    account: PublicKey,
    delegate: PublicKey,
  ): TransactionInstruction {
    return this.approveInstruction(owner, account, delegate, 0);
  }

  /**
   * 构造一个SetOwner指令
   *
   * @param owner 令牌帐户的所有者
   * @param account 令牌帐户的公钥
   * @param newOwner 令牌帐户的新所有者
   */
  setOwnerInstruction(
    owner: PublicKey,
    account: PublicKey,
    newOwner: PublicKey,
  ): TransactionInstruction {
    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 4,
      },
      data,
    );

    return new TransactionInstruction({
      keys: [owner, account, newOwner],
      programId: this.programId,
      data,
    });
  }
}
