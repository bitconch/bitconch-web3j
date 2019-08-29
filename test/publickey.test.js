// @flow
import {PubKey} from '../src/pubkey';

test('invalid', () => {
  expect(() => {
    new PubKey([
      3,
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
    ]);
  }).toThrow();

  expect(() => {
    new PubKey(
      '0x300000000000000000000000000000000000000000000000000000000000000000000',
    );
  }).toThrow();

  expect(() => {
    new PubKey(
      '135693854574979916511997248057056142015550763280047535983739356259273198796800000',
    );
  }).toThrow();
});

test('equals', () => {
  const arrayKey = new PubKey([
    3,
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
  ]);
  const hexKey = new PubKey(
    '0x300000000000000000000000000000000000000000000000000000000000000',
  );
  const base56Key = new PubKey(
    'CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3',
  );

  expect(arrayKey.equals(hexKey)).toBe(true);
  expect(arrayKey.equals(base56Key)).toBe(true);
});

test('isPubKey', () => {
  const key = new PubKey(
    '0x100000000000000000000000000000000000000000000000000000000000000',
  );
  expect(PubKey.isPubKey(key)).toBe(true);
  expect(PubKey.isPubKey({})).toBe(false);
});

test('toBase58', () => {
  const key = new PubKey(
    '0x300000000000000000000000000000000000000000000000000000000000000',
  );
  expect(key.toBase58()).toBe('CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3');
  expect(key.toString()).toBe('CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3');

  const key2 = new PubKey('1111111111111111111111111111BukQL');
  expect(key2.toBase58()).toBe('1111111111111111111111111111BukQL');
  expect(key2.toString()).toBe('1111111111111111111111111111BukQL');

  const key3 = new PubKey('11111111111111111111111111111111');
  expect(key3.toBase58()).toBe('11111111111111111111111111111111');

  const key4 = new PubKey([
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
  ]);
  expect(key4.toBase58()).toBe('11111111111111111111111111111111');
});

test('toBuffer', () => {
  const key = new PubKey(
    '0x300000000000000000000000000000000000000000000000000000000000000',
  );
  expect(key.toBuffer()).toHaveLength(32);
  expect(key.toBase58()).toBe('CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3');

  const key2 = new PubKey(
    '0x000000000000000000000000000000000000000000000000000000000000000',
  );
  expect(key2.toBuffer()).toHaveLength(32);
  expect(key2.toBase58()).toBe('11111111111111111111111111111111');
});

test('equals (II)', () => {
  const key1 = new PubKey([
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
    1,
  ]);
  const key2 = new PubKey(key1.toBuffer());

  expect(key1.equals(key2)).toBe(true);
});
