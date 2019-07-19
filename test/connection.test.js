// @flow
import {BusAccount, Connection, BpfControllerLoader, ControllerLoader, SystemController} from '../src';
import {DEFAULT_TICKS_PER_ROUND, NUM_TICKS_PER_SECOND} from '../src/timing';
import {mockRpc, mockRpcEnabled} from './__mocks__/node-fetch';
import {mockGetRecentBlockhash} from './mockrpc/get-recent-blockhash';
import {url} from './url';
import {sleep} from '../src/util/sleep';

if (!mockRpcEnabled) {
  jest.setTimeout(30000);
}

const errorMessage = 'Invalid request';
const errorResponse = {
  error: {
    message: errorMessage,
  },
  result: undefined,
};

test('get account info - error', () => {
  const account = new BusAccount();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getAccountInfo',
      params: [account.pubKey.toBase58()],
    },
    errorResponse,
  ]);

  expect(connection.fetchAccountDetail(account.pubKey)).rejects.toThrow(
    errorMessage,
  );
});

test('fullnodeExit', async () => {
  if (!mockRpcEnabled) {
    console.log('fullnodeExit skipped on live node');
    return;
  }
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'fullnodeQuit',
    },
    {
      error: null,
      result: false,
    },
  ]);

  const result = await connection.fullnodeExit();
  expect(result).toBe(false);
});

test('get balance', async () => {
  const account = new BusAccount();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getDif',
      params: [account.pubKey.toBase58()],
    },
    {
      error: null,
      result: 0,
    },
  ]);

  const balance = await connection.fetchAccountBalance(account.pubKey);
  expect(balance).toBeGreaterThanOrEqual(0);
});

test('get round leader', async () => {
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getRoundLeader',
    },
    {
      error: null,
      result: '11111111111111111111111111111111',
    },
  ]);

  const roundLeader = await connection.fetchRoundLeader();
  if (mockRpcEnabled) {
    expect(roundLeader).toBe('11111111111111111111111111111111');
  } else {
    expect(typeof roundLeader).toBe('string');
  }
});

test('get cluster nodes', async () => {
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getClusterNodes',
    },
    {
      error: null,
      result: [
        {
          id: '11111111111111111111111111111111',
          gossip: '127.0.0.0:1234',
          tpu: '127.0.0.0:1235',
          rpc: null,
        },
      ],
    },
  ]);

  const clusterNodes = await connection.fetchClusterNodes();
  if (mockRpcEnabled) {
    expect(clusterNodes).toHaveLength(1);
    expect(clusterNodes[0].id).toBe('11111111111111111111111111111111');
    expect(typeof clusterNodes[0].gossip).toBe('string');
    expect(typeof clusterNodes[0].tpu).toBe('string');
    expect(clusterNodes[0].rpc).toBeNull();
  } else {
    expect(clusterNodes.length).toBeGreaterThan(0);
  }
});

test('confirm transaction - error', () => {
  const connection = new Connection(url);

  const badTransactionSignature = 'bad transaction signature';

  mockRpc.push([
    url,
    {
      method: 'confmTx',
      params: [badTransactionSignature],
    },
    errorResponse,
  ]);

  expect(
    connection.confmTxRpcRlt(badTransactionSignature),
  ).rejects.toThrow(errorMessage);

  mockRpc.push([
    url,
    {
      method: 'getSignatureState',
      params: [badTransactionSignature],
    },
    errorResponse,
  ]);

  expect(
    connection.fetchSignatureState(badTransactionSignature),
  ).rejects.toThrow(errorMessage);
});

test('get transaction count', async () => {
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getTxnCnt',
      params: [],
    },
    {
      error: null,
      result: 1000000,
    },
  ]);

  const count = await connection.fetchTxnAmount();
  expect(count).toBeGreaterThanOrEqual(0);
});

test('get recent blockhash', async () => {
  const connection = new Connection(url);

  mockGetRecentBlockhash();

  const recentBlockhash = await connection.fetchRecentBlockhash();
  expect(recentBlockhash.length).toBeGreaterThanOrEqual(43);
});

test('request airdrop', async () => {
  const account = new BusAccount();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'requestDif',
      params: [account.pubKey.toBase58(), 40],
    },
    {
      error: null,
      result:
        '1WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
    },
  ]);
  mockRpc.push([
    url,
    {
      method: 'requestDif',
      params: [account.pubKey.toBase58(), 2],
    },
    {
      error: null,
      result:
        '2WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
    },
  ]);
  mockRpc.push([
    url,
    {
      method: 'getDif',
      params: [account.pubKey.toBase58()],
    },
    {
      error: null,
      result: 42,
    },
  ]);

  await connection.reqDrone(account.pubKey, 40);
  await connection.reqDrone(account.pubKey, 2);

  const balance = await connection.fetchAccountBalance(account.pubKey);
  expect(balance).toBe(42);

  mockRpc.push([
    url,
    {
      method: 'getAccountInfo',
      params: [account.pubKey.toBase58()],
    },
    {
      error: null,
      result: {
        owner: [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ],
        // lamports: 42,
        dif: 42,
        data: [],
        executable: false,
      },
    },
  ]);

  const accountInfo = await connection.fetchAccountDetail(account.pubKey);
  expect(accountInfo.dif).toBe(42);
  expect(accountInfo.data).toHaveLength(0);
  expect(accountInfo.owner).toEqual(SystemController.controllerId);
});

