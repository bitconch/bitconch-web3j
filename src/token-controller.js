/**
 * @flow
 */

import assert from 'assert';
import BN from 'bn.js';
import * as BufferLayout from 'buffer-layout';

import * as Layout from './typelayout';
import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {SystemController} from './system-controller';
import {Transaction, TxOperation} from './transaction-controller';
import type {TxnSignature} from './transaction-controller';
import {sendAndConfmTxn} from './util/send-and-confm-tx';
import type {Connection} from './connection';

export class TokenCount extends BN {
  toBuffer(): Buffer {
    const a = super.toArray().reverse();
    const b = Buffer.from(a);
    if (b.length === 8) {
      return b;
    }
    assert(b.length < 8, 'TokenCount too large');

    const zeroPad = Buffer.alloc(8);
    b.copy(zeroPad);
    return zeroPad;
  }


  static fromBuffer(buffer: Buffer): TokenCount {
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


type TokenDetail = {|

  supply: TokenCount,


  decimals: number,


  name: string,


  symbol: string,
|};

/**
 * @private
 */
const TokenDetailLayout = BufferLayout.struct([
  Layout.uint64('supply'),
  BufferLayout.u8('decimals'),
  Layout.rustString('name'),
  Layout.rustString('symbol'),
]);

type TokenAccountDetail = {|
  token: PubKey,

  owner: PubKey,

  amount: TokenCount,

  source: null | PubKey,

  originalAmount: TokenCount,
|};

/**
 * @private
 */
const TokenAccountDetailLayout = BufferLayout.struct([
  Layout.pubKey('token'),
  Layout.pubKey('owner'),
  Layout.uint64('amount'),
  BufferLayout.u8('sourceOption'),
  Layout.pubKey('source'),
  Layout.uint64('originalAmount'),
]);

type TokenAndPubKey = [Token, PubKey]; 

export const SYSTEM_TOKEN_CONTROLLER_ID = new PubKey(
  'Token11111111111111111111111111111111111111',
);

export class Token {
  /**
   * @private
   */
  connection: Connection;


  token: PubKey;

  controllerId: PubKey;

  constructor(
    connection: Connection,
    token: PubKey,
    controllerId: PubKey = SYSTEM_TOKEN_CONTROLLER_ID,
  ) {
    Object.assign(this, {connection, token, controllerId});
  }

  static async createNewToken(
    connection: Connection,
    owner: BusAccount,
    supply: TokenCount,
    name: string,
    symbol: string,
    decimals: number,
    controllerId: PubKey = SYSTEM_TOKEN_CONTROLLER_ID,
  ): Promise<TokenAndPubKey> {
    const tokenAccount = new BusAccount();
    const token = new Token(connection, tokenAccount.pubKey, controllerId);
    const initialAccountPubKey = await token.createNewAccount(owner, null);

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

    transaction = SystemController.createNewAccount(
      owner.pubKey,
      tokenAccount.pubKey,
      1,
      1 + data.length,
      controllerId,
    );
    await sendAndConfmTxn(connection, transaction, owner);

    transaction = new Transaction().add({
      keys: [
        {pubkey: tokenAccount.pubKey, isSigner: true},
        {pubkey: initialAccountPubKey, isSigner: false},
      ],
      controllerId,
      data,
    });
    await sendAndConfmTxn(
      connection,
      transaction,
      owner,
      tokenAccount,
    );

    return [token, initialAccountPubKey];
  }

  async createNewAccount(
    owner: BusAccount,
    source: null | PubKey = null,
  ): Promise<PubKey> {
    const tokenAccount = new BusAccount();
    let transaction;

    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 1, 
      },
      data,
    );

    transaction = SystemController.createNewAccount(
      owner.pubKey,
      tokenAccount.pubKey,
      1,
      1 + TokenAccountDetailLayout.span,
      this.controllerId,
    );
    await sendAndConfmTxn(this.connection, transaction, owner);

    const keys = [
      {pubkey: tokenAccount.pubKey, isSigner: true},
      {pubkey: owner.pubKey, isSigner: false},
      {pubkey: this.token, isSigner: false},
    ];
    if (source) {
      keys.push({pubkey: source, isSigner: false});
    }
    transaction = new Transaction().add({
      keys,
      controllerId: this.controllerId,
      data,
    });
    await sendAndConfmTxn(
      this.connection,
      transaction,
      owner,
      tokenAccount,
    );

    return tokenAccount.pubKey;
  }


  async fetchTokenDetail(): Promise<TokenDetail> {
    const accountDetail = await this.connection.fetchAccountDetail(this.token);
    if (!accountDetail.owner.equals(this.controllerId)) {
      throw new Error(
        `Invalid token owner: ${JSON.stringify(accountDetail.owner)}`,
      );
    }

    const data = Buffer.from(accountDetail.data);

    if (data.readUInt8(0) !== 1) {
      throw new Error(`Invalid token data`);
    }
    const tokenDetail = TokenDetailLayout.decode(data, 1);
    tokenDetail.supply = TokenCount.fromBuffer(tokenDetail.supply);
    return tokenDetail;
  }

