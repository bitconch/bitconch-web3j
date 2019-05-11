// @flow

import invariant from 'assert';
import * as BufferLayout from 'buffer-layout';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

import * as Layout from './layout';
import {PublicKey} from './publickey';
import {Account} from './account';
import * as shortvec from './util/shortvec-encoding';
import type {Blockhash} from './blockhash';

/**
 * @typedef {string} TransactionSignature
 */
export type TransactionSignature = string;

/**
 * 交易的最大线上大小
 */
export const PACKET_DATA_SIZE = 512;

/**
 * 可在构造时初始化的交易指令对象字段的列表
 *
 * @typedef {Object} TransactionInstructionCtorFields
 * @property {?Array<PublicKey>} keys
 * @property {?PublicKey} programId
 * @property {?Buffer} data
 */
type TransactionInstructionCtorFields = {|
  keys?: Array<PublicKey>,
  programId?: PublicKey,
  data?: Buffer,
|};

/**
 * 交易指令类
 */
export class TransactionInstruction {
  /**
   * 包含在此交易中的公钥
   */
  keys: Array<PublicKey> = [];

  /**
   * 要执行的程序ID
   */
  programId: PublicKey;

  /**
   * 输入
   */
  data: Buffer = Buffer.alloc(0);

  constructor(opts?: TransactionInstructionCtorFields) {
    opts && Object.assign(this, opts);
  }
}

/**
 * @private
 */
type SignaturePubkeyPair = {|
  signature: Buffer | null,
  publicKey: PublicKey,
|};

/**
 * 可在构造时初始化的交易对象字段列表
 *
 * @typedef {Object} TransactionCtorFields
 * @property {?number} fee
 * @property (?recentBlockhash} 最近的一个块哈希
 * @property (?signatures} 一个或多个签名
 *
 */
type TransactionCtorFields = {|
  fee?: number,
  recentBlockhash?: Blockhash,
  signatures?: Array<SignaturePubkeyPair>,
|};

/**
 * 交易类
 */
export class Transaction {
  /**
   * 交易的签名。一般都是通过调用`sign()`方法获得。
   *
   */
  signatures: Array<SignaturePubkeyPair> = [];

  /**
   * 第一个（主要）交易签名
   */
  get signature(): Buffer | null {
    if (this.signatures.length > 0) {
      return this.signatures[0].signature;
    }
    return null;
  }

  /**
   * 原子执行的指令
   */
  instructions: Array<TransactionInstruction> = [];

  /**
   * 最近的交易ID。 必须由调用者填充
   */
  recentBlockhash: ?Blockhash;

  /**
   * 这笔交易的费用 手续费为0.001BUS或者1Dif
   */
  fee: number = 1;

  /**
   * 构造一个空的Transaction
   */
  constructor(opts?: TransactionCtorFields) {
    opts && Object.assign(this, opts);
  }

  /**
   * 向此交易添加一条或多条指令
   */
  add(
    ...items: Array<Transaction | TransactionInstructionCtorFields>
  ): Transaction {
    if (items.length === 0) {
      throw new Error('No instructions');
    }

    items.forEach(item => {
      if (item instanceof Transaction) {
        this.instructions = this.instructions.concat(item.instructions);
      } else {
        this.instructions.push(new TransactionInstruction(item));
      }
    });
    return this;
  }

