// @flow
import {testnetChannelEndpoint} from '../src/util/testnet';

test('invalid', () => {
  expect(() => {
    testnetChannelEndpoint('abc123');
  }).toThrow();
});

test('nightly', () => {
  expect(testnetChannelEndpoint('edge')).toEqual(
    'https://api.bitconch.io/nightlys',
  );
});

test('default', () => {
  testnetChannelEndpoint(); // Should not throw
});