  async fetchAccountDetail(account: PubKey): Promise<TokenAccountDetail> {
    const accountDetail = await this.connection.fetchAccountDetail(account);
    if (!accountDetail.owner.equals(this.controllerId)) {
      throw new Error(`Invalid token account owner`);
    }

    const data = Buffer.from(accountDetail.data);
    if (data.readUInt8(0) !== 2) {
      throw new Error(`Invalid token account data`);
    }
    const tokenAccountDetail = TokenAccountDetailLayout.decode(data, 1);

    tokenAccountDetail.token = new PubKey(tokenAccountDetail.token);
    tokenAccountDetail.owner = new PubKey(tokenAccountDetail.owner);
    tokenAccountDetail.amount = TokenCount.fromBuffer(tokenAccountDetail.amount);
    if (tokenAccountDetail.sourceOption === 0) {
      tokenAccountDetail.source = null;
      tokenAccountDetail.originalAmount = new TokenCount();
    } else {
      tokenAccountDetail.source = new PubKey(tokenAccountDetail.source);
      tokenAccountDetail.originalAmount = TokenCount.fromBuffer(
        tokenAccountDetail.originalAmount,
      );
    }

    if (!tokenAccountDetail.token.equals(this.token)) {
      throw new Error(
        `Invalid token account token: ${JSON.stringify(
          tokenAccountDetail.token,
        )} !== ${JSON.stringify(this.token)}`,
      );
    }
    return tokenAccountDetail;
  }

  async transfer(
    owner: BusAccount,
    source: PubKey,
    destination: PubKey,
    amount: number | TokenCount,
  ): Promise<?TxnSignature> {
    return await sendAndConfmTxn(
      this.connection,
      new Transaction().add(
        await this.transferOperation(
          owner.pubKey,
          source,
          destination,
          amount,
        ),
      ),
      owner,
    );
  }

  async approve(
    owner: BusAccount,
    account: PubKey,
    delegate: PubKey,
    amount: number | TokenCount,
  ): Promise<void> {
    await sendAndConfmTxn(
      this.connection,
      new Transaction().add(
        this.approveOperation(owner.pubKey, account, delegate, amount),
      ),
      owner,
    );
  }

  revoke(
    owner: BusAccount,
    account: PubKey,
    delegate: PubKey,
  ): Promise<void> {
    return this.approve(owner, account, delegate, 0);
  }

  async setOwner(
    owner: BusAccount,
    account: PubKey,
    newOwner: PubKey,
  ): Promise<void> {
    await sendAndConfmTxn(
      this.connection,
      new Transaction().add(
        this.setOwnerOperation(owner.pubKey, account, newOwner),
      ),
      owner,
    );
  }

  async transferOperation(
    owner: PubKey,
    source: PubKey,
    destination: PubKey,
    amount: number | TokenCount,
  ): Promise<TxOperation> {
    const accountInfo = await this.fetchAccountDetail(source);
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
        amount: new TokenCount(amount).toBuffer(),
      },
      data,
    );

    const keys = [
      {pubkey: owner, isSigner: true},
      {pubkey: source, isSigner: false},
      {pubkey: destination, isSigner: false},
    ];
    if (accountInfo.source) {
      keys.push({pubkey: accountInfo.source, isSigner: false});
    }
    return new TxOperation({
      keys,
      controllerId: this.controllerId,
      data,
    });
  }

  approveOperation(
    owner: PubKey,
    account: PubKey,
    delegate: PubKey,
    amount: number | TokenCount,
  ): TxOperation {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.uint64('amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 3,
        amount: new TokenCount(amount).toBuffer(),
      },
      data,
    );

    return new TxOperation({
      keys: [
        {pubkey: owner, isSigner: true},
        {pubkey: account, isSigner: false},
        {pubkey: delegate, isSigner: false},
      ],
      controllerId: this.controllerId,
      data,
    });
  }

  revokeOperation(
    owner: PubKey,
    account: PubKey,
    delegate: PubKey,
  ): TxOperation {
    return this.approveOperation(owner, account, delegate, 0);
  }

  setOwnerOperation(
    owner: PubKey,
    account: PubKey,
    newOwner: PubKey,
  ): TxOperation {
    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 4,
      },
      data,
    );

    return new TxOperation({
      keys: [
        {pubkey: owner, isSigner: true},
        {pubkey: account, isSigner: false},
        {pubkey: newOwner, isSigner: false},
      ],
      controllerId: this.controllerId,
      data,
    });
  }
}
