//@flow

import {testnetDefaultChannel} from '../../package.json';

/**
 * @private
 */
const endpoint = {
  nightly: 'https://api.nightly.bitconch.io',
  beta: 'https://api.beta.testnet.bitconch.com',
  stable: 'https://api.testnet.bitconch.com',
};

/**
 * 
 * 
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
