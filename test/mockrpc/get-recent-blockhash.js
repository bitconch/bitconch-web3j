// @flow

import {BusAccount} from '../../src';
import {url} from '../url';
import {mockRpc} from '../__mocks__/node-fetch';

export function mockGetRecentBlockhash() {
  const recentBlockhash = new BusAccount();

  mockRpc.push([
    url,
    {
      method: 'getLatestBlockhash',
      params: [],
    },
    {
      error: null,
      result: recentBlockhash.pubKey.toBase58(),
    },
  ]);
}
