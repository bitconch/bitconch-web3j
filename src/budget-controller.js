// @flow

import * as BufferLayout from 'buffer-layout';

import {Transaction} from './transaction-controller';
import {PubKey} from './pubkey';
import {SystemController} from './system-controller';

/**
 * Represents a condition that is met by executing a `matchSignature()`
 * transaction
 *
 * @typedef {Object} SignatureState
 * @property {string} type Must equal the string 'timestamp'
 * @property {PubKey} from Public key from which `matchSignature()` will be accepted from
 */
export type SignatureState = {
  type: 'signature',
  from: PubKey,
};

/**
 * Represents a condition that is met by executing a `matchTimestamp()`
 * transaction
 *
 * @typedef {Object} TimestampState
 * @property {string} type Must equal the string 'timestamp'
 * @property {PubKey} from Public key from which `matchTimestamp()` will be accepted from
 * @property {Date} when The timestamp that was observed
 */
export type TimestampState = {
  type: 'timestamp',
  from: PubKey,
  when: Date,
};

/**
 * Represents a payment to a given public key
 *
 * @typedef {Object} Payment
 * @property {number} amount Number of lamports
 * @property {PubKey} to Public key of the recipient
 */
export type Payment = {
  amount: number,
  to: PubKey,
};

/**
 * A condition that can unlock a payment
 *
 * @typedef {SignatureState|TimestampState} BudgetState
 */
export type BudgetState = SignatureState | TimestampState;

/**
 * @private
 */
function serializePayment(payment: Payment): Buffer {
  const toData = payment.to.toBuffer();
  const data = Buffer.alloc(8 + toData.length);
  data.writeUInt32LE(payment.amount, 0);
  toData.copy(data, 8);
  return data;
}

/**
 * @private
 */
function serializeTime(when: Date): Buffer {
  const data = Buffer.alloc(8 + 20);
  data.writeUInt32LE(20, 0); // size of timestamp as u64

  function iso(date) {
    function pad(number) {
      if (number < 10) {
        return '0' + number;
      }
      return number;
    }

    return (
      date.getUTCFullYear() +
      '-' +
      pad(date.getUTCMonth() + 1) +
      '-' +
      pad(date.getUTCDate()) +
      'T' +
      pad(date.getUTCHours()) +
      ':' +
      pad(date.getUTCMinutes()) +
      ':' +
      pad(date.getUTCSeconds()) +
      'Z'
    );
  }
  data.write(iso(when), 8);
  return data;
}

/**
 * @private
 */
function serializeState(condition: BudgetState) {
  switch (condition.type) {
    case 'timestamp': {
      const date = serializeTime(condition.when);
      const from = condition.from.toBuffer();

      const data = Buffer.alloc(4 + date.length + from.length);
      data.writeUInt32LE(0, 0); // Condition enum = Timestamp
      date.copy(data, 4);
      from.copy(data, 4 + date.length);
      return data;
    }
    case 'signature': {
      const from = condition.from.toBuffer();
      const data = Buffer.alloc(4 + from.length);
      data.writeUInt32LE(1, 0); // Condition enum = Signature
      from.copy(data, 4);
      return data;
    }
    default:
      throw new Error(`Unknown condition type: ${condition.type}`);
  }
}

/**
 * Factory class for transactions to interact with the Budget program
 */
export class BudgetController {
  /**
   * Public key that identifies the Budget program
   */
  static get controllerId(): PubKey {
    return new PubKey('Budget1111111111111111111111111111111111111');
  }

  /**
   * The amount of space this program requires
   */
  static get size(): number {
    return 128;
  }

  /**
   * Creates a timestamp condition
   */
  static timestampState(from: PubKey, when: Date): TimestampState {
    return {
      type: 'timestamp',
      from,
      when,
    };
  }

  /**
   * Creates a signature condition
   */
  static signatureState(from: PubKey): SignatureState {
    return {
      type: 'signature',
      from,
    };
  }