test('transaction', async () => {
  const accountFrom = new BusAccount();
  const accountTo = new BusAccount();
  const connection = new Connection(url);

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
  mockRpc.push([
    url,
    {
      method: 'getDif',
      params: [accountFrom.pubKey.toBase58()],
    },
    {
      error: null,
      result: 12,
    },
  ]);
  await connection.reqDrone(accountFrom.pubKey, 12);
  expect(await connection.fetchAccountBalance(accountFrom.pubKey)).toBe(12);

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
  mockRpc.push([
    url,
    {
      method: 'getDif',
      params: [accountTo.pubKey.toBase58()],
    },
    {
      error: null,
      result: 21,
    },
  ]);
  await connection.reqDrone(accountTo.pubKey, 21);
  expect(await connection.fetchAccountBalance(accountTo.pubKey)).toBe(21);

  mockGetRecentBlockhash();
  mockRpc.push([
    url,
    {
      method: 'sendTx',
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
  const signature = await connection.sendTxn(transaction, accountFrom);

  mockRpc.push([
    url,
    {
      method: 'confmTx',
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
    if (await connection.confmTxRpcRlt(signature)) {
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
      params: [accountFrom.pubKey.toBase58()],
    },
    {
      error: null,
      result: 2,
    },
  ]);

  const balance = await connection.fetchAccountBalance(accountFrom.pubKey);
  expect(balance).toBeGreaterThan(0);
  expect(balance).toBeLessThanOrEqual(2);

  mockRpc.push([
    url,
    {
      method: 'getDif',
      params: [accountTo.pubKey.toBase58()],
    },
    {
      error: null,
      result: 31,
    },
  ]);
  expect(await connection.fetchAccountBalance(accountTo.pubKey)).toBe(31);
});

test('multi-instruction transaction', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const accountFrom = new BusAccount();
  const accountTo = new BusAccount();
  const connection = new Connection(url);

  await connection.reqDrone(accountFrom.pubKey, 12);
  expect(await connection.fetchAccountBalance(accountFrom.pubKey)).toBe(12);

  await connection.reqDrone(accountTo.pubKey, 21);
  expect(await connection.fetchAccountBalance(accountTo.pubKey)).toBe(21);

  const transaction = SystemController.transfer(
    accountFrom.pubKey,
    accountTo.pubKey,
    10,
  ).add(SystemController.transfer(accountTo.pubKey, accountFrom.pubKey, 10));
  const signature = await connection.sendTxn(
    transaction,
    accountFrom,
    accountTo,
  );
  let i = 0;
  for (;;) {
    if (await connection.confmTxRpcRlt(signature)) {
      break;
    }

    expect(mockRpcEnabled).toBe(false);
    expect(++i).toBeLessThan(10);
    await sleep(500);
  }
  await expect(connection.fetchSignatureState(signature)).resolves.toEqual({
    Ok: null,
  });

  expect(await connection.fetchAccountBalance(accountFrom.pubKey)).toBeGreaterThan(0);
  expect(
    await connection.fetchAccountBalance(accountFrom.pubKey),
  ).toBeLessThanOrEqual(12);

  expect(await connection.fetchAccountBalance(accountTo.pubKey)).toBe(21);
});

test('account change notification', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = new BusAccount();
  const controllerAccount = new BusAccount();

  const mockCallback = jest.fn();

  const subscriptionId = connection.onAccountChange(
    controllerAccount.pubKey,
    mockCallback,
  );

  await connection.reqDrone(owner.pubKey, 42);
  await ControllerLoader.load(connection, owner, controllerAccount, BpfControllerLoader.controllerId, [
    1,
    2,
    3,
  ]);

  let i = 0;
  for (;;) {
    if (mockCallback.mock.calls.length > 0) {
      break;
    }

    if (++i === 30) {
      throw new Error('Account change notification not observed');
    }
    await sleep((250 * DEFAULT_TICKS_PER_ROUND) / NUM_TICKS_PER_SECOND);
  }

  await connection.removeListenerOfAccountChange(subscriptionId);

  expect(mockCallback.mock.calls[0][0].dif).toBe(1);
  expect(mockCallback.mock.calls[0][0].owner).toEqual(BpfControllerLoader.controllerId);
});

test('program account change notification', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = new BusAccount();
  const programAccount = new BusAccount();


  let notified = false;
  const subscriptionId = connection.onControllerAccountChange(
    BpfControllerLoader.controllerId,
    keyedAccountInfo => {
      if (keyedAccountInfo.accountId !== programAccount.pubKey.toString()) {
        return;
      }
      expect(keyedAccountInfo.accountDetail.dif).toBe(1);
      expect(keyedAccountInfo.accountDetail.owner).toEqual(BpfControllerLoader.controllerId);
      notified = true;
    },
  );

  await connection.reqDrone(owner.pubKey, 42);
  await ControllerLoader.load(connection, owner, programAccount, BpfControllerLoader.controllerId, [
    1,
    2,
    3,
  ]);

  let i = 0;
  while (!notified) {
    if (++i === 30) {
      throw new Error('Program change notification not observed');
    }
    await sleep((250 * DEFAULT_TICKS_PER_ROUND) / NUM_TICKS_PER_SECOND);
  }

  await connection.removeControllerAccountChangeListener(subscriptionId);
});
