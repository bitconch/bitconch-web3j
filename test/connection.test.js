// @flow
import {Account, Connection, BpfLoader, Loader, SystemProgram} from '../src';
import {DEFAULT_TICKS_PER_SLOT, NUM_TICKS_PER_SECOND} from '../src/timing';
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
  const account = new Account();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getAccountInfo',
      params: [account.publicKey.toBase58()],
    },
    errorResponse,
  ]);

  expect(connection.getAccountInfo(account.publicKey)).rejects.toThrow(
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
      method: 'fullnodeExit',
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
  const account = new Account();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getBalance',
      params: [account.publicKey.toBase58()],
    },
    {
      error: null,
      result: 0,
    },
  ]);

  const balance = await connection.getBalance(account.publicKey);
  expect(balance).toBeGreaterThanOrEqual(0);
});

test('get slot leader', async () => {
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getSlotLeader',
    },
    {
      error: null,
      result: '11111111111111111111111111111111',
    },
  ]);

  const slotLeader = await connection.getSlotLeader();
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
          id: '11111111111111111111111111111111',
          gossip: '127.0.0.0:1234',
          tpu: '127.0.0.0:1235',
          rpc: null,
        },
      ],
    },
  ]);

  const clusterNodes = await connection.getClusterNodes();
  if (mockRpcEnabled) {
    expect(clusterNodes).toHaveLength(1);
    expect(clusterNodes[0].id).toBe('11111111111111111111111111111111');
    expect(typeof clusterNodes[0].gossip).toBe('string');
    expect(typeof clusterNodes[0].tpu).toBe('string');
    expect(clusterNodes[0].rpc).toBeNull();
  } else {
    // There should be at least one node (the node that we're talking to)
    expect(clusterNodes.length).toBeGreaterThan(0);
  }
});

test('confirm transaction - error', () => {
  const connection = new Connection(url);

  const badTransactionSignature = 'bad transaction signature';

  mockRpc.push([
    url,
    {
      method: 'confirmTransaction',
      params: [badTransactionSignature],
    },
    errorResponse,
  ]);

  expect(
    connection.confirmTransaction(badTransactionSignature),
  ).rejects.toThrow(errorMessage);

  mockRpc.push([
    url,
    {
      method: 'getSignatureStatus',
      params: [badTransactionSignature],
    },
    errorResponse,
  ]);

  expect(
    connection.getSignatureStatus(badTransactionSignature),
  ).rejects.toThrow(errorMessage);
});

test('get transaction count', async () => {
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'getTransactionCount',
      params: [],
    },
    {
      error: null,
      result: 1000000,
    },
  ]);

  const count = await connection.getTransactionCount();
  expect(count).toBeGreaterThanOrEqual(0);
});

test('get recent blockhash', async () => {
  const connection = new Connection(url);

  mockGetRecentBlockhash();

  const recentBlockhash = await connection.getRecentBlockhash();
  expect(recentBlockhash.length).toBeGreaterThanOrEqual(43);
});

