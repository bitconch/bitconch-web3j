// @flow

import fs from 'mz/fs';

import {
  Connection,
  BpfControllerLoader,
  Transaction,
  sendAndConfmTxn,
} from '../src';
import {mockRpcEnabled} from './__mocks__/node-fetch';
import {url} from './url';
import {newAccountWithDif} from './new-account-with-dif';

if (!mockRpcEnabled) {
  jest.setTimeout(30000);
}

test('load BPF program', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const from = await newAccountWithDif(connection, 1024);
  const data = await fs.readFile('test/fixtures/noop/noop.so');
  const programId = await BpfControllerLoader.load(connection, from, data);
  const transaction = new Transaction().add({
    keys: [{pubkey: from.publicKey, isSigner: true}],
    programId,
  });
  await sendAndConfmTxn(connection, transaction, from);
});
