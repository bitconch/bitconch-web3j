// @flow

import * as BufferLayout from 'buffer-layout';

import {Transaction} from './transaction-controller';
import {PubKey} from './pubkey';
import * as Layout from './typelayout';

/**
 * 
 * 
 *
 * @typedef {Object} SignatureCond
 * @property {string} type 
 * @property {PubKey} from 
 */
export type SignatureCond = {
  type: 'signature',
  from: PubKey,
};

/**
 * 
 * 
 *
 * @typedef {Object} TimestampCond
 * @property {string} type 
 * @property {PubKey} from
 * @property {Date} when 
 */
export type TimestampCond = {
  type: 'timestamp',
  from: PubKey,
  when: Date,
};

/**
 * 
 *
 * @typedef {Object} Payment
 * @property {number} 
 * @property {PubKey} 
 */
export type Payment = {
  amount: number,
  to: PubKey,
};

/**
 * 
 *
 * @typedef {SignatureCond|TimestampCond} BudgetCond
 */
export type BudgetCond = SignatureCond | TimestampCond;

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
function serializeDate(when: Date): Buffer {
  const data = Buffer.alloc(8 + 20);
  data.writeUInt32LE(20, 0); // 

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
function serializeCond(condition: BudgetCond) {
  switch (condition.type) {
    case 'timestamp': {
      const date = serializeDate(condition.when);
      const from = condition.from.toBuffer();

      const data = Buffer.alloc(4 + date.length + from.length);
      data.writeUInt32LE(0, 0); 
      date.copy(data, 4);
      from.copy(data, 4 + date.length);
      return data;
    }
    case 'signature': {
      const dataLayout = BufferLayout.struct([
        BufferLayout.u32('condition'),
        Layout.pubKey('from'),
      ]);

      const from = condition.from.toBuffer();
      const data = Buffer.alloc(4 + from.length);
      dataLayout.encode(
        {
          instruction: 1, 
          from,
        },
        data,
      );
      return data;
    }
    default:
      throw new Error(`Unknown condition type: ${condition.type}`);
  }
}

/**
 * 
 */
export class BudgetController {
  /**
   * 
   */
  static get controllerId(): PubKey {
    return new PubKey('Budget1111111111111111111111111111111111111');
  }

  /**
   * 
   */
  static get size(): number {
    return 128;
  }

  /**
   * 
   */
  static datetimeCond(from: PubKey, when: Date): TimestampCond {
    return {
      type: 'timestamp',
      from,
      when,
    };
  }

  /**
   * 
   */
  static signatureCond(from: PubKey): SignatureCond {
    return {
      type: 'signature',
      from,
    };
  }

  /**
   * 
   */
  static pay(
    from: PubKey,
    program: PubKey,
    to: PubKey,
    amount: number,
    ...conditions: Array<BudgetCond>
  ): Transaction {
    const data = Buffer.alloc(1024);
    let pos = 0;
    data.writeUInt32LE(0, pos); 
    pos += 4;

    switch (conditions.length) {
      case 0:
        data.writeUInt32LE(0, pos); 
        pos += 4;

        {
          const payment = serializePayment({amount, to});
          payment.copy(data, pos);
          pos += payment.length;
        }

        return new Transaction().add({
          keys: [{pubkey: from, isSigner: true}, {pubkey: to, isSigner: false}],
          controllerId: this.controllerId,
          data: data.slice(0, pos),
        });
      case 1:
        data.writeUInt32LE(1, pos); 
        pos += 4;
        {
          const condition = conditions[0];

          const conditionData = serializeCond(condition);
          conditionData.copy(data, pos);
          pos += conditionData.length;

          const paymentData = serializePayment({amount, to});
          paymentData.copy(data, pos);
          pos += paymentData.length;
        }

        return new Transaction().add({
          keys: [
            {pubkey: from, isSigner: true},
            {pubkey: program, isSigner: false},
            {pubkey: to, isSigner: false},
          ],
          controllerId: this.controllerId,
          data: data.slice(0, pos),
        });

      case 2:
        data.writeUInt32LE(2, pos);
        pos += 4;

        for (let condition of conditions) {
          const conditionData = serializeCond(condition);
          conditionData.copy(data, pos);
          pos += conditionData.length;

          const paymentData = serializePayment({amount, to});
          paymentData.copy(data, pos);
          pos += paymentData.length;
        }

        return new Transaction().add({
          keys: [
            {pubkey: from, isSigner: true},
            {pubkey: program, isSigner: false},
            {pubkey: to, isSigner: false},
          ],
          controllerId: this.controllerId,
          data: data.slice(0, pos),
        });

      default:
        throw new Error(
          `A maximum of two conditions are support: ${
            conditions.length
          } provided`,
        );
    }
  }

  /**
   * 
   */
  static payOnAll(
    from: PubKey,
    program: PubKey,
    to: PubKey,
    amount: number,
    condition1: BudgetCond,
    condition2: BudgetCond,
  ): Transaction {
    const data = Buffer.alloc(1024);
    let pos = 0;
    data.writeUInt32LE(0, pos); 
    pos += 4;

    data.writeUInt32LE(3, pos); 
    pos += 4;

    for (let condition of [condition1, condition2]) {
      const conditionData = serializeCond(condition);
      conditionData.copy(data, pos);
      pos += conditionData.length;
    }

    const paymentData = serializePayment({amount, to});
    paymentData.copy(data, pos);
    pos += paymentData.length;

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true},
        {pubkey: program, isSigner: false},
        {pubkey: to, isSigner: false},
      ],
      controllerId: this.controllerId,
      data: data.slice(0, pos),
    });
  }

  /**
   * 
   * 
   */
  static sealWithDatetime(
    from: PubKey,
    program: PubKey,
    to: PubKey,
    when: Date,
  ): Transaction {
    const whenData = serializeDate(when);
    const data = Buffer.alloc(4 + whenData.length);

    data.writeUInt32LE(1, 0); 
    whenData.copy(data, 4);

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true},
        {pubkey: program, isSigner: false},
        {pubkey: to, isSigner: false},
      ],
      controllerId: this.controllerId,
      data,
    });
  }

  /**
   * 
   * 
   */
  static sealWithSignature(
    from: PubKey,
    program: PubKey,
    to: PubKey,
  ): Transaction {
    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        operation: 2, 
      },
      data,
    );

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true},
        {pubkey: program, isSigner: false},
        {pubkey: to, isSigner: false},
      ],
      controllerId: this.controllerId,
      data,
    });
  }
}
