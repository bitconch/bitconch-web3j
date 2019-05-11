// @flow

import * as BufferLayout from 'buffer-layout';

import {Transaction} from './transaction';
import {PublicKey} from './publickey';
import * as Layout from './layout';

/**
 * 表示通过执行`applySignature（）`交易来满足的条件
 *
 * @typedef {Object} SignatureCondition
 * @property {string} type 必须等于字符串'timestamp'
 * @property {PublicKey} from 将从中接受`applySignature（）`的公钥
 */
export type SignatureCondition = {
  type: 'signature',
  from: PublicKey,
};

/**
 * 表示通过执行`applyTimestamp（）`交易来满足的条件
 *
 * @typedef {Object} TimestampCondition
 * @property {string} type 必须等于字符串'timestamp'
 * @property {PublicKey} from 从中接受`applyTimestamp（）`的公钥
 * @property {Date} when 观察到的时间戳
 */
export type TimestampCondition = {
  type: 'timestamp',
  from: PublicKey,
  when: Date,
};

/**
 * 表示对给定公钥的付款
 *
 * @typedef {Object} Payment
 * @property {number} amount Dif数量
 * @property {PublicKey} to 接受者的公钥
 */
export type Payment = {
  amount: number,
  to: PublicKey,
};

/**
 * 可以解锁付款的条件
 *
 * @typedef {SignatureCondition|TimestampCondition} BudgetCondition
 */
export type BudgetCondition = SignatureCondition | TimestampCondition;

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
function serializeCondition(condition: BudgetCondition) {
  switch (condition.type) {
    case 'timestamp': {
      const date = serializeDate(condition.when);
      const from = condition.from.toBuffer();

      const data = Buffer.alloc(4 + date.length + from.length);
      data.writeUInt32LE(0, 0); // Condition enum = Timestamp
      date.copy(data, 4);
      from.copy(data, 4 + date.length);
      return data;
    }
    case 'signature': {
      const dataLayout = BufferLayout.struct([
        BufferLayout.u32('condition'),
        Layout.publicKey('from'),
      ]);

      const from = condition.from.toBuffer();
      const data = Buffer.alloc(4 + from.length);
      dataLayout.encode(
        {
          instruction: 1, // Signature
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
 * 用于与预算程序交互的交易的工厂类
 */
export class BudgetProgram {
  /**
   * 用于标识预算计划的公钥
   */
  static get programId(): PublicKey {
    return new PublicKey(
      '0x8100000000000000000000000000000000000000000000000000000000000000',
    );
  }

  /**
   * 该程序所需的空间量
   */
  static get space(): number {
    return 128;
  }

  /**
   * 创建时间戳条件
   */
  static timestampCondition(from: PublicKey, when: Date): TimestampCondition {
    return {
      type: 'timestamp',
      from,
      when,
    };
  }

  /**
   * 创建签名条件
   */
  static signatureCondition(from: PublicKey): SignatureCondition {
    return {
      type: 'signature',
      from,
    };
  }

  /**
   * 生成在满足任何条件后传输dif的交易
   */
  static pay(
    from: PublicKey,
    program: PublicKey,
    to: PublicKey,
    amount: number,
    ...conditions: Array<BudgetCondition>
  ): Transaction {
    const data = Buffer.alloc(1024);
    let pos = 0;
    data.writeUInt32LE(0, pos); // NewBudget指令
    pos += 4;

    switch (conditions.length) {
      case 0:
        data.writeUInt32LE(0, pos); // 预算枚举=支付
        pos += 4;

        {
          const payment = serializePayment({amount, to});
          payment.copy(data, pos);
          pos += payment.length;
        }

        return new Transaction().add({
          keys: [from, to],
          programId: this.programId,
          data: data.slice(0, pos),
        });
      case 1:
        data.writeUInt32LE(1, pos); // 预算枚举=after
        pos += 4;
        {
          const condition = conditions[0];

          const conditionData = serializeCondition(condition);
          conditionData.copy(data, pos);
          pos += conditionData.length;

          const paymentData = serializePayment({amount, to});
          paymentData.copy(data, pos);
          pos += paymentData.length;
        }

        return new Transaction().add({
          keys: [from, program, to],
          programId: this.programId,
          data: data.slice(0, pos),
        });

      case 2:
        data.writeUInt32LE(2, pos); // 预算枚举=or
        pos += 4;

        for (let condition of conditions) {
          const conditionData = serializeCondition(condition);
          conditionData.copy(data, pos);
          pos += conditionData.length;

          const paymentData = serializePayment({amount, to});
          paymentData.copy(data, pos);
          pos += paymentData.length;
        }

        return new Transaction().add({
          keys: [from, program, to],
          programId: this.programId,
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
   * 生成一个交易，一旦满足两个条件就转移dif
   */
  static payOnBoth(
    from: PublicKey,
    program: PublicKey,
    to: PublicKey,
    amount: number,
    condition1: BudgetCondition,
    condition2: BudgetCondition,
  ): Transaction {
    const data = Buffer.alloc(1024);
    let pos = 0;
    data.writeUInt32LE(0, pos); // NewBudget指令
    pos += 4;

    data.writeUInt32LE(3, pos); // 预算枚举=And
    pos += 4;

    for (let condition of [condition1, condition2]) {
      const conditionData = serializeCondition(condition);
      conditionData.copy(data, pos);
      pos += conditionData.length;
    }

    const paymentData = serializePayment({amount, to});
    paymentData.copy(data, pos);
    pos += paymentData.length;

    return new Transaction().add({
      keys: [from, program, to],
      programId: this.programId,
      data: data.slice(0, pos),
    });
  }

  /**
   * 生成应用时间戳的交易，该交易可以启用待处理的付款。
   */
  static applyTimestamp(
    from: PublicKey,
    program: PublicKey,
    to: PublicKey,
    when: Date,
  ): Transaction {
    const whenData = serializeDate(when);
    const data = Buffer.alloc(4 + whenData.length);

    data.writeUInt32LE(1, 0); // ApplyTimestamp指令
    whenData.copy(data, 4);

    return new Transaction().add({
      keys: [from, program, to],
      programId: this.programId,
      data,
    });
  }

  /**
   * 生成应用签名的交易，这可以使待处理的付款继续进行。
   */
  static applySignature(
    from: PublicKey,
    program: PublicKey,
    to: PublicKey,
  ): Transaction {
    const dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2, // ApplySignature指令
      },
      data,
    );

    return new Transaction().add({
      keys: [from, program, to],
      programId: this.programId,
      data,
    });
  }
}
