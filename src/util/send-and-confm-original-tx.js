// @flow

import {Connection} from '../connection';
import {sleep} from './sleep';
import type {TxSignature} from '../transaction-controller';
import {DEFAULT_TICKS_PER_SLOT, NUM_TICKS_PER_SEC} from '../timing';

/**
 * Sign, send and confirm a raw transaction
 */
export async function sendAndConfmOriginalTx(
  connection: Connection,
  rawTransaction: Buffer,
): Promise<TxSignature> {
  const start = Date.now();
  let signature = await connection.sendOriginalTx(rawTransaction);

  // Wait up to a couple slots for a confirmation
  let status = null;
  let statusRetries = 6;
  for (;;) {
    status = await connection.fetchSignatureState(signature);
    if (status) {
      break;
    }

    // Sleep for approximately half a slot
    await sleep((500 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SEC);

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
