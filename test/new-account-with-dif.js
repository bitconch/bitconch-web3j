// @flow

import {Account, Connection} from '../src';
import {mockRpc} from './__mocks__/node-fetch';
import {url} from './url';

export async function newAccountWithDif(
  connection: Connection,
  // lamports: number = 1000000,
  dif: number = 1000000,
): Promise<Account> {
  const account = new Account();

  {
    mockRpc.push([
      url,
      {
        method: 'requestAirdrop',
        // params: [account.publicKey.toBase58(), lamports],
        params: [account.publicKey.toBase58(), dif],
      },
      {
        error: null,
        // Signature doesn't matter
        result:
          '3WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
      },
    ]);
  }

  // await connection.requestAirdrop(account.publicKey, lamports);
  await connection.requestAirdrop(account.publicKey, dif);
  return account;
}
