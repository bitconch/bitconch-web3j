// @flow

import {Connection} from '../connection';
import {sleep} from './sleep';
import type {TxnSignature} from '../transaction-controller';
import {DEFAULT_TICKS_PER_ROUND, NUM_TICKS_PER_SECOND} from '../timing';

/**
 *
 */
export async function sendAndConfmOriginalTxn(
  connection: Connection,
  rawTransaction: Buffer,
): Promise<TxnSignature> {
  const start = Date.now();
  let signature = await connection.sendOriginalTx(rawTransaction);

  // 
  let status = null;
  let statusRetries = 6;
  for (;;) {
    status = await connection.fetchSignatureState(signature);
    if (status) {
      break;
    }

    // 
    await sleep((500 * DEFAULT_TICKS_PER_ROUND) / NUM_TICKS_PER_SECOND);

    if (--statusRetries <= 0) {
      const duration = (Date.now() - start) / 1000;
      throw new Error(
        `Raw Transaction '${signature}' was not confirmed in ${duration.toFixed(
          2,
        )} seconds (${JSON.stringify(status)})`,
      );
    }
  }

  if (status && 'Ok' in status) {
    return signature;
  }

  throw new Error(
    `Raw transaction ${signature} failed (${JSON.stringify(status)})`,
  );
}
