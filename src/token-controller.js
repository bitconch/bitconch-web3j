/**
 * @flow
 */

import assert from 'assert';
import BN from 'bn.js';
import * as BufferLayout from 'buffer-layout';

import * as Layout from './resize';
import {BusAccount} from './bus-account';
import {PubKey} from './pubkey';
import {SystemController} from './system-controller';
import {Transaction, TxOperation} from './transaction-controller';
import type {TxSignature} from './transaction-controller';
import {sendAndconfmTx} from './util/send-and-confm-tx';
import type {Connection} from './connection';

/**
 * Some amount of tokens
 */
export class TokenCount extends BN {
  /**
   * Convert to Buffer representation
   */
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

  /**
   * Construct a TokenCount from Buffer representation
   */
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

/**
 * Information about a token
 */
type TokenDetail = {|
  /**
   * Total supply of tokens
   */
  supply: TokenCount,

  /**
   * Number of base 10 digits to the right of the decimal place
   */
  decimals: number,

  /**
   * Descriptive name of this token
   */
  name: string,

  /**
   * Symbol for this token
   */
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

/**
 * Information about a token account
 */
type TokenAccountDetail = {|
  /**
   * The kind of token this account holds
   */
  token: PubKey,

  /**
   * Owner of this account
   */
  owner: PubKey,

  /**
   * Amount of tokens this account holds
   */
  amount: TokenCount,

  /**
   * The source account for the tokens.
   *
   * If `source` is null, the source is this account.
   * If `source` is not null, the `amount` of tokens in this account represent
   * an allowance of tokens that may be transferred from the source account
   */
  source: null | PubKey,

  /**
   * New amount of tokens this delegate account was authorized to spend
   * If `source` is null, originalAmount is zero
   */
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

type TokenAndPubKey = [Token, PubKey]; // This type exists to workaround an esdoc parse error

/**
 * The built-in token program
 */
export const SYSTEM_TOKEN_CONTROLLER_ID = new PubKey(
  'Token11111111111111111111111111111111111111',
);

/**
 * An ERC20-like Token
 */
export class Token {
  /**
   * @private
   */
  connection: Connection;

  /**
   * The public key identifying this token
   */
  token: PubKey;

  /**
   * Program Identifier for the Token program
   */
  controllerId: PubKey;

  /**
   * Create a Token object attached to the specific token
   *
   * @param connection The connection to use
   * @param token Public key of the token
   * @param controllerId Optional token controllerId, uses the system controllerId by default
   */
  constructor(
    connection: Connection,
    token: PubKey,
    controllerId: PubKey = SYSTEM_TOKEN_CONTROLLER_ID,
  ) {
    Object.assign(this, {connection, token, controllerId});
  }

  /**
   * Create a new Token
   *
   * @param connection The connection to use
   * @param owner User account that will own the returned Token BusAccount
   * @param supply Total supply of the new token
   * @param name Descriptive name of this token
   * @param symbol Symbol for this token
   * @param decimals Location of the decimal place
   * @param controllerId Optional token controllerId, uses the system controllerId by default
   * @return Token object for the newly minted token, Public key of the Token BusAccount holding the total supply of new tokens
   */
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
    const initialAccountPublicKey = await token.createNewAccount(owner, null);

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
          instruction: 0, // NewToken instruction
          supply: supply.toBuffer(),
          decimals,
          name,
          symbol,
        },
        data,
      );
      data = data.slice(0, encodeLength);
    }

    // Allocate memory for the tokenAccount account
    transaction = SystemController.createNewAccount(
      owner.pubKey,
      tokenAccount.pubKey,
      1,
      1 + data.length,
      controllerId,
    );
    await sendAndconfmTx(connection, transaction, owner);

    transaction = new Transaction().add({
      keys: [
        {pubkey: tokenAccount.pubKey, isSigner: true, isDebitable: false},
        {pubkey: initialAccountPublicKey, isSigner: false, isDebitable: true},
      ],
      controllerId,
      data,
    });
    await sendAndconfmTx(
      connection,
      transaction,
      owner,
      tokenAccount,
    );

