// @flow

import {
  Connection,
  NativeControllerLoader,
  Transaction,
  sendAndConfmTxn,
} from '../src';
import {mockRpcEnabled} from './__mocks__/node-fetch';
import {url} from './url';
import {newAccountWithDif} from './new-account-with-dif';

if (!mockRpcEnabled) {
  jest.setTimeout(15000);
}

test('load native program', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const from = await newAccountWithDif(connection, 1024);
  const programId = await NativeControllerLoader.load(
    connection,
    from,
    'bitconch_noop_program',
  );
  const transaction = new Transaction().add({
    keys: [{pubkey: from.publicKey, isSigner: true}],
    programId,
  });

  await sendAndConfmTxn(connection, transaction, from);
});
