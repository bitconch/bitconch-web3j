// @flow

import invariant from 'assert';
import * as BufferLayout from 'buffer-layout';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

import * as Layout from './resize';
import {PubKey} from './pubkey';
import {BusAccount} from './bus-account';
import * as shortvec from './util/shortvec-encoding';
import type {Blockhash} from './bus-blockhash';

/**
 * @typedef {string} TxnSignature
 */
export type TxnSignature = string;

/**
 * Maximum over-the-wire size of a Transaction
 *
 * 1280 is IPv6 minimum MTU
 * 40 bytes is the size of the IPv6 header
 * 8 bytes is the size of the fragment header
 */
export const PACKET_DATA_SIZE = 1280 - 40 - 8;

/**
 * List of TxOperation object fields that may be initialized at construction
 *
 * @typedef {Object} TxInstructionControlFields
 * @property {?Array<PubKey>} keys
 * @property {?PubKey} controllerId
 * @property {?Buffer} data
 */
type TxInstructionControlFields = {|
  keys?: Array<{pubkey: PubKey, isSigner: boolean, isDebitable: boolean}>,
  controllerId?: PubKey,
  data?: Buffer,
|};

/**
 * Transaction Instruction class
 */
export class TxOperation {
  /**
   * Public keys to include in this transaction
   * Boolean represents whether this pubkey needs to sign the transaction
   */
  keys: Array<{
    pubkey: PubKey,
    isSigner: boolean,
    isDebitable: boolean,
  }> = [];

  /**
   * Controller Id to execute
   */
  controllerId: PubKey;

  /**
   * Controller input
   */
  data: Buffer = Buffer.alloc(0);

