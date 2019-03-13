//@flow

import {testnetDefaultChannel} from '../../package.json';

/**
 * @private
 */
const endpoint = {
  nightly: 'https://nightly.bitconch.io/api',
  beta: 'https://beta.bitconch.io/api',
  stable: 'https://stable.bitconch.io/api',
};

/**
 * Retrieves the RPC endpoint URL for the specified testnet build 
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