  /**
   * Generates a transaction that transfers lamports once any of the conditions are met
   */
  static pay(
    from: PubKey,
    program: PubKey,
    to: PubKey,
    amount: number,
    ...conditions: Array<BudgetState>
  ): Transaction {
    const data = Buffer.alloc(1024);
    let pos = 0;
    data.writeUInt32LE(0, pos); // NewBudget instruction
    pos += 4;

    switch (conditions.length) {
      case 0: {
        data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay
        pos += 4;

        {
          const payment = serializePayment({amount, to});
          payment.copy(data, pos);
          pos += payment.length;
        }
        const trimmedData = data.slice(0, pos);

        const transaction = SystemController.createNewAccount(
          from,
          program,
          amount,
          trimmedData.length,
          this.controllerId,
        );

        return transaction.add({
          keys: [
            {pubkey: to, isSigner: false, isDebitable: false},
            {pubkey: program, isSigner: false, isDebitable: true},
          ],
          controllerId: this.controllerId,
          data: trimmedData,
        });
      }
      case 1: {
        data.writeUInt32LE(1, pos); // BudgetExpr enum = After
        pos += 4;
        {
          const condition = conditions[0];

          const conditionData = serializeState(condition);
          conditionData.copy(data, pos);
          pos += conditionData.length;

          data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay
          pos += 4;

          const paymentData = serializePayment({amount, to});
          paymentData.copy(data, pos);
          pos += paymentData.length;
        }
        const trimmedData = data.slice(0, pos);

        const transaction = SystemController.createNewAccount(
          from,
          program,
          amount,
          trimmedData.length,
          this.controllerId,
        );

        return transaction.add({
          keys: [{pubkey: program, isSigner: false, isDebitable: true}],
          controllerId: this.controllerId,
          data: trimmedData,
        });
      }

      case 2: {
        data.writeUInt32LE(2, pos); // BudgetExpr enum = Or
        pos += 4;

        for (let condition of conditions) {
          const conditionData = serializeState(condition);
          conditionData.copy(data, pos);
          pos += conditionData.length;

          data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay
          pos += 4;

          const paymentData = serializePayment({amount, to});
          paymentData.copy(data, pos);
          pos += paymentData.length;
        }
        const trimmedData = data.slice(0, pos);

        const transaction = SystemController.createNewAccount(
          from,
          program,
          amount,
          trimmedData.length,
          this.controllerId,
        );

        return transaction.add({
          keys: [{pubkey: program, isSigner: false, isDebitable: true}],
          controllerId: this.controllerId,
          data: trimmedData,
        });
      }

      default:
        throw new Error(
          `A maximum of two conditions are support: ${
            conditions.length
          } provided`,
        );
    }
  }

  /**
   * Generates a transaction that transfers lamports once both conditions are met
   */
  static bothToPay(
    from: PubKey,
    program: PubKey,
    to: PubKey,
    amount: number,
    condition1: BudgetState,
    condition2: BudgetState,
  ): Transaction {
    const data = Buffer.alloc(1024);
    let pos = 0;
    data.writeUInt32LE(0, pos); // NewBudget instruction
    pos += 4;

    data.writeUInt32LE(3, pos); // BudgetExpr enum = And
    pos += 4;

    for (let condition of [condition1, condition2]) {
      const conditionData = serializeState(condition);
      conditionData.copy(data, pos);
      pos += conditionData.length;
    }

    data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay
    pos += 4;

    const paymentData = serializePayment({amount, to});
    paymentData.copy(data, pos);
    pos += paymentData.length;

    const trimmedData = data.slice(0, pos);

    const transaction = SystemController.createNewAccount(
      from,
      program,
      amount,
      trimmedData.length,
      this.controllerId,
    );

    return transaction.add({
      keys: [{pubkey: program, isSigner: false, isDebitable: true}],
      controllerId: this.controllerId,
      data: trimmedData,
    });
  }

  /**
   * Generates a transaction that applies a timestamp, which could enable a
   * pending payment to proceed.
   */
  static matchTimestamp(
    from: PubKey,
    program: PubKey,
    to: PubKey,
    when: Date,
  ): Transaction {
    const whenData = serializeTime(when);
    const data = Buffer.alloc(4 + whenData.length);

    data.writeUInt32LE(1, 0); // ApplyTimestamp instruction
    whenData.copy(data, 4);

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true, isDebitable: true},
        {pubkey: program, isSigner: false, isDebitable: true},
        {pubkey: to, isSigner: false, isDebitable: false},
      ],
      controllerId: this.controllerId,
      data,
    });
  }

  /**
   * Generates a transaction that applies a signature, which could enable a
   * pending payment to proceed.
   */
  static matchSignature(
    from: PubKey,
    program: PubKey,
    to: PubKey,
  ): Transaction {
    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2, // ApplySignature instruction
      },
      data,
    );

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true, isDebitable: true},
        {pubkey: program, isSigner: false, isDebitable: true},
        {pubkey: to, isSigner: false, isDebitable: false},
      ],
      controllerId: this.controllerId,
      data,
    });
  }
}
