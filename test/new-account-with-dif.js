// @flow

import {BusAccount, Connection} from '../src';
import {mockRpc} from './__mocks__/node-fetch';
import {url} from './url';

export async function newAccountWithDif(
  connection: Connection,
  difs: number = 1000000,
): Promise<BusAccount> {
  const account = new BusAccount();

  {
    mockRpc.push([
      url,
      {
        method: 'requestDif',
        params: [account.pubKey.toBase58(), difs],
      },
      {
        error: null,
        result:
          '3WE5w4B7v59x6qjyC4FbG2FEKYKQfvsJwqSxNVmtMjT8TQ31hsZieDHcSgqzxiAoTL56n2w5TncjqEKjLhtF4Vk',
      },
    ]);
  }

  await connection.reqDrone(account.pubKey, difs);
  return account;
}
