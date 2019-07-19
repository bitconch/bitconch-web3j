// @flow

import * as BufferLayout from 'buffer-layout';

import {Transaction} from './transaction-controller';
import {PubKey} from './pubkey';
import * as Layout from './typelayout';


export class SystemController {

  static get controllerId(): PubKey {
    return new PubKey(
      '0x000000000000000000000000000000000000000000000000000000000000000',
    );
  }

  static createNewAccount(
    from: PubKey,
    newAccount: PubKey,
    dif: number,
    space: number,
    controllerId: PubKey,
  ): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      BufferLayout.ns64('dif'),
      BufferLayout.ns64('space'),
      Layout.pubKey('controllerId'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 0, 
        dif,
        space,
        controllerId: controllerId.toBuffer(),
      },
      data,
    );

    return new Transaction().add({
      keys: [
        {pubkey: from, isSigner: true},
        {pubkey: newAccount, isSigner: false},
      ],
      controllerId: SystemController.controllerId,
      data,
    });
  }

  static transfer(from: PubKey, to: PubKey, amount: number): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      BufferLayout.ns64('amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2, 
        amount,
      },
      data,
    );

    return new Transaction().add({
      keys: [{pubkey: from, isSigner: true}, {pubkey: to, isSigner: false}],
      controllerId: SystemController.controllerId,
      data,
    });
  }

  static assign(from: PubKey, controllerId: PubKey): Transaction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u32('instruction'),
      Layout.pubKey('controllerId'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 1,
        controllerId: controllerId.toBuffer(),
      },
      data,
    );

    return new Transaction().add({
      keys: [{pubkey: from, isSigner: true}],
      controllerId: SystemController.controllerId,
      data,
    });
  }
}
