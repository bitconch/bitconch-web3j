// @flow

import invariant from 'assert';
import * as BufferLayout from 'buffer-layout';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

import * as Layout from './typelayout';
import {PubKey} from './pubkey';
import {BusAccount} from './bus-account';
import * as shortvec from './util/shortvec-encoding';
import type {Blockhash} from './bus-blockhash';

/**
 * @typedef {string} TxnSignature
 */
export type TxnSignature = string;

/**
 */
export const PACKET_DATA_SIZE = 512;

/**
 *
 * @typedef {Object} TransactionInstructionCtorFields
 * @property {?Array<PubKey>} keys
 * @property {?PubKey} controllerId
 * @property {?Buffer} data
 */
type TxnInstructionControlFields = {|
  keys?: Array<{pubkey: PubKey, isSigner: boolean}>,
  controllerId?: PubKey,
  data?: Buffer,
|};

/**
 */
export class TxOperation {
  /**
   */
  keys: Array<{pubkey: PubKey, isSigner: boolean}> = [];

  /**
   */
  controllerId: PubKey;

  /**
   */
  data: Buffer = Buffer.alloc(0);

  constructor(opts?: TxnInstructionControlFields) {
    opts && Object.assign(this, opts);
  }
}

/**
 * @private
 */
type SignaturePubkeyPair = {|
  signature: Buffer | null,
  pubKey: PubKey,
|};

/**
 *
 * @typedef {Object} TxnControlFields
 * @property (?recentBlockhash} 
 * @property (?signatures} 
 *
 */
type TxnControlFields = {|
  recentBlockhash?: Blockhash,
  signatures?: Array<SignaturePubkeyPair>,
|};

/**
 * Transaction class
 */
export class Transaction {
  /**
   */
  signatures: Array<SignaturePubkeyPair> = [];

  /**
   */
  get signature(): Buffer | null {
    if (this.signatures.length > 0) {
      return this.signatures[0].signature;
    }
    return null;
  }

  /**
   */
  instructions: Array<TxOperation> = [];

  /**
   */
  recentBlockhash: ?Blockhash;

  /**
   */
  constructor(opts?: TxnControlFields) {
    opts && Object.assign(this, opts);
  }

  /**
   */
  add(
    ...items: Array<Transaction | TxnInstructionControlFields>
  ): Transaction {
    if (items.length === 0) {
      throw new Error('No instructions');
    }

    items.forEach(item => {
      if (item instanceof Transaction) {
        this.instructions = this.instructions.concat(item.instructions);
      } else {
        this.instructions.push(new TxOperation(item));
      }
    });
    return this;
  }