  /**
   * @private
   */
  _getSignData(): Buffer {
    const {recentBlockhash} = this;
    if (!recentBlockhash) {
      throw new Error('Transaction recentBlockhash required');
    }

    if (this.instructions.length < 1) {
      throw new Error('No instructions provided');
    }

    const keys = this.signatures.map(({publicKey}) => publicKey.toString());

    const programIds = [];
    this.instructions.forEach(instruction => {
      const programId = instruction.programId.toString();
      if (!programIds.includes(programId)) {
        programIds.push(programId);
      }

      instruction.keys
        .map(key => key.toString())
        .forEach(key => {
          if (!keys.includes(key)) {
            keys.push(key);
          }
        });
    });

    let keyCount = [];
    shortvec.encodeLength(keyCount, keys.length);

    let programIdCount = [];
    shortvec.encodeLength(programIdCount, programIds.length);

    const instructions = this.instructions.map(instruction => {
      const {data, programId} = instruction;
      let keyIndicesCount = [];
      shortvec.encodeLength(keyIndicesCount, instruction.keys.length);
      let dataCount = [];
      shortvec.encodeLength(dataCount, instruction.data.length);
      return {
        programIdIndex: programIds.indexOf(programId.toString()),
        keyIndicesCount: Buffer.from(keyIndicesCount),
        keyIndices: Buffer.from(
          instruction.keys.map(key => keys.indexOf(key.toString())),
        ),
        dataLength: Buffer.from(dataCount),
        data,
      };
    });

    instructions.forEach(instruction => {
      invariant(instruction.programIdIndex >= 0);
      instruction.keyIndices.forEach(keyIndex => invariant(keyIndex >= 0));
    });

    let instructionCount = [];
    shortvec.encodeLength(instructionCount, instructions.length);
    let instructionBuffer = Buffer.alloc(PACKET_DATA_SIZE);
    Buffer.from(instructionCount).copy(instructionBuffer);
    let instructionBufferLength = instructionCount.length;

    instructions.forEach(instruction => {
      const instructionLayout = BufferLayout.struct([
        BufferLayout.u8('programIdIndex'),

        BufferLayout.blob(
          instruction.keyIndicesCount.length,
          'keyIndicesCount',
        ),
        BufferLayout.seq(
          BufferLayout.u8('keyIndex'),
          instruction.keyIndices.length,
          'keyIndices',
        ),
        BufferLayout.blob(instruction.dataLength.length, 'dataLength'),
        BufferLayout.seq(
          BufferLayout.u8('userdatum'),
          instruction.data.length,
          'data',
        ),
      ]);
      const length = instructionLayout.encode(
        instruction,
        instructionBuffer,
        instructionBufferLength,
      );
      instructionBufferLength += length;
    });
    instructionBuffer = instructionBuffer.slice(0, instructionBufferLength);

    const signDataLayout = BufferLayout.struct([
      BufferLayout.blob(keyCount.length, 'keyCount'),
      BufferLayout.seq(Layout.publicKey('key'), keys.length, 'keys'),
      Layout.publicKey('recentBlockhash'),
      BufferLayout.ns64('fee'),

      BufferLayout.blob(programIdCount.length, 'programIdCount'),
      BufferLayout.seq(
        Layout.publicKey('programId'),
        programIds.length,
        'programIds',
      ),
    ]);

    const transaction = {
      keyCount: Buffer.from(keyCount),
      keys: keys.map(key => new PublicKey(key).toBuffer()),
      recentBlockhash: Buffer.from(bs58.decode(recentBlockhash)),
      fee: this.fee,
      programIdCount: Buffer.from(programIdCount),
      programIds: programIds.map(programId =>
        new PublicKey(programId).toBuffer(),
      ),
    };

    let signData = Buffer.alloc(2048);
    const length = signDataLayout.encode(transaction, signData);
    instructionBuffer.copy(signData, length);
    signData = signData.slice(0, length + instructionBuffer.length);

    return signData;
  }

  /**
   * 使用指定的帐户签署交易。 一个交易可以应用多个签名。 第一个签名被认为是主签名，在测试交易确认时使用。
   *
   * 在第一次调用“sign”之后，不应修改交易字段，因为这样做可能会使签名无效并导致事务被拒绝。
   *
   * 在调用此方法之前，必须为Transaction分配一个有效的`recentBlockhash`
   */
  sign(...signers: Array<Account>) {
    this.signPartial(...signers);
  }

  /**
   * 使用指定的帐户部分签署交易。 “账户”输入将立即用于签署交易，而任何“PublicKey”输入将在签名的交易中被引用，
   * 但需要稍后通过使用匹配的“账户”调用“addSigner（）”来填写。
   *
   * 来自`sign`方法的所有警告都适用于`signPartial`
   */
  signPartial(...partialSigners: Array<PublicKey | Account>) {
    if (partialSigners.length === 0) {
      throw new Error('No signers');
    }
    const signatures: Array<SignaturePubkeyPair> = partialSigners.map(
      accountOrPublicKey => {
        const publicKey =
          accountOrPublicKey instanceof Account
            ? accountOrPublicKey.publicKey
            : accountOrPublicKey;
        return {
          signature: null,
          publicKey,
        };
      },
    );
    this.signatures = signatures;
    const signData = this._getSignData();

    partialSigners.forEach((accountOrPublicKey, index) => {
      if (accountOrPublicKey instanceof PublicKey) {
        return;
      }
      const signature = nacl.sign.detached(
        signData,
        accountOrPublicKey.secretKey,
      );
      invariant(signature.length === 64);
      signatures[index].signature = Buffer.from(signature);
    });
  }

  /**
   * 为部分签名的交易填写签名。 `signer`必须是之前提供给`signPartial`的`PublicKey`的相应`Account`。
   */
  addSigner(signer: Account) {
    const index = this.signatures.findIndex(sigpair =>
      signer.publicKey.equals(sigpair.publicKey),
    );
    if (index < 0) {
      throw new Error(`Unknown signer: ${signer.publicKey.toString()}`);
    }

    const signData = this._getSignData();
    const signature = nacl.sign.detached(signData, signer.secretKey);
    invariant(signature.length === 64);
    this.signatures[index].signature = Buffer.from(signature);
  }

