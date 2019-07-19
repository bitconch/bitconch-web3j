// @flow

import {BusAccount, BudgetController, SystemController} from '../src';

test('createAccount', () => {
  const from = new BusAccount();
  const newAccount = new BusAccount();
  let transaction;

  transaction = SystemController.createNewAccount(
    from.pubKey,
    newAccount.pubKey,
    123,
    BudgetController.size,
    BudgetController.controllerId,
  );

  expect(transaction.keys).toHaveLength(2);
  expect(transaction.controllerId).toEqual(SystemController.controllerId);
});

test('transfer', () => {
  const from = new BusAccount();
  const to = new BusAccount();
  let transaction;

  transaction = SystemController.transfer(from.pubKey, to.pubKey, 123);

  expect(transaction.keys).toHaveLength(2);
  expect(transaction.controllerId).toEqual(SystemController.controllerId);
});

test('assign', () => {
  const from = new BusAccount();
  const to = new BusAccount();
  let transaction;

  transaction = SystemController.assign(from.pubKey, to.pubKey);

  expect(transaction.keys).toHaveLength(1);
  expect(transaction.controllerId).toEqual(SystemController.controllerId);
});
