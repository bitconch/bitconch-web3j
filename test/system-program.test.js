// @flow

import {BusAccount, BudgetController, SystemController} from '../src';

test('createNewAccount', () => {
  const from = new BusAccount();
  const createNewAccount = new BusAccount();
  let transaction;

  transaction = SystemController.createNewAccount(
    from.pubKey,
    createNewAccount.pubKey,
    123,
    BudgetController.space,
    BudgetController.controllerId,
  );

  expect(transaction.keys).toHaveLength(2);
  expect(transaction.controllerId).toEqual(SystemController.controllerId);
  // TODO: Validate transaction contents more
});

test('transfer', () => {
  const from = new BusAccount();
  const to = new BusAccount();
  let transaction;

  transaction = SystemController.transfer(from.pubKey, to.pubKey, 123);

  expect(transaction.keys).toHaveLength(2);
  expect(transaction.controllerId).toEqual(SystemController.controllerId);
  // TODO: Validate transaction contents more
});

test('assign', () => {
  const from = new BusAccount();
  const to = new BusAccount();
  let transaction;

  transaction = SystemController.assign(from.pubKey, to.pubKey);

  expect(transaction.keys).toHaveLength(1);
  expect(transaction.controllerId).toEqual(SystemController.controllerId);
  // TODO: Validate transaction contents more
});
