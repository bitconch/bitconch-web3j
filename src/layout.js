// @flow

import * as BufferLayout from 'buffer-layout';

/**
 * 公钥的布局
 */
export const publicKey = (property: string = 'publicKey'): Object => {
  return BufferLayout.blob(32, property);
};

/**
 * 64位无符号值的布局
 */
export const uint64 = (property: string = 'uint64'): Object => {
  return BufferLayout.blob(8, property);
};

/**
 * Rust String类型的布局
 */
export const rustString = (property: string = 'string') => {
  const rsl = BufferLayout.struct(
    [
      BufferLayout.u32('length'),
      BufferLayout.u32('lengthPadding'),
      BufferLayout.blob(BufferLayout.offset(BufferLayout.u32(), -8), 'chars'),
    ],
    property,
  );
  const _decode = rsl.decode.bind(rsl);
  const _encode = rsl.encode.bind(rsl);

  rsl.decode = (buffer, offset) => {
    const data = _decode(buffer, offset);
    return data.chars.toString('utf8');
  };

  rsl.encode = (str, buffer, offset) => {
    const data = {
      chars: Buffer.from(str, 'utf8'),
    };
    return _encode(data, buffer, offset);
  };

  return rsl;
};
