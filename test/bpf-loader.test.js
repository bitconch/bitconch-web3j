// @flow

import fs from 'mz/fs';

import {
  Connection,
  BpfControllerLoader,
  Transaction,
  sendAndconfmTx,
} from '../src';
import {mockRpcEnabled} from './__mocks__/node-fetch';
import {url} from './url';
import {newAccountWithDif} from './new-account-with-dif';

if (!mockRpcEnabled) {
  // The default of 5 seconds is too slow for live testing sometimes
  jest.setTimeout(120000);
}

test('load BPF C controller', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const from = await newAccountWithDif(connection, 1024);
  const data = await fs.readFile('test/fixtures/noop-c/noop.so');
  const controllerId = await BpfControllerLoader.load(connection, from, data);
  const transaction = new Transaction().add({
    keys: [{pubkey: from.pubKey, isSigner: true, isDebitable: true}],
    controllerId,
  });
  await sendAndconfmTx(connection, transaction, from);
});

test('load BPF Rust controller', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const from = await newAccountWithDif(connection, 100000);
  const data = await fs.readFile(
    'test/fixtures/noop-rust/solana_bpf_rust_noop.so',
  );
  const controllerId = await BpfControllerLoader.load(connection, from, data);
  const transaction = new Transaction().add({
    keys: [{pubkey: from.pubKey, isSigner: true, isDebitable: true}],
    controllerId,
  });
  await sendAndconfmTx(connection, transaction, from);
});