  constructor(opts?: TxInstructionControlFields) {
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
 * List of Transaction object fields that may be initialized at construction
 *
 * @typedef {Object} TxnControlFields
 * @property (?recentPackagehash} A recent block hash
 * @property (?signatures} One or more signatures
 *
 */
type TxnControlFields = {|
  recentPackagehash?: Blockhash | null,
  signatures?: Array<SignaturePubkeyPair>,
|};

/**
 * Transaction class
 */
export class Transaction {
  /**
   * Signatures for the transaction.  Typically created by invoking the
   * `sign()` method
   */
  signatures: Array<SignaturePubkeyPair> = [];

  /**
   * The first (payer) Transaction signature
   */
  get signature(): Buffer | null {
    if (this.signatures.length > 0) {
      return this.signatures[0].signature;
    }
    return null;
  }

  /**
   * The operations to atomically execute
   */
  operations: Array<TxOperation> = [];

  /**
   * A recent transaction id.  Must be populated by the caller
   */
  recentPackagehash: Blockhash | null;

  /**
   * Construct an empty Transaction
   */
  constructor(opts?: TxnControlFields) {
    opts && Object.assign(this, opts);
  }

  /**
   * Add one or more operations to this Transaction
   */
  add(
    ...items: Array<
      Transaction | TxOperation | TxInstructionControlFields,
    >
  ): Transaction {
    if (items.length === 0) {
      throw new Error('No operations');
    }

    items.forEach(item => {
      if (item instanceof Transaction) {
        this.operations = this.operations.concat(item.operations);
      } else if (item instanceof TxOperation) {
        this.operations.push(item);
      } else {
        this.operations.push(new TxOperation(item));
      }
    });
    return this;
  }

  /**
   * @private
   */
  _fetchSignData(): Buffer {
    const {recentPackagehash} = this;
    if (!recentPackagehash) {
      throw new Error('Transaction recentPackagehash required');
    }

    if (this.operations.length < 1) {
      throw new Error('No operations provided');
    }

    const keys = this.signatures.map(({pubKey}) => pubKey.toString());
    let numRequiredSignatures = 0;
    let numCreditOnlySignedAccounts = 0;
    let numCreditOnlyUnsignedAccounts = 0;

    const programIds = [];

    this.operations.forEach(instruction => {
      instruction.keys.forEach(keySignerPair => {
        const keyStr = keySignerPair.pubkey.toString();
        if (!keys.includes(keyStr)) {
          if (keySignerPair.isSigner) {
            numRequiredSignatures += 1;
            if (!keySignerPair.isDebitable) {
              numCreditOnlySignedAccounts += 1;
            }
          } else {
            if (!keySignerPair.isDebitable) {
              numCreditOnlyUnsignedAccounts += 1;
            }
          }
          keys.push(keyStr);
        }
      });

      const controllerId = instruction.controllerId.toString();
      if (!programIds.includes(controllerId)) {
        programIds.push(controllerId);
      }
    });

    programIds.forEach(controllerId => {
      if (!keys.includes(controllerId)) {
        keys.push(controllerId);
        numCreditOnlyUnsignedAccounts += 1;
      }
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

    const operations = this.operations.map(instruction => {
      const {data, controllerId} = instruction;
      let keyIndicesCount = [];
      shortvec.encodeLength(keyIndicesCount, instruction.keys.length);
      let dataCount = [];
      shortvec.encodeLength(dataCount, instruction.data.length);
      return {
        programIdIndex: keys.indexOf(controllerId.toString()),
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

    operations.forEach(instruction => {
      invariant(instruction.programIdIndex >= 0);
      instruction.keyIndices.forEach(keyIndex => invariant(keyIndex >= 0));
    });

    let instructionCount = [];
    shortvec.encodeLength(instructionCount, operations.length);
    let instructionBuffer = Buffer.alloc(PACKET_DATA_SIZE);
    Buffer.from(instructionCount).copy(instructionBuffer);
    let instructionBufferLength = instructionCount.length;

    operations.forEach(instruction => {
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
      BufferLayout.blob(1, 'numRequiredSignatures'),
      BufferLayout.blob(1, 'numCreditOnlySignedAccounts'),
      BufferLayout.blob(1, 'numCreditOnlyUnsignedAccounts'),
      BufferLayout.blob(keyCount.length, 'keyCount'),
      BufferLayout.seq(Layout.pubKey('key'), keys.length, 'keys'),
      Layout.pubKey('recentPackagehash'),
    ]);

    const transaction = {
      numRequiredSignatures: Buffer.from([this.signatures.length]),
      numCreditOnlySignedAccounts: Buffer.from([numCreditOnlySignedAccounts]),
      numCreditOnlyUnsignedAccounts: Buffer.from([
        numCreditOnlyUnsignedAccounts,
      ]),
      keyCount: Buffer.from(keyCount),
      keys: keys.map(key => new PubKey(key).toBuffer()),
      recentPackagehash: Buffer.from(bs58.decode(recentPackagehash)),
    };

    let signData = Buffer.alloc(2048);
    const length = signDataLayout.encode(transaction, signData);
    instructionBuffer.copy(signData, length);
    signData = signData.slice(0, length + instructionBuffer.length);

    return signData;
  }

  /**
   * Sign the Transaction with the specified accounts.  Multiple signatures may
   * be applied to a Transaction. The first signature is considered "primary"
   * and is used when testing for Transaction confirmation.
   *
   * Transaction fields should not be modified after the first call to `sign`,
   * as doing so may invalidate the signature and cause the Transaction to be
   * rejected.
   *
   * The Transaction must be assigned a valid `recentPackagehash` before invoking this method
   */
  sign(...signers: Array<BusAccount>) {
    this.signPartial(...signers);
  }

  /**
   * Partially sign a Transaction with the specified accounts.  The `BusAccount`
   * inputs will be used to sign the Transaction immediately, while any
   * `PubKey` inputs will be referenced in the signed Transaction but need to
   * be filled in later by calling `addSigner()` with the matching `BusAccount`.
   *
   * All the caveats from the `sign` method apply to `signPartial`
   */
  signPartial(...partialSigners: Array<PubKey | BusAccount>) {
    if (partialSigners.length === 0) {
      throw new Error('No signers');
    }
    const signatures: Array<SignaturePubkeyPair> = partialSigners.map(
      accountOrPublicKey => {
        const pubKey =
          accountOrPublicKey instanceof BusAccount
            ? accountOrPublicKey.pubKey
            : accountOrPublicKey;
        return {
          signature: null,
          pubKey,
        };
      },
    );
    this.signatures = signatures;
    const signData = this._fetchSignData();

    partialSigners.forEach((accountOrPublicKey, index) => {
      if (accountOrPublicKey instanceof PubKey) {
        return;
      }
      const signature = nacl.sign.detached(
        signData,
        accountOrPublicKey.privateKey,
      );
      invariant(signature.length === 64);
      signatures[index].signature = Buffer.from(signature);
    });
  }

  /**
   * Fill in a signature for a partially signed Transaction.  The `signer` must
   * be the corresponding `BusAccount` for a `PubKey` that was previously provided to
   * `signPartial`
   */
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

  /**
   * Serialize the Transaction in the wire format.
   *
   * The Transaction must have a valid `signature` before invoking this method
   */
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
   * Deprecated method
   * @private
   */
  get keys(): Array<PubKey> {
    invariant(this.operations.length === 1);
    return this.operations[0].keys.map(keyObj => keyObj.pubkey);
  }

  /**
   * Deprecated method
   * @private
   */
  get controllerId(): PubKey {
    invariant(this.operations.length === 1);
    return this.operations[0].controllerId;
  }

  /**
   * Deprecated method
   * @private
   */
  get data(): Buffer {
    invariant(this.operations.length === 1);
    return this.operations[0].data;
  }

  /**
   * Parse a wire transaction into a Transaction object.
   */
  static from(buffer: Buffer): Transaction {
    const PUBKEY_LENGTH = 32;
    const SIGNATURE_LENGTH = 64;

    function isCreditDebit(
      i: number,
      numRequiredSignatures: number,
      numCreditOnlySignedAccounts: number,
      numCreditOnlyUnsignedAccounts: number,
      numKeys: number,
    ): boolean {
      return (
        i < numRequiredSignatures - numCreditOnlySignedAccounts ||
        (i >= numRequiredSignatures &&
          i < numKeys - numCreditOnlyUnsignedAccounts)
      );
    }

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

    const numRequiredSignatures = byteArray.shift();
    // byteArray = byteArray.slice(1); // Skip numRequiredSignatures byte
    const numCreditOnlySignedAccounts = byteArray.shift();
    // byteArray = byteArray.slice(1); // Skip numCreditOnlySignedAccounts byte
    const numCreditOnlyUnsignedAccounts = byteArray.shift();
    // byteArray = byteArray.slice(1); // Skip numCreditOnlyUnsignedAccounts byte

    const accountCount = shortvec.decodeLength(byteArray);
    let accounts = [];
    for (let i = 0; i < accountCount; i++) {
      const account = byteArray.slice(0, PUBKEY_LENGTH);
      byteArray = byteArray.slice(PUBKEY_LENGTH);
      accounts.push(account);
    }

    const recentPackagehash = byteArray.slice(0, PUBKEY_LENGTH);
    byteArray = byteArray.slice(PUBKEY_LENGTH);

    const instructionCount = shortvec.decodeLength(byteArray);
    let operations = [];
    for (let i = 0; i < instructionCount; i++) {
      let instruction = {};
      instruction.programIndex = byteArray.shift();
      const accountIndexCount = shortvec.decodeLength(byteArray);
      instruction.accountIndex = byteArray.slice(0, accountIndexCount);
      byteArray = byteArray.slice(accountIndexCount);
      const dataLength = shortvec.decodeLength(byteArray);
      instruction.data = byteArray.slice(0, dataLength);
      byteArray = byteArray.slice(dataLength);
      operations.push(instruction);
    }

    // Populate Transaction object
    transaction.recentPackagehash = new PubKey(recentPackagehash).toBase58();
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
        controllerId: new PubKey(accounts[operations[i].programIndex]),
        data: Buffer.from(operations[i].data),
      };
      for (let j = 0; j < operations[i].accountIndex.length; j++) {
        const pubkey = new PubKey(accounts[operations[i].accountIndex[j]]);

        instructionData.keys.push({
          pubkey,
          isSigner: transaction.signatures.some(
            keyObj => keyObj.pubKey.toString() === pubkey.toString(),
          ),
          isDebitable: isCreditDebit(
            j,
            numRequiredSignatures,
            numCreditOnlySignedAccounts,
            numCreditOnlyUnsignedAccounts,
            accounts.length,
          ),
        });
      }
      let instruction = new TxOperation(instructionData);
      transaction.operations.push(instruction);
    }
    return transaction;
  }
}
