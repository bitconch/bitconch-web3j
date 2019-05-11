// @flow
import {Account} from '../src/account';
import {PublicKey} from '../src/publickey';

test('generate new account', () => {
  const account = new Account();
  expect(PublicKey.isPublicKey(account.publicKey)).toBeTruthy();
  expect(account.secretKey).toHaveLength(64);
});
//测试公钥
test('account from secret key', () => {
  const secretKey = Buffer.from([
    213,
    22,
    19,
    19,
    245,
    131,
    144,
    162,
    33,
    71,
    146,
    183,
    207,
    223,
    173,
    87,
    193,
    63,
    159,
    23,
    90,
    37,
    37,
    187,
    146,
    146,
    224,
    173,
    94,
    42,
    16,
    140,
    27,
    47,
    73,
    9,
    110,
    62,
    93,
    189,
    15,
    127,
    193,
    121,
    92,
    105,
    146,
    117,
    171,
    59,
    33,
    84,
    75,
    52,
    123,
    121,
    74,
    101,
    127,
    149,
    145,
    159,
    153,
    34,
  ]);
  const account = new Account(secretKey);
  expect(account.publicKey.toBase58()).toBe(
    '2q7pyhPwAwZ3NhwWRPM9NGWrGmEpWiBHL3MCCco9nSqw',
  );
});
