// @flow
import {BusAccount, Connection, BpfControllerLoader, ControllerLoader, SystemController} from '../src';
import {DEFAULT_TICKS_PER_SLOT, NUM_TICKS_PER_SEC} from '../src/timing';
import {mockRpc, mockRpcEnabled} from './__mocks__/node-fetch';
import {mockGetRecentBlockhash} from './mockrpc/get-recent-blockhash';
import {url} from './url';
import {sleep} from '../src/util/sleep';

if (!mockRpcEnabled) {
  // The default of 5 seconds is too slow for live testing sometimes
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

test('fullnodeQuit', async () => {
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

test('get slot leader', async () => {
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

  const slotLeader = await connection.fetchRoundLeader();
  if (mockRpcEnabled) {
    expect(slotLeader).toBe('11111111111111111111111111111111');
  } else {
    // No idea what the correct slotLeader value should be on a live cluster, so
    // just check the type
    expect(typeof slotLeader).toBe('string');
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
          pubkey: '11111111111111111111111111111111',
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
    expect(clusterNodes[0].pubkey).toBe('11111111111111111111111111111111');
    expect(typeof clusterNodes[0].gossip).toBe('string');
    expect(typeof clusterNodes[0].tpu).toBe('string');
    expect(clusterNodes[0].rpc).toBeNull();
  } else {
    // There should be at least one node (the node that we're talking to)
    expect(clusterNodes.length).toBeGreaterThan(0);
  }
});

test('getEpochVoteAccounts', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const voteAccounts = await connection.getEpochVoteAccounts();
  expect(voteAccounts.length).toBeGreaterThan(0);
});

test('confirm transaction - error', () => {
  const connection = new Connection(url);

  const badTransactionSignature = 'bad transaction signature';

  mockRpc.push([
    url,
    {
      method: 'confirmTxn',
      params: [badTransactionSignature],
    },
    errorResponse,
  ]);

  expect(
    connection.confmTxn(badTransactionSignature),
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

test('get total supply', async () => {
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getTotalSupply',
      params: [],
    },
    {
      error: null,
      result: 1000000,
    },
  ]);

  const count = await connection.getTotalSupply();
  expect(count).toBeGreaterThanOrEqual(0);
});

test('get recent blockhash', async () => {
  const connection = new Connection(url);

  mockGetRecentBlockhash();

  const [
    recentPackagehash,
    feeCalculator,
  ] = await connection.fetchRecentBlockhash();
  expect(recentPackagehash.length).toBeGreaterThanOrEqual(43);
  expect(feeCalculator.lamportsPerSignature).toBeGreaterThanOrEqual(0);
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
        difs: 42,
        data: [],
        executable: false,
      },
    },
  ]);

  const fetchAccountDetail = await connection.fetchAccountDetail(account.pubKey);
  expect(fetchAccountDetail.difs).toBe(42);
  expect(fetchAccountDetail.data).toHaveLength(0);
  expect(fetchAccountDetail.owner).toEqual(SystemController.controllerId);
});

test('transaction', async () => {
  const accountFrom = new BusAccount();
  const accountTo = new BusAccount();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'requestDif',
      params: [accountFrom.pubKey.toBase58(), 100010],
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
      result: 100010,
    },
  ]);
  await connection.reqDrone(accountFrom.pubKey, 100010);
  expect(await connection.fetchAccountBalance(accountFrom.pubKey)).toBe(100010);

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
  const signature = await connection.sendTxn(transaction, accountFrom);

  mockRpc.push([
    url,
    {
      method: 'confirmTxn',
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
    console.log('not confirmed', signature);
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

  // accountFrom may have less than 100000 due to transaction fees
  const balance = await connection.fetchAccountBalance(accountFrom.pubKey);
  expect(balance).toBeGreaterThan(0);
  expect(balance).toBeLessThanOrEqual(100000);

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

  await connection.reqDrone(accountFrom.pubKey, 100000);
  expect(await connection.fetchAccountBalance(accountFrom.pubKey)).toBe(100000);

  await connection.reqDrone(accountTo.pubKey, 21);
  expect(await connection.fetchAccountBalance(accountTo.pubKey)).toBe(21);

  // 1. Move(accountFrom, accountTo)
  // 2. Move(accountTo, accountFrom)
  const transaction = SystemController.transfer(
    accountFrom.pubKey,
    accountTo.pubKey,
    100,
  ).add(
    SystemController.transfer(accountTo.pubKey, accountFrom.pubKey, 100),
  );
  const signature = await connection.sendTxn(
    transaction,
    accountFrom,
    accountTo,
  );
  let i = 0;
  for (;;) {
    if (await connection.confmTxn(signature)) {
      break;
    }

    expect(mockRpcEnabled).toBe(false);
    expect(++i).toBeLessThan(10);
    await sleep(500);
  }
  await expect(connection.fetchSignatureState(signature)).resolves.toEqual({
    Ok: null,
  });

  // accountFrom may have less than 100000 due to transaction fees
  expect(await connection.fetchAccountBalance(accountFrom.pubKey)).toBeGreaterThan(0);
  expect(
    await connection.fetchAccountBalance(accountFrom.pubKey),
  ).toBeLessThanOrEqual(100000);

  expect(await connection.fetchAccountBalance(accountTo.pubKey)).toBe(21);
});

test('account change notification', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = new BusAccount();
  const programAccount = new BusAccount();

  const mockCallback = jest.fn();

  const subscriptionId = connection.onAccountChange(
    programAccount.pubKey,
    mockCallback,
  );

  await connection.reqDrone(owner.pubKey, 100000);
  await ControllerLoader.load(connection, owner, programAccount, BpfControllerLoader.controllerId, [
    1,
    2,
    3,
  ]);

  // Wait for mockCallback to receive a call
  let i = 0;
  for (;;) {
    if (mockCallback.mock.calls.length > 0) {
      break;
    }

    if (++i === 30) {
      throw new Error('BusAccount change notification not observed');
    }
    // Sleep for a 1/4 of a slot, notifications only occur after a block is
    // processed
    await sleep((250 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SEC);
  }

  await connection.removeListenerOfAccountChange(subscriptionId);

  expect(mockCallback.mock.calls[0][0].difs).toBe(1);
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

  // const mockCallback = jest.fn();

  let notified = false;
  const subscriptionId = connection.onControllerAccountChange(
    BpfControllerLoader.controllerId,
    keyedAccountInfo => {
      if (keyedAccountInfo.accountId !== programAccount.pubKey.toString()) {
        //console.log('Ignoring another account', keyedAccountInfo);
        return;
      }
      expect(keyedAccountInfo.fetchAccountDetail.difs).toBe(1);
      expect(keyedAccountInfo.fetchAccountDetail.owner).toEqual(BpfControllerLoader.controllerId);
      notified = true;
    },
  );

  await connection.reqDrone(owner.pubKey, 100000);
  await ControllerLoader.load(connection, owner, programAccount, BpfControllerLoader.controllerId, [
    1,
    2,
    3,
  ]);

  // Wait for mockCallback to receive a call
  let i = 0;
  while (!notified) {
    //for (;;) {
    if (++i === 30) {
      throw new Error('Program change notification not observed');
    }
    // Sleep for a 1/4 of a slot, notifications only occur after a block is
    // processed
    await sleep((250 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SEC);
  }

  await connection.removeControllerAccountChangeListener(subscriptionId);
});
