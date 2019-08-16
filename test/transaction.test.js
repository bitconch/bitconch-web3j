// @flow
import nacl from 'tweetnacl';

import {BusAccount} from '../src/bus-account';
import {PubKey} from '../src/pubkey';
import {Transaction} from '../src/transaction-controller';
import {SystemController} from '../src/system-controller';

test('signPartial', () => {
  const account1 = new BusAccount();
  const account2 = new BusAccount();
  const recentPackagehash = account1.pubKey.toBase58(); // Fake recentPackagehash
  const transfer = SystemController.transfer(
    account1.pubKey,
    account2.pubKey,
    123,
  );

  const transaction = new Transaction({recentPackagehash}).add(transfer);
  transaction.sign(account1, account2);

  const partialTransaction = new Transaction({recentPackagehash}).add(transfer);
  partialTransaction.signPartial(account1, account2.pubKey);
  expect(partialTransaction.signatures[1].signature).toBeNull();
  partialTransaction.addSigner(account2);

  expect(partialTransaction).toEqual(transaction);
});

test('transfer signatures', () => {
  const account1 = new BusAccount();
  const account2 = new BusAccount();
  const recentPackagehash = account1.pubKey.toBase58(); // Fake recentPackagehash
  const transfer1 = SystemController.transfer(
    account1.pubKey,
    account2.pubKey,
    123,
  );
  const transfer2 = SystemController.transfer(
    account2.pubKey,
    account1.pubKey,
    123,
  );

  const orgTransaction = new Transaction({recentPackagehash}).add(
    transfer1,
    transfer2,
  );
  orgTransaction.sign(account1, account2);

  const newTransaction = new Transaction({
    recentPackagehash: orgTransaction.recentPackagehash,
    signatures: orgTransaction.signatures,
  }).add(transfer1, transfer2);

  expect(newTransaction).toEqual(orgTransaction);
});

test('dedup signatures', () => {
  const account1 = new BusAccount();
  const account2 = new BusAccount();
  const recentPackagehash = account1.pubKey.toBase58(); // Fake recentPackagehash
  const transfer1 = SystemController.transfer(
    account1.pubKey,
    account2.pubKey,
    123,
  );
  const transfer2 = SystemController.transfer(
    account1.pubKey,
    account2.pubKey,
    123,
  );

  const orgTransaction = new Transaction({recentPackagehash}).add(
    transfer1,
    transfer2,
  );
  orgTransaction.sign(account1);
});

test('parse wire format and serialize', () => {
  const keypair = nacl.sign.keyPair.fromSeed(
    Uint8Array.from(Array(32).fill(8)),
  );
  const sender = new BusAccount(Buffer.from(keypair.secretKey)); // Arbitrary known account
  const recentPackagehash = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k'; // Arbitrary known recentPackagehash
  const recipient = new PubKey(
    'J3dxNj7nDRRqRRXuEMynDG57DkZK4jYRuv3Garmb1i99',
  ); // Arbitrary known public key
  const transfer = SystemController.transfer(sender.pubKey, recipient, 49);
  const expectedTransaction = new Transaction({recentPackagehash}).add(transfer);
  expectedTransaction.sign(sender);

  const wireTransaction = Buffer.from([
    1,
    47,
    50,
    66,
    17,
    219,
    90,
    187,
    49,
    40,
    77,
    8,
    58,
    129,
    51,
    76,
    13,
    206,
    126,
    157,
    189,
    188,
    53,
    174,
    42,
    80,
    4,
    4,
    212,
    55,
    67,
    171,
    34,
    224,
    81,
    68,
    230,
    120,
    117,
    204,
    241,
    167,
    152,
    74,
    141,
    132,
    73,
    166,
    217,
    173,
    27,
    75,
    62,
    171,
    160,
    100,
    159,
    116,
    164,
    45,
    185,
    64,
    0,
    72,
    4,
    1,
    0,
    2,
    3,
    19,
    152,
    246,
    44,
    109,
    26,
    69,
    124,
    81,
    186,
    106,
    75,
    95,
    61,
    189,
    47,
    105,
    252,
    169,
    50,
    22,
    33,
    141,
    200,
    153,
    126,
    65,
    107,
    209,
    125,
    147,
    202,
    253,
    67,
    159,
    204,
    182,
    103,
    39,
    242,
    137,
    197,
    198,
    222,
    59,
    196,
    168,
    254,
    93,
    213,
    215,
    119,
    112,
    188,
    143,
    241,
    92,
    62,
    238,
    220,
    177,
    74,
    243,
    252,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    196,
    154,
    231,
    118,
    3,
    120,
    32,
    84,
    241,
    122,
    157,
    236,
    234,
    67,
    180,
    68,
    235,
    160,
    237,
    177,
    44,
    111,
    29,
    49,
    198,
    224,
    228,
    168,
    75,
    240,
    82,
    235,
    1,
    2,
    2,
    0,
    1,
    12,
    2,
    0,
    0,
    0,
    49,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  const tx = Transaction.from(wireTransaction);

  expect(tx).toEqual(expectedTransaction);
  expect(wireTransaction).toEqual(expectedTransaction.serialize());
});
