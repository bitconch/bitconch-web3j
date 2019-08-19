// @flow

import {BusAccount} from '../../src';
import {url} from '../url';
import {mockRpc} from '../__mocks__/node-fetch';

export function mockGetRecentBlockhash() {
  const recentPackagehash = new BusAccount();

  mockRpc.push([
    url,
    {
      method: 'getLatestBlockhash',
      params: [],
    },
    {
      error: null,
      result: [
        recentPackagehash.pubKey.toBase58(),
        {
          lamportsPerSignature: 42,
        },
      ],
    },
  ]);
}