  /**
   * 以电汇交易格式序列化交易。
   *
   * 在调用此方法之前，Transaction必须具有有效的`signature`
   */
  serialize(): Buffer {
    const {signatures} = this;
    if (!signatures) {
      throw new Error('Transaction has not been signed');
    }

    const signData = this._getSignData();
    const signatureCount = [];
    shortvec.encodeLength(signatureCount, signatures.length);
    const transactionLength =
      signatureCount.length + signatures.length * 64 + signData.length;
    const wireTransaction = Buffer.alloc(transactionLength);
    invariant(signatures.length < 256);
    Buffer.from(signatureCount).copy(wireTransaction, 0);
    signatures.forEach(({signature}, index) => {
      invariant(signature !== null, `null signature`);
      invariant(signature.length === 64, `signature has invalid length`);
      Buffer.from(signature).copy(
        wireTransaction,
        signatureCount.length + index * 64,
      );
    });
    signData.copy(
      wireTransaction,
      signatureCount.length + signatures.length * 64,
    );
    invariant(
      wireTransaction.length <= PACKET_DATA_SIZE,
      `Transaction too large: ${wireTransaction.length} > ${PACKET_DATA_SIZE}`,
    );
    return wireTransaction;
  }

  /**
   * 不推荐的方法
   * @private
   */
  get keys(): Array<PublicKey> {
    invariant(this.instructions.length === 1);
    return this.instructions[0].keys;
  }

  /**
   * 不推荐的方法
   * @private
   */
  get programId(): PublicKey {
    invariant(this.instructions.length === 1);
    return this.instructions[0].programId;
  }

  /**
   * 不推荐的方法
   * @private
   */
  get data(): Buffer {
    invariant(this.instructions.length === 1);
    return this.instructions[0].data;
  }

  /**
   * 解析电汇交易到交易对象。
   */
  static from(buffer: Buffer): Transaction {
    const PUBKEY_LENGTH = 32;
    const SIGNATURE_LENGTH = 64;

    let transaction = new Transaction();

    // Slice up wire data
    let byteArray = [...buffer];

    const signatureCount = shortvec.decodeLength(byteArray);
    let signatures = [];
    for (let i = 0; i < signatureCount; i++) {
      const signature = byteArray.slice(0, SIGNATURE_LENGTH);
      byteArray = byteArray.slice(SIGNATURE_LENGTH);
      signatures.push(signature);
    }

    const accountCount = shortvec.decodeLength(byteArray);
    let accounts = [];
    for (let i = 0; i < accountCount; i++) {
      const account = byteArray.slice(0, PUBKEY_LENGTH);
      byteArray = byteArray.slice(PUBKEY_LENGTH);
      accounts.push(account);
    }

    const recentBlockhash = byteArray.slice(0, PUBKEY_LENGTH);
    byteArray = byteArray.slice(PUBKEY_LENGTH);

    let fee = 0;
    for (let i = 0; i < 8; i++) {
      fee += byteArray.shift() >> (8 * i);
    }

    const programIdCount = shortvec.decodeLength(byteArray);
    let programs = [];
    for (let i = 0; i < programIdCount; i++) {
      const program = byteArray.slice(0, PUBKEY_LENGTH);
      byteArray = byteArray.slice(PUBKEY_LENGTH);
      programs.push(program);
    }

    const instructionCount = shortvec.decodeLength(byteArray);
    let instructions = [];
    for (let i = 0; i < instructionCount; i++) {
      let instruction = {};
      instruction.programIndex = byteArray.shift();
      const accountIndexCount = shortvec.decodeLength(byteArray);
      instruction.accountIndex = byteArray.slice(0, accountIndexCount);
      byteArray = byteArray.slice(accountIndexCount);
      const dataLength = shortvec.decodeLength(byteArray);
      instruction.data = byteArray.slice(0, dataLength);
      byteArray = byteArray.slice(dataLength);
      instructions.push(instruction);
    }

    // 填充Transaction对象
    transaction.recentBlockhash = new PublicKey(recentBlockhash).toBase58();
    transaction.fee = fee;
    for (let i = 0; i < signatureCount; i++) {
      const sigPubkeyPair = {
        signature: Buffer.from(signatures[i]),
        publicKey: new PublicKey(accounts[i]),
      };
      transaction.signatures.push(sigPubkeyPair);
    }
    for (let i = 0; i < instructionCount; i++) {
      let instructionData = {
        keys: [],
        programId: new PublicKey(programs[instructions[i].programIndex]),
        data: Buffer.from(instructions[i].data),
      };
      for (let j = 0; j < instructions[i].accountIndex.length; j++) {
        instructionData.keys.push(
          new PublicKey(accounts[instructions[i].accountIndex[j]]),
        );
      }
      let instruction = new TransactionInstruction(instructionData);
      transaction.instructions.push(instruction);
    }
    return transaction;
  }
}
