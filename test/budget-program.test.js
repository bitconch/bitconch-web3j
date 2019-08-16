// @flow

import {BusAccount} from '../src/bus-account';
import {BudgetController} from '../src/budget-controller';

test('pay', () => {
  const from = new BusAccount();
  const program = new BusAccount();
  const to = new BusAccount();
  let transaction;

  transaction = BudgetController.pay(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    123,
  );
  expect(transaction.operations[0].keys).toHaveLength(2);
  expect(transaction.operations[1].keys).toHaveLength(2);
  // TODO: Validate transaction contents more

  transaction = BudgetController.pay(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    123,
    BudgetController.signatureState(from.pubKey),
  );
  expect(transaction.operations[0].keys).toHaveLength(2);
  expect(transaction.operations[1].keys).toHaveLength(1);
  // TODO: Validate transaction contents more

  transaction = BudgetController.pay(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    123,
    BudgetController.signatureState(from.pubKey),
    BudgetController.timestampState(from.pubKey, new Date()),
  );
  expect(transaction.operations[0].keys).toHaveLength(2);
  expect(transaction.operations[1].keys).toHaveLength(1);
  // TODO: Validate transaction contents more

  transaction = BudgetController.bothToPay(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    123,
    BudgetController.signatureState(from.pubKey),
    BudgetController.timestampState(from.pubKey, new Date()),
  );
  expect(transaction.operations[0].keys).toHaveLength(2);
  expect(transaction.operations[1].keys).toHaveLength(1);
  // TODO: Validate transaction contents more
});

test('apply', () => {
  const from = new BusAccount();
  const program = new BusAccount();
  const to = new BusAccount();
  let transaction;

  transaction = BudgetController.matchTimestamp(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    new Date(),
  );
  expect(transaction.keys).toHaveLength(3);
  // TODO: Validate transaction contents more

  transaction = BudgetController.matchSignature(
    from.pubKey,
    program.pubKey,
    to.pubKey,
  );
  expect(transaction.keys).toHaveLength(3);
  // TODO: Validate transaction contents more
});