test('request airdrop', async () => {
  const account = new Account();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'requestAirdrop',
      params: [account.publicKey.toBase58(), 40],
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
      method: 'requestAirdrop',
      params: [account.publicKey.toBase58(), 2],
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
      method: 'getBalance',
      params: [account.publicKey.toBase58()],
    },
    {
      error: null,
      result: 42,
    },
  ]);

  await connection.requestAirdrop(account.publicKey, 40);
  await connection.requestAirdrop(account.publicKey, 2);

  const balance = await connection.getBalance(account.publicKey);
  expect(balance).toBe(42);

  mockRpc.push([
    url,
    {
      method: 'getAccountInfo',
      params: [account.publicKey.toBase58()],
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

  const accountInfo = await connection.getAccountInfo(account.publicKey);
  // expect(accountInfo.lamports).toBe(42);
  expect(accountInfo.dif).toBe(42);
  expect(accountInfo.data).toHaveLength(0);
  expect(accountInfo.owner).toEqual(SystemProgram.programId);
});

test('transaction', async () => {
  const accountFrom = new Account();
  const accountTo = new Account();
  const connection = new Connection(url);

  mockRpc.push([
    url,
    {
      method: 'requestAirdrop',
      params: [accountFrom.publicKey.toBase58(), 12],
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
      method: 'getBalance',
      params: [accountFrom.publicKey.toBase58()],
    },
    {
      error: null,
      result: 12,
    },
  ]);
  await connection.requestAirdrop(accountFrom.publicKey, 12);
  expect(await connection.getBalance(accountFrom.publicKey)).toBe(12);

  mockRpc.push([
    url,
    {
      method: 'requestAirdrop',
      params: [accountTo.publicKey.toBase58(), 21],
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
      method: 'getBalance',
      params: [accountTo.publicKey.toBase58()],
    },
    {
      error: null,
      result: 21,
    },
  ]);
  await connection.requestAirdrop(accountTo.publicKey, 21);
  expect(await connection.getBalance(accountTo.publicKey)).toBe(21);

  mockGetRecentBlockhash();
  mockRpc.push([
    url,
    {
      method: 'sendTransaction',
    },
    {
      error: null,
      result:
        '3WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
    },
  ]);

  const transaction = SystemProgram.transfer(
    accountFrom.publicKey,
    accountTo.publicKey,
    10,
  );
  const signature = await connection.sendTransaction(transaction, accountFrom);

  mockRpc.push([
    url,
    {
      method: 'confirmTransaction',
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
    if (await connection.confirmTransaction(signature)) {
      break;
    }

    expect(mockRpcEnabled).toBe(false);
    expect(++i).toBeLessThan(10);
    await sleep(500);
  }

  mockRpc.push([
    url,
    {
      method: 'getSignatureStatus',
      params: [
        '3WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
      ],
    },
    {
      error: null,
      result: {Ok: null},
    },
  ]);
  await expect(connection.getSignatureStatus(signature)).resolves.toEqual({
    Ok: null,
  });

  mockRpc.push([
    url,
    {
      method: 'getBalance',
      params: [accountFrom.publicKey.toBase58()],
    },
    {
      error: null,
      result: 2,
    },
  ]);

  // accountFrom may have less than 2 due to transaction fees
  const balance = await connection.getBalance(accountFrom.publicKey);
  expect(balance).toBeGreaterThan(0);
  expect(balance).toBeLessThanOrEqual(2);

  mockRpc.push([
    url,
    {
      method: 'getBalance',
      params: [accountTo.publicKey.toBase58()],
    },
    {
      error: null,
      result: 31,
    },
  ]);
  expect(await connection.getBalance(accountTo.publicKey)).toBe(31);
});

test('multi-instruction transaction', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const accountFrom = new Account();
  const accountTo = new Account();
  const connection = new Connection(url);

  await connection.requestAirdrop(accountFrom.publicKey, 12);
  expect(await connection.getBalance(accountFrom.publicKey)).toBe(12);

  await connection.requestAirdrop(accountTo.publicKey, 21);
  expect(await connection.getBalance(accountTo.publicKey)).toBe(21);

  // 1. Move(accountFrom, accountTo)
  // 2. Move(accountTo, accountFrom)
  const transaction = SystemProgram.transfer(
    accountFrom.publicKey,
    accountTo.publicKey,
    10,
  ).add(SystemProgram.transfer(accountTo.publicKey, accountFrom.publicKey, 10));
  const signature = await connection.sendTransaction(
    transaction,
    accountFrom,
    accountTo,
  );
  let i = 0;
  for (;;) {
    if (await connection.confirmTransaction(signature)) {
      break;
    }

    expect(mockRpcEnabled).toBe(false);
    expect(++i).toBeLessThan(10);
    await sleep(500);
  }
  await expect(connection.getSignatureStatus(signature)).resolves.toEqual({
    Ok: null,
  });

  // accountFrom may have less than 12 due to transaction fees
  expect(await connection.getBalance(accountFrom.publicKey)).toBeGreaterThan(0);
  expect(
    await connection.getBalance(accountFrom.publicKey),
  ).toBeLessThanOrEqual(12);

  expect(await connection.getBalance(accountTo.publicKey)).toBe(21);
});

test('account change notification', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = new Account();
  const programAccount = new Account();

  const mockCallback = jest.fn();

  const subscriptionId = connection.onAccountChange(
    programAccount.publicKey,
    mockCallback,
  );

  await connection.requestAirdrop(owner.publicKey, 42);
  await Loader.load(connection, owner, programAccount, BpfLoader.programId, [
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
      throw new Error('Account change notification not observed');
    }
    // Sleep for a 1/4 of a slot, notifications only occur after a block is
    // processed
    await sleep((250 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SECOND);
  }

  await connection.removeAccountChangeListener(subscriptionId);

  // expect(mockCallback.mock.calls[0][0].lamports).toBe(1);
  expect(mockCallback.mock.calls[0][0].dif).toBe(1);
  expect(mockCallback.mock.calls[0][0].owner).toEqual(BpfLoader.programId);
});

test('program account change notification', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = new Account();
  const programAccount = new Account();

  // const mockCallback = jest.fn();

  let notified = false;
  const subscriptionId = connection.onProgramAccountChange(
    BpfLoader.programId,
    keyedAccountInfo => {
      if (keyedAccountInfo.accountId !== programAccount.publicKey.toString()) {
        //console.log('Ignoring another account', keyedAccountInfo);
        return;
      }
      // expect(keyedAccountInfo.accountInfo.lamports).toBe(1);
      expect(keyedAccountInfo.accountInfo.dif).toBe(1);
      expect(keyedAccountInfo.accountInfo.owner).toEqual(BpfLoader.programId);
      notified = true;
    },
  );

  await connection.requestAirdrop(owner.publicKey, 42);
  await Loader.load(connection, owner, programAccount, BpfLoader.programId, [
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
    await sleep((250 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SECOND);
  }

  await connection.removeProgramAccountChangeListener(subscriptionId);
});