  /**
   * @private
   */
  _fetchSignData(): Buffer {
    const {recentBlockhash} = this;
    if (!recentBlockhash) {
      throw new Error('Transaction recentBlockhash required');
    }

    if (this.instructions.length < 1) {
      throw new Error('No instructions provided');
    }

    const keys = this.signatures.map(({pubKey}) => pubKey.toString());
    let numRequiredSignatures = 0;

    const controllerIds = [];
    this.instructions.forEach(instruction => {
      const controllerId = instruction.controllerId.toString();
      if (!controllerIds.includes(controllerId)) {
        controllerIds.push(controllerId);
      }

      instruction.keys.forEach(keySignerPair => {
        const keyStr = keySignerPair.pubkey.toString();
        if (!keys.includes(keyStr)) {
          if (keySignerPair.isSigner) {
            numRequiredSignatures += 1;
          }
          keys.push(keyStr);
        }
      });
    });

    if (numRequiredSignatures > this.signatures.length) {
      throw new Error(
        `Insufficent signatures: expected ${numRequiredSignatures} but got ${
          this.signatures.length
        }`,
      );
    }

    let keyCount = [];
    shortvec.encodeLength(keyCount, keys.length);

    let controllerIdCount = [];
    shortvec.encodeLength(controllerIdCount, controllerIds.length);

    const instructions = this.instructions.map(instruction => {
      const {data, controllerId} = instruction;
      let keyIndicesCount = [];
      shortvec.encodeLength(keyIndicesCount, instruction.keys.length);
      let dataCount = [];
      shortvec.encodeLength(dataCount, instruction.data.length);
      return {
        controllerIdIndex: controllerIds.indexOf(controllerId.toString()),
        keyIndicesCount: Buffer.from(keyIndicesCount),
        keyIndices: Buffer.from(
          instruction.keys.map(keyObj =>
            keys.indexOf(keyObj.pubkey.toString()),
          ),
        ),
        dataLength: Buffer.from(dataCount),
        data,
      };
    });

    instructions.forEach(instruction => {
      invariant(instruction.controllerIdIndex >= 0);
      instruction.keyIndices.forEach(keyIndex => invariant(keyIndex >= 0));
    });

    let instructionCount = [];
    shortvec.encodeLength(instructionCount, instructions.length);
    let instructionBuffer = Buffer.alloc(PACKET_DATA_SIZE);
    Buffer.from(instructionCount).copy(instructionBuffer);
    let instructionBufferLength = instructionCount.length;

    instructions.forEach(instruction => {
      const instructionLayout = BufferLayout.struct([
        BufferLayout.u8('controllerIdIndex'),

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
      BufferLayout.blob(1, 'numRequiredSignatures'),
      BufferLayout.blob(keyCount.length, 'keyCount'),
      BufferLayout.seq(Layout.pubKey('key'), keys.length, 'keys'),
      Layout.pubKey('recentBlockhash'),

      BufferLayout.blob(controllerIdCount.length, 'controllerIdCount'),
      BufferLayout.seq(
        Layout.pubKey('controllerId'),
        controllerIds.length,
        'controllerIds',
      ),
    ]);

    const transaction = {
      numRequiredSignatures: Buffer.from([this.signatures.length]),
      keyCount: Buffer.from(keyCount),
      keys: keys.map(key => new PubKey(key).toBuffer()),
      recentBlockhash: Buffer.from(bs58.decode(recentBlockhash)),
      controllerIdCount: Buffer.from(controllerIdCount),
      controllerIds: controllerIds.map(controllerId =>
        new PubKey(controllerId).toBuffer(),
      ),
    };

    let signData = Buffer.alloc(2048);
    const length = signDataLayout.encode(transaction, signData);
    instructionBuffer.copy(signData, length);
    signData = signData.slice(0, length + instructionBuffer.length);

    return signData;
  }

  sign(...signers: Array<BusAccount>) {
    this.signPartial(...signers);
  }

  signPartial(...partialSigners: Array<PubKey | BusAccount>) {
    if (partialSigners.length === 0) {
      throw new Error('No signers');
    }
    const signatures: Array<SignaturePubkeyPair> = partialSigners.map(
      accountOrPubKey => {
        const pubKey =
          accountOrPubKey instanceof BusAccount
            ? accountOrPubKey.pubKey
            : accountOrPubKey;
        return {
          signature: null,
          pubKey,
        };
      },
    );
    this.signatures = signatures;
    const signData = this._fetchSignData();

    partialSigners.forEach((accountOrPubKey, index) => {
      if (accountOrPubKey instanceof PubKey) {
        return;
      }
      const signature = nacl.sign.detached(
        signData,
        accountOrPubKey.privateKey,
      );
      invariant(signature.length === 64);
      signatures[index].signature = Buffer.from(signature);
    });
  }

  addSigner(signer: BusAccount) {
    const index = this.signatures.findIndex(sigpair =>
      signer.pubKey.equals(sigpair.pubKey),
    );
    if (index < 0) {
      throw new Error(`Unknown signer: ${signer.pubKey.toString()}`);
    }

    const signData = this._fetchSignData();
    const signature = nacl.sign.detached(signData, signer.privateKey);
    invariant(signature.length === 64);
    this.signatures[index].signature = Buffer.from(signature);
  }

  serialize(): Buffer {
    const {signatures} = this;
    if (!signatures) {
      throw new Error('Transaction has not been signed');
    }

    const signData = this._fetchSignData();
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
   * @private
   */
  get keys(): Array<PubKey> {
    invariant(this.instructions.length === 1);
    return this.instructions[0].keys.map(keyObj => keyObj.pubkey);
  }

  /**
   * @private
   */
  get controllerId(): PubKey {
    invariant(this.instructions.length === 1);
    return this.instructions[0].controllerId;
  }

  /**
   * @private
   */
  get data(): Buffer {
    invariant(this.instructions.length === 1);
    return this.instructions[0].data;
  }

  /**
   */
  static from(buffer: Buffer): Transaction {
    const PUBKEY_LENGTH = 32;
    const SIGNATURE_LENGTH = 64;

    let transaction = new Transaction();

    let byteArray = [...buffer];

    const signatureCount = shortvec.decodeLength(byteArray);
    let signatures = [];
    for (let i = 0; i < signatureCount; i++) {
      const signature = byteArray.slice(0, SIGNATURE_LENGTH);
      byteArray = byteArray.slice(SIGNATURE_LENGTH);
      signatures.push(signature);
    }

    byteArray = byteArray.slice(1); 

    const accountCount = shortvec.decodeLength(byteArray);
    let accounts = [];
    for (let i = 0; i < accountCount; i++) {
      const account = byteArray.slice(0, PUBKEY_LENGTH);
      byteArray = byteArray.slice(PUBKEY_LENGTH);
      accounts.push(account);
    }

    const recentBlockhash = byteArray.slice(0, PUBKEY_LENGTH);
    byteArray = byteArray.slice(PUBKEY_LENGTH);

    const controllerIdCount = shortvec.decodeLength(byteArray);
    let programs = [];
    for (let i = 0; i < controllerIdCount; i++) {
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

    transaction.recentBlockhash = new PubKey(recentBlockhash).toBase58();
    for (let i = 0; i < signatureCount; i++) {
      const sigPubkeyPair = {
        signature: Buffer.from(signatures[i]),
        pubKey: new PubKey(accounts[i]),
      };
      transaction.signatures.push(sigPubkeyPair);
    }
    for (let i = 0; i < instructionCount; i++) {
      let instructionData = {
        keys: [],
        controllerId: new PubKey(programs[instructions[i].programIndex]),
        data: Buffer.from(instructions[i].data),
      };
      for (let j = 0; j < instructions[i].accountIndex.length; j++) {
        const pubkey = new PubKey(accounts[instructions[i].accountIndex[j]]);
        instructionData.keys.push({
          pubkey,
          isSigner: transaction.signatures.some(
            keyObj => keyObj.pubKey.toString() === pubkey.toString(),
          ),
        });
      }
      let instruction = new TxOperation(instructionData);
      transaction.instructions.push(instruction);
    }
    return transaction;
  }
}