    return [token, initialAccountPublicKey];
  }

  /**
   * Create a new and empty token account.
   *
   * This account may then be used as a `transfer()` or `approve()` destination
   *
   * @param owner User account that will own the new token account
   * @param source If not null, create a delegate account that when authorized
   *               may transfer tokens from this `source` account
   * @return Public key of the new empty token account
   */
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
        instruction: 1, // NewTokenAccount instruction
      },
      data,
    );

    // Allocate memory for the token
    transaction = SystemController.createNewAccount(
      owner.pubKey,
      tokenAccount.pubKey,
      1,
      1 + TokenAccountDetailLayout.span,
      this.controllerId,
    );
    await sendAndconfmTx(this.connection, transaction, owner);

    // Initialize the token account
    const keys = [
      {pubkey: tokenAccount.pubKey, isSigner: true, isDebitable: true},
      {pubkey: owner.pubKey, isSigner: false, isDebitable: false},
      {pubkey: this.token, isSigner: false, isDebitable: false},
    ];
    if (source) {
      keys.push({pubkey: source, isSigner: false, isDebitable: false});
    }
    transaction = new Transaction().add({
      keys,
      controllerId: this.controllerId,
      data,
    });
    await sendAndconfmTx(
      this.connection,
      transaction,
      owner,
      tokenAccount,
    );

    return tokenAccount.pubKey;
  }

  /**
   * Retrieve token information
   */
  async fetchTokenDetail(): Promise<TokenDetail> {
    const fetchAccountDetail = await this.connection.fetchAccountDetail(this.token);
    if (!fetchAccountDetail.owner.equals(this.controllerId)) {
      throw new Error(
        `Invalid token owner: ${JSON.stringify(fetchAccountDetail.owner)}`,
      );
    }

    const data = Buffer.from(fetchAccountDetail.data);

    if (data.readUInt8(0) !== 1) {
      throw new Error(`Invalid token data`);
    }
    const fetchTokenDetail = TokenDetailLayout.decode(data, 1);
    fetchTokenDetail.supply = TokenCount.fromBuffer(fetchTokenDetail.supply);
    return fetchTokenDetail;
  }

  /**
   * Retrieve account information
   *
   * @param account Public key of the token account
   */
  async fetchAccountDetail(account: PubKey): Promise<TokenAccountDetail> {
    const fetchAccountDetail = await this.connection.fetchAccountDetail(account);
    if (!fetchAccountDetail.owner.equals(this.controllerId)) {
      throw new Error(`Invalid token account owner`);
    }

    const data = Buffer.from(fetchAccountDetail.data);
    if (data.readUInt8(0) !== 2) {
      throw new Error(`Invalid token account data`);
    }
    const tokenAccountInfo = TokenAccountDetailLayout.decode(data, 1);

    tokenAccountInfo.token = new PubKey(tokenAccountInfo.token);
    tokenAccountInfo.owner = new PubKey(tokenAccountInfo.owner);
    tokenAccountInfo.amount = TokenCount.fromBuffer(tokenAccountInfo.amount);
    if (tokenAccountInfo.sourceOption === 0) {
      tokenAccountInfo.source = null;
      tokenAccountInfo.originalAmount = new TokenCount();
    } else {
      tokenAccountInfo.source = new PubKey(tokenAccountInfo.source);
      tokenAccountInfo.originalAmount = TokenCount.fromBuffer(
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
   * Transfer tokens to another account
   *
   * @param owner Owner of the source token account
   * @param source Source token account
   * @param destination Destination token account
   * @param amount Number of tokens to transfer
   */
  async transfer(
    owner: BusAccount,
    source: PubKey,
    destination: PubKey,
    amount: number | TokenCount,
  ): Promise<?TxSignature> {
    return await sendAndconfmTx(
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

  /**
   * Grant a third-party permission to transfer up the specified number of tokens from an account
   *
   * @param owner Owner of the source token account
   * @param account Public key of the token account
   * @param delegate Token account authorized to perform a transfer tokens from the source account
   * @param amount Maximum number of tokens the delegate may transfer
   */
  async approve(
    owner: BusAccount,
    account: PubKey,
    delegate: PubKey,
    amount: number | TokenCount,
  ): Promise<void> {
    await sendAndconfmTx(
      this.connection,
      new Transaction().add(
        this.approveOperation(owner.pubKey, account, delegate, amount),
      ),
      owner,
    );
  }

  /**
   * Remove approval for the transfer of any remaining tokens
   *
   * @param owner Owner of the source token account
   * @param account Public key of the token account
   * @param delegate Token account to revoke authorization from
   */
  revoke(
    owner: BusAccount,
    account: PubKey,
    delegate: PubKey,
  ): Promise<void> {
    return this.approve(owner, account, delegate, 0);
  }

  /**
   * Assign a new owner to the account
   *
   * @param owner Owner of the token account
   * @param account Public key of the token account
   * @param newOwner New owner of the token account
   */
  async setOwner(
    owner: BusAccount,
    account: PubKey,
    newOwner: PubKey,
  ): Promise<void> {
    await sendAndconfmTx(
      this.connection,
      new Transaction().add(
        this.setOwnerOperation(owner.pubKey, account, newOwner),
      ),
      owner,
    );
  }

  /**
   * Construct a Transfer instruction
   *
   * @param owner Owner of the source token account
   * @param source Source token account
   * @param destination Destination token account
   * @param amount Number of tokens to transfer
   */
  async transferOperation(
    owner: PubKey,
    source: PubKey,
    destination: PubKey,
    amount: number | TokenCount,
  ): Promise<TxOperation> {
    const fetchAccountDetail = await this.fetchAccountDetail(source);
    if (!owner.equals(fetchAccountDetail.owner)) {
      throw new Error('BusAccount owner mismatch');
    }

    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.uint64('amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2, // Transfer instruction
        amount: new TokenCount(amount).toBuffer(),
      },
      data,
    );

    const keys = [
      {pubkey: owner, isSigner: true, isDebitable: false},
      {pubkey: source, isSigner: false, isDebitable: true},
      {pubkey: destination, isSigner: false, isDebitable: true},
    ];
    if (fetchAccountDetail.source) {
      keys.push({
        pubkey: fetchAccountDetail.source,
        isSigner: false,
        isDebitable: true,
      });
    }
    return new TxOperation({
      keys,
      controllerId: this.controllerId,
      data,
    });
  }

  /**
   * Construct an Approve instruction
   *
   * @param owner Owner of the source token account
   * @param account Public key of the token account
   * @param delegate Token account authorized to perform a transfer tokens from the source account
   * @param amount Maximum number of tokens the delegate may transfer
   */
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
        instruction: 3, // Approve instruction
        amount: new TokenCount(amount).toBuffer(),
      },
      data,
    );

    return new TxOperation({
      keys: [
        {pubkey: owner, isSigner: true, isDebitable: false},
        {pubkey: account, isSigner: false, isDebitable: true},
        {pubkey: delegate, isSigner: false, isDebitable: true},
      ],
      controllerId: this.controllerId,
      data,
    });
  }

  /**
   * Construct an Revoke instruction
   *
   * @param owner Owner of the source token account
   * @param account Public key of the token account
   * @param delegate Token account authorized to perform a transfer tokens from the source account
   */
  revokeOperation(
    owner: PubKey,
    account: PubKey,
    delegate: PubKey,
  ): TxOperation {
    return this.approveOperation(owner, account, delegate, 0);
  }

  /**
   * Construct a SetOwner instruction
   *
   * @param owner Owner of the token account
   * @param account Public key of the token account
   * @param newOwner New owner of the token account
   */
  setOwnerOperation(
    owner: PubKey,
    account: PubKey,
    newOwner: PubKey,
  ): TxOperation {
    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 4, // SetOwner instruction
      },
      data,
    );

    return new TxOperation({
      keys: [
        {pubkey: owner, isSigner: true, isDebitable: false},
        {pubkey: account, isSigner: false, isDebitable: true},
        {pubkey: newOwner, isSigner: false, isDebitable: true},
      ],
      controllerId: this.controllerId,
      data,
    });
  }
}
