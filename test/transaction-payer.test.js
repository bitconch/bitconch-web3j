// @flow
import {BusAccount, Connection, SystemController} from '../src';
import {mockRpc, mockRpcEnabled} from './__mocks__/node-fetch';
import {mockGetRecentBlockhash} from './mockrpc/get-recent-blockhash';
import {url} from './url';
import {sleep} from '../src/util/sleep';

if (!mockRpcEnabled) {
  // The default of 5 seconds is too slow for live testing sometimes
  jest.setTimeout(30000);
}

test('transaction-payer', async () => {
  const accountPayer = new BusAccount();
  const accountFrom = new BusAccount();
  const accountTo = new BusAccount();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'requestDif',
      params: [accountPayer.pubKey.toBase58(), 100],
    },
    {
      error: null,
      result:
        '0WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
    },
  ]);
  await connection.reqDrone(accountPayer.pubKey, 100);

  mockRpc.push([
    url,
    {
      method: 'requestDif',
      params: [accountFrom.pubKey.toBase58(), 12],
    },
    {
      error: null,
      result:
        '0WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
    },
  ]);
  await connection.reqDrone(accountFrom.pubKey, 12);

  mockRpc.push([
    url,
    {
      method: 'requestDif',
      params: [accountTo.pubKey.toBase58(), 21],
    },
    {
      error: null,
      result:
        '8WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
    },
  ]);
  await connection.reqDrone(accountTo.pubKey, 21);

  mockGetRecentBlockhash();
  mockRpc.push([
    url,
    {
      method: 'sendTxn',
    },
    {
      error: null,
      result:
        '3WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
    },
  ]);

  const transaction = SystemController.transfer(
    accountFrom.pubKey,
    accountTo.pubKey,
    10,
  );

  const signature = await connection.sendTxn(
    transaction,
    accountPayer,
    accountFrom,
  );

  mockRpc.push([
    url,
    {
      method: 'confmTxn',
      params: [
        '3WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
      ],
    },
    {
      error: null,
      result: true,
    },
  ]);

  let i = 0;
  for (;;) {
    if (await connection.confmTxn(signature)) {
      break;
    }

    expect(mockRpcEnabled).toBe(false);
    expect(++i).toBeLessThan(10);
    await sleep(500);
  }

  mockRpc.push([
    url,
    {
      method: 'getSignatureState',
      params: [
        '3WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
      ],
    },
    {
      error: null,
      result: {Ok: null},
    },
  ]);
  await expect(connection.fetchSignatureState(signature)).resolves.toEqual({
    Ok: null,
  });

  mockRpc.push([
    url,
    {
      method: 'getDif',
      params: [accountPayer.pubKey.toBase58()],
    },
    {
      error: null,
      result: 99,
    },
  ]);

  // accountPayer could be less than 100 as it paid for the transaction
  // (exact amount less depends on the current cluster fees)
  const balance = await connection.fetchAccountBalance(accountPayer.pubKey);
  expect(balance).toBeGreaterThan(0);
  expect(balance).toBeLessThanOrEqual(100);

  // accountFrom should have exactly 2, since it didn't pay for the transaction
  mockRpc.push([
    url,
    {
      method: 'getDif',
      params: [accountFrom.pubKey.toBase58()],
    },
    {
      error: null,
      result: 2,
    },
  ]);
  expect(await connection.fetchAccountBalance(accountFrom.pubKey)).toBe(2);
});
