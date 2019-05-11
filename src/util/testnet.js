//@flow

import {testnetDefaultChannel} from '../../package.json';

/**
 * @private
 */
const endpoint = {
  nightly: 'https://api.nightly.bitconch.io',
  beta: 'https://api.beta.bitconch.io',
  stable: 'https://api.stable.bitconch.io',
};

/**
 * 检索指定的testnet发布通道的RPC终结点URL
 */
export function testnetChannelEndpoint(channel?: string): string {
  if (!channel) {
    return endpoint[testnetDefaultChannel];
  }

  if (endpoint[channel]) {
    return endpoint[channel];
  }
  throw new Error(`Unknown channel: ${channel}`);
}
