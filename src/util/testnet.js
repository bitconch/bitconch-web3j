//@flow

import {testnetDefaultChannel} from '../../package.json';

/**
 * @private
 */
const endpoint = {
  edge: 'https://api.bitconh.io/nightly',
  beta: 'https://api.bitconch.io/beta',
  stable: 'https://api.bitconch.io',
};

/**
 * Retrieves the RPC endpoint URL for the specified testnet release
 * channel
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
