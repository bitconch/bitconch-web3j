// @flow

import {Connection, PubKey, Token, TokenCount} from '../src';
import {SYSTEM_TOKEN_CONTROLLER_ID} from '../src/token-controller';
import {mockRpc, mockRpcEnabled} from './__mocks__/node-fetch';
import {url} from './url';
import {newAccountWithLamports} from './new-account-with-lamports';
import {mockGetRecentBlockhash} from './mockrpc/get-recent-blockhash';
import {sleep} from '../src/util/sleep';

// The default of 5 seconds is too slow for live testing sometimes
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

// A token created by the first test and used by all subsequent tests
let testToken: Token;

// Initial owner of the token supply
let initialOwner;
let initialOwnerTokenAccount: PubKey;

test('create new token', async () => {
  const connection = new Connection(url);
  connection._disableBlockhashCaching = mockRpcEnabled;

  initialOwner = await newAccountWithLamports(connection, 1024);

  {
    // mock SystemController.createNewAccount transaction for Token.createNewToken()
    mockGetRecentBlockhash();
    mockSendTransaction();
    mockGetSignatureStatus();

    // mock Token.createNewAccount() transaction
    mockSendTransaction();
    mockGetSignatureStatus(null);
    mockGetSignatureStatus();

    // mock SystemController.createNewAccount transaction for Token.createNewToken()
    mockSendTransaction();
    mockGetSignatureStatus();

    // mock Token.createNewToken() transaction
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
    // mock Token.fetchTokenDetail()'s fetchAccountDetail
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
          lamports: 1,
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

  const fetchTokenDetail = await testToken.fetchTokenDetail();

  expect(fetchTokenDetail.supply.toNumber()).toBe(10000);
  expect(fetchTokenDetail.decimals).toBe(2);
  expect(fetchTokenDetail.name).toBe('Test token');
  expect(fetchTokenDetail.symbol).toBe('TEST');

  {
    // mock Token.fetchAccountDetail()'s fetchAccountDetail
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
          lamports: 1,
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

  const fetchAccountDetail = await testToken.fetchAccountDetail(initialOwnerTokenAccount);

  expect(fetchAccountDetail.token.equals(testToken.token)).toBe(true);
  expect(fetchAccountDetail.owner.equals(initialOwner.pubKey)).toBe(true);
  expect(fetchAccountDetail.amount.toNumber()).toBe(10000);
  expect(fetchAccountDetail.source).toBe(null);
  expect(fetchAccountDetail.originalAmount.toNumber()).toBe(0);
});

test('create new token account', async () => {
  const connection = new Connection(url);
  connection._disableBlockhashCaching = mockRpcEnabled;
  const destOwner = await newAccountWithLamports(connection);

  {
    // mock SystemController.createNewAccount transaction for Token.createNewAccount()
    mockSendTransaction();
    mockGetSignatureStatus();

    // mock Token.createNewAccount() transaction
    mockSendTransaction();
    mockGetSignatureStatus();
  }

  const dest = await testToken.createNewAccount(destOwner);
  {
    // mock Token.fetchAccountDetail()'s fetchAccountDetail
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
          lamports: 1,
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

  const fetchAccountDetail = await testToken.fetchAccountDetail(dest);

  expect(fetchAccountDetail.token.equals(testToken.token)).toBe(true);
  expect(fetchAccountDetail.owner.equals(destOwner.pubKey)).toBe(true);
  expect(fetchAccountDetail.amount.toNumber()).toBe(0);
  expect(fetchAccountDetail.source).toBe(null);
});

test('transfer', async () => {
  const connection = new Connection(url);
  connection._disableBlockhashCaching = mockRpcEnabled;
  const destOwner = await newAccountWithLamports(connection);

  {
    // mock SystemController.createNewAccount transaction for Token.createNewAccount()
    mockSendTransaction();
    mockGetSignatureStatus();

    // mock Token.createNewAccount() transaction
    mockSendTransaction();
    mockGetSignatureStatus();
  }

  const dest = await testToken.createNewAccount(destOwner);

  {
    // mock Token.transfer()'s fetchAccountDetail
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
          lamports: 1,
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

    // mock Token.transfer() transaction
    mockSendTransaction();
    mockGetSignatureStatus();
  }

  await testToken.transfer(initialOwner, initialOwnerTokenAccount, dest, 123);

  {
    // mock Token.fetchAccountDetail()'s fetchAccountDetail
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
          lamports: 1,
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
  const delegateOwner = await newAccountWithLamports(connection);

  {
    // mock SystemController.createNewAccount transaction for Token.createNewAccount()
    mockSendTransaction();
    mockGetSignatureStatus();

    // mock Token.createNewAccount() transaction
    mockSendTransaction();
    mockGetSignatureStatus();
  }
  const delegate = await testToken.createNewAccount(
    delegateOwner,
    initialOwnerTokenAccount,
  );

  {
    // mock Token.approve() transaction
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
    // mock Token.fetchAccountDetail()'s fetchAccountDetail
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
          lamports: 1,
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
    // mock Token.revoke() transaction
    mockSendTransaction();
    mockGetSignatureStatus();
  }

  await testToken.revoke(initialOwner, initialOwnerTokenAccount, delegate);

  {
    // mock Token.fetchAccountDetail()'s fetchAccountDetail
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
          lamports: 1,
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
  const owner = await newAccountWithLamports(connection);

  const account1 = await testToken.createNewAccount(owner);
  const account1Delegate = await testToken.createNewAccount(owner, account1);
  const account2 = await testToken.createNewAccount(owner);

  // account2 is not a delegate account of account1
  await expect(
    testToken.approve(owner, account1, account2, 123),
  ).rejects.toThrow();

  // account1Delegate is not a delegate account of account2
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
  const owner = await newAccountWithLamports(connection);

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
  const owner = await newAccountWithLamports(connection);
  const newOwner = await newAccountWithLamports(connection);

  const account = await testToken.createNewAccount(owner);

  await testToken.setOwner(owner, account, newOwner.pubKey);
  await expect(
    testToken.setOwner(owner, account, newOwner.pubKey),
  ).rejects.toThrow();

  await testToken.setOwner(newOwner, account, owner.pubKey);
});
