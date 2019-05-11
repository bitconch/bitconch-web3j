// @flow
import {testnetChannelEndpoint} from '../src/util/testnet';

test('invalid', () => {
  expect(() => {
    testnetChannelEndpoint('abc123');
  }).toThrow();
});

test('nightly', () => {
  expect(testnetChannelEndpoint('nightly')).toEqual(
    'https://api.nightly.bitconch.io',
  );
});

test('default', () => {
  testnetChannelEndpoint(); // Should not throw
});
