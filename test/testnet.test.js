// @flow
import {testnetChannelEndpoint} from '../src/testnet';

test('invalid', () => {
  expect(() => {
    testnetChannelEndpoint('abc123');
  }).toThrow();
});

test('edge', () => {
  expect(testnetChannelEndpoint('nightly')).toEqual(
    'https://nightly.bitconch.io/api',
  );
});

test('default', () => {
  testnetChannelEndpoint(); // Should not throw
});
