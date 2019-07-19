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
  expect(transaction.keys).toHaveLength(2);

  transaction = BudgetController.pay(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    123,
    BudgetController.signatureCond(from.pubKey),
  );
  expect(transaction.keys).toHaveLength(3);

  transaction = BudgetController.pay(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    123,
    BudgetController.signatureCond(from.pubKey),
    BudgetController.datetimeCond(from.pubKey, new Date()),
  );
  expect(transaction.keys).toHaveLength(3);

  transaction = BudgetController.payOnAll(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    123,
    BudgetController.signatureCond(from.pubKey),
    BudgetController.datetimeCond(from.pubKey, new Date()),
  );
  expect(transaction.keys).toHaveLength(3);
});

test('apply', () => {
  const from = new BusAccount();
  const program = new BusAccount();
  const to = new BusAccount();
  let transaction;

  transaction = BudgetController.sealWithDatetime(
    from.pubKey,
    program.pubKey,
    to.pubKey,
    new Date(),
  );
  expect(transaction.keys).toHaveLength(3);

  transaction = BudgetController.sealWithSignature(
    from.pubKey,
    program.pubKey,
    to.pubKey,
  );
  expect(transaction.keys).toHaveLength(3);
});
