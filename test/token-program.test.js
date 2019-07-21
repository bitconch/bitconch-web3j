// @flow

import {Connection, PubKey, Token, TokenCount} from '../src';
import {SYSTEM_TOKEN_CONTROLLER_ID} from '../src/token-controller';
import {mockRpc, mockRpcEnabled} from './__mocks__/node-fetch';
import {url} from './url';
import {newAccountWithDif} from './new-account-with-dif';
import {mockGetRecentBlockhash} from './mockrpc/get-recent-blockhash';
import {sleep} from '../src/util/sleep';

jest.setTimeout(60000);

function mockGetSignatureStatus(result: Object = {Ok: null}) {
  mockRpc.push([
    url,
    {
      method: 'getSignatureState',
    },
    {
      error: null,
      result,
    },
  ]);
}
function mockSendTransaction() {
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
}

let testToken: Token;

let initialOwner;
let initialOwnerTokenAccount: PubKey;

test('create new token', async () => {
  const connection = new Connection(url);
  connection._disableBlockhashCaching = mockRpcEnabled;

  initialOwner = await newAccountWithDif(connection, 1024);

  {
    mockGetRecentBlockhash();
    mockSendTransaction();
    mockGetSignatureStatus();

    mockSendTransaction();
    mockGetSignatureStatus(null);
    mockGetSignatureStatus();

    mockSendTransaction();
    mockGetSignatureStatus();

    mockSendTransaction();
    mockGetSignatureStatus(null);
    mockGetSignatureStatus();
  }

  [testToken, initialOwnerTokenAccount] = await Token.createNewToken(
    connection,
    initialOwner,
    new TokenCount(10000),
    'Test token',
    'TEST',
    2,
  );

  {
    mockRpc.push([
      url,
      {
        method: 'getAccountInfo',
        params: [testToken.token.toBase58()],
      },
      {
        error: null,
        result: {
          owner: [...SYSTEM_TOKEN_CONTROLLER_ID.toBuffer()],
          dif: 1,
          data: [
            1,
            16,
            39,
            0,
            0,
            0,
            0,
            0,
            0,
            2,
            10,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            84,
            101,
            115,
            116,
            32,
            116,
            111,
            107,
            101,
            110,
            4,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            84,
            69,
            83,
            84,
          ],
          executable: false,
        },
      },
    ]);
  }

  const tokenInfo = await testToken.fetchTokenDetail();

  expect(tokenInfo.supply.toNumber()).toBe(10000);
  expect(tokenInfo.decimals).toBe(2);
  expect(tokenInfo.name).toBe('Test token');
  expect(tokenInfo.symbol).toBe('TEST');

  {
    mockRpc.push([
      url,
      {
        method: 'getAccountInfo',
        params: [initialOwnerTokenAccount.toBase58()],
      },
      {
        error: null,
        result: {
          owner: [...SYSTEM_TOKEN_CONTROLLER_ID.toBuffer()],
          dif: 1,
          data: [
            2,
            ...testToken.token.toBuffer(),
            ...initialOwner.pubKey.toBuffer(),
            16,
            39,
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
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          executable: false,
        },
      },
    ]);
  }

  const accountInfo = await testToken.fetchAccountDetail(initialOwnerTokenAccount);

  expect(accountInfo.token.equals(testToken.token)).toBe(true);
  expect(accountInfo.owner.equals(initialOwner.pubKey)).toBe(true);
  expect(accountInfo.amount.toNumber()).toBe(10000);
  expect(accountInfo.source).toBe(null);
  expect(accountInfo.originalAmount.toNumber()).toBe(0);
});

test('create new token account', async () => {
  const connection = new Connection(url);
  connection._disableBlockhashCaching = mockRpcEnabled;
  const destOwner = await newAccountWithDif(connection);

  {
    mockSendTransaction();
    mockGetSignatureStatus();

    mockSendTransaction();
    mockGetSignatureStatus();
  }

  const dest = await testToken.createNewAccount(destOwner);
  {
    mockRpc.push([
      url,
      {
        method: 'getAccountInfo',
        params: [dest.toBase58()],
      },
      {
        error: null,
        result: {
          owner: [...SYSTEM_TOKEN_CONTROLLER_ID.toBuffer()],
          dif: 1,
          data: [
            2,
            ...testToken.token.toBuffer(),
            ...destOwner.pubKey.toBuffer(),
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
          executable: false,
        },
      },
    ]);
  }

  const accountInfo = await testToken.fetchAccountDetail(dest);

  expect(accountInfo.token.equals(testToken.token)).toBe(true);
  expect(accountInfo.owner.equals(destOwner.pubKey)).toBe(true);
  expect(accountInfo.amount.toNumber()).toBe(0);
  expect(accountInfo.source).toBe(null);
});

test('transfer', async () => {
  const connection = new Connection(url);
  connection._disableBlockhashCaching = mockRpcEnabled;
  const destOwner = await newAccountWithDif(connection);

  {
    mockSendTransaction();
    mockGetSignatureStatus();

    mockSendTransaction();
    mockGetSignatureStatus();
  }

  const dest = await testToken.createNewAccount(destOwner);

  {
    mockRpc.push([
      url,
      {
        method: 'getAccountInfo',
        params: [initialOwnerTokenAccount.toBase58()],
      },
      {
        error: null,
        result: {
          owner: [...SYSTEM_TOKEN_CONTROLLER_ID.toBuffer()],
          dif: 1,
          data: [
            2,
            ...testToken.token.toBuffer(),
            ...initialOwner.pubKey.toBuffer(),
            123,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          executable: false,
        },
      },
    ]);

    mockSendTransaction();
    mockGetSignatureStatus();
  }

  await testToken.transfer(initialOwner, initialOwnerTokenAccount, dest, 123);

  {
    mockRpc.push([
      url,
      {
        method: 'getAccountInfo',
        params: [dest.toBase58()],
      },
      {
        error: null,
        result: {
          owner: [...SYSTEM_TOKEN_CONTROLLER_ID.toBuffer()],
          dif: 1,
          data: [
            2,
            ...testToken.token.toBuffer(),
            ...dest.toBuffer(),
            123,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          executable: false,
        },
      },
    ]);
  }

  await sleep(500);

  const destAccountInfo = await testToken.fetchAccountDetail(dest);
  expect(destAccountInfo.amount.toNumber()).toBe(123);
});

test('approve/revoke', async () => {
  const connection = new Connection(url);
  connection._disableBlockhashCaching = mockRpcEnabled;
  const delegateOwner = await newAccountWithDif(connection);

  {
    mockSendTransaction();
    mockGetSignatureStatus();

    mockSendTransaction();
    mockGetSignatureStatus();
  }
  const delegate = await testToken.createNewAccount(
    delegateOwner,
    initialOwnerTokenAccount,
  );

  {
    mockSendTransaction();
    mockGetSignatureStatus();
  }

  await testToken.approve(
    initialOwner,
    initialOwnerTokenAccount,
    delegate,
    456,
  );

  {
    mockRpc.push([
      url,
      {
        method: 'getAccountInfo',
        params: [delegate.toBase58()],
      },
      {
        error: null,
        result: {
          owner: [...SYSTEM_TOKEN_CONTROLLER_ID.toBuffer()],
          dif: 1,
          data: [
            2,
            ...testToken.token.toBuffer(),
            ...delegate.toBuffer(),
            200,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            ...initialOwnerTokenAccount.toBuffer(),
            200,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          executable: false,
        },
      },
    ]);
  }

  let delegateAccountInfo = await testToken.fetchAccountDetail(delegate);

  expect(delegateAccountInfo.amount.toNumber()).toBe(456);
  expect(delegateAccountInfo.originalAmount.toNumber()).toBe(456);
  if (delegateAccountInfo.source === null) {
    throw new Error('source should not be null');
  } else {
    expect(delegateAccountInfo.source.equals(initialOwnerTokenAccount)).toBe(
      true,
    );
  }

  {
    mockSendTransaction();
    mockGetSignatureStatus();
  }

  await testToken.revoke(initialOwner, initialOwnerTokenAccount, delegate);

  {
    mockRpc.push([
      url,
      {
        method: 'getAccountInfo',
        params: [delegate.toBase58()],
      },
      {
        error: null,
        result: {
          owner: [...SYSTEM_TOKEN_CONTROLLER_ID.toBuffer()],
          dif: 1,
          data: [
            2,
            ...testToken.token.toBuffer(),
            ...delegate.toBuffer(),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            ...initialOwnerTokenAccount.toBuffer(),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          executable: false,
        },
      },
    ]);
  }

  delegateAccountInfo = await testToken.fetchAccountDetail(delegate);
  expect(delegateAccountInfo.amount.toNumber()).toBe(0);
  expect(delegateAccountInfo.originalAmount.toNumber()).toBe(0);
  if (delegateAccountInfo.source === null) {
    throw new Error('source should not be null');
  } else {
    expect(delegateAccountInfo.source.equals(initialOwnerTokenAccount)).toBe(
      true,
    );
  }
});

test('invalid approve', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = await newAccountWithDif(connection);

  const account1 = await testToken.createNewAccount(owner);
  const account1Delegate = await testToken.createNewAccount(owner, account1);
  const account2 = await testToken.createNewAccount(owner);

  await expect(
    testToken.approve(owner, account1, account2, 123),
  ).rejects.toThrow();

  await expect(
    testToken.approve(owner, account2, account1Delegate, 123),
  ).rejects.toThrow();
});

test('fail on approve overspend', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = await newAccountWithDif(connection);

  const account1 = await testToken.createNewAccount(owner);
  const account1Delegate = await testToken.createNewAccount(owner, account1);
  const account2 = await testToken.createNewAccount(owner);

  await testToken.transfer(
    initialOwner,
    initialOwnerTokenAccount,
    account1,
    10,
  );

  await testToken.approve(owner, account1, account1Delegate, 2);

  let delegateAccountInfo = await testToken.fetchAccountDetail(account1Delegate);
  expect(delegateAccountInfo.amount.toNumber()).toBe(2);
  expect(delegateAccountInfo.originalAmount.toNumber()).toBe(2);

  await testToken.transfer(owner, account1Delegate, account2, 1);

  delegateAccountInfo = await testToken.fetchAccountDetail(account1Delegate);
  expect(delegateAccountInfo.amount.toNumber()).toBe(1);
  expect(delegateAccountInfo.originalAmount.toNumber()).toBe(2);

  await testToken.transfer(owner, account1Delegate, account2, 1);

  delegateAccountInfo = await testToken.fetchAccountDetail(account1Delegate);
  expect(delegateAccountInfo.amount.toNumber()).toBe(0);
  expect(delegateAccountInfo.originalAmount.toNumber()).toBe(2);

  await expect(
    testToken.transfer(owner, account1Delegate, account2, 1),
  ).rejects.toThrow();
});

test('set owner', async () => {
  if (mockRpcEnabled) {
    console.log('non-live test skipped');
    return;
  }

  const connection = new Connection(url);
  const owner = await newAccountWithDif(connection);
  const newOwner = await newAccountWithDif(connection);

  const account = await testToken.createNewAccount(owner);

  await testToken.setOwner(owner, account, newOwner.pubKey);
  await expect(
    testToken.setOwner(owner, account, newOwner.pubKey),
  ).rejects.toThrow();

  await testToken.setOwner(newOwner, account, owner.pubKey);
});
