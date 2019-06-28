/*
  Example of using the Budget program to perform a payment authorized by two parties
*/

//eslint-disable-next-line import/no-commonjs
const bitconchWeb3 = require('..');
//const bitconchWeb3 = require('@bitconch/bitconch-web3j');

const account1 = new bitconchWeb3.Account();
const account2 = new bitconchWeb3.Account();
const contractFunds = new bitconchWeb3.Account();
const contractState = new bitconchWeb3.Account();

const approver1 = new bitconchWeb3.Account();
const approver2 = new bitconchWeb3.Account();

let url;
// url = 'http://localhost:8899';
url = 'http://localhost:10099';
//url = 'http://testnet.bitconch.com:8899';
const connection = new bitconchWeb3.Connection(url);

function showBalance() {
  console.log(`\n== Account State`);
  return Promise.all([
    connection.getBalance(account1.publicKey),
    connection.getBalance(account2.publicKey),
    connection.getBalance(contractFunds.publicKey),
    connection.getBalance(contractState.publicKey),
  ]).then(
    ([fromBalance, toBalance, contractFundsBalance, contractStateBalance]) => {
      console.log(
        `Account1:       ${account1.publicKey} has a balance of ${fromBalance}`,
      );
      console.log(
        `Account2:       ${account2.publicKey} has a balance of ${toBalance}`,
      );
      console.log(
        `Contract Funds: ${
          contractFunds.publicKey
        } has a balance of ${contractFundsBalance}`,
      );
      console.log(
        `Contract State: ${
          contractState.publicKey
        } has a balance of ${contractStateBalance}`,
      );
    },
  );
}

function confirmTransaction(signature) {
  console.log('Confirming transaction:', signature);
  return connection.getSignatureStatus(signature).then(confirmation => {
    if (confirmation !== 'Confirmed') {
      throw new Error(`Transaction was not confirmed (${confirmation})`);
    }
    console.log('Transaction confirmed');
  });
}

function airDrop() {
  console.log(`\n== Requesting airdrop of 100 to ${account1.publicKey}`);
  return connection
    .requestAirdrop(account1.publicKey, 100)
    .then(confirmTransaction);
}

showBalance()
  .then(airDrop)
  .then(() => {
    console.log(`\n== Move 1 lamport to approver1`);
    const transaction = bitconchWeb3.SystemProgram.transfer(
      account1.publicKey,
      approver1.publicKey,
      1,
    );
    return connection.sendTransaction(transaction, account1);
  })
  .then(confirmTransaction)
  .then(() => {
    console.log(`\n== Move 1 lamport to approver2`);
    const transaction = bitconchWeb3.SystemProgram.transfer(
      account1.publicKey,
      approver2.publicKey,
      1,
    );
    return connection.sendTransaction(transaction, account1);
  })
  .then(confirmTransaction)
  .then(showBalance)
  .then(() => {
    console.log(`\n== Creating account for the contract funds`);
    const transaction = bitconchWeb3.SystemProgram.createAccount(
      account1.publicKey,
      contractFunds.publicKey,
      50, // number of lamports to transfer
      0,
      bitconchWeb3.BudgetProgram.programId,
    );
    return connection.sendTransaction(transaction, account1);
  })
  .then(confirmTransaction)
  .then(showBalance)
  .then(() => {
    console.log(`\n== Creating account for the contract state`);
    const transaction = bitconchWeb3.SystemProgram.createAccount(
      account1.publicKey,
      contractState.publicKey,
      1, // account1 pays 1 lamport to hold the contract state
      bitconchWeb3.BudgetProgram.space,
      bitconchWeb3.BudgetProgram.programId,
    );
    return connection.sendTransaction(transaction, account1);
  })
  .then(confirmTransaction)
  .then(showBalance)
  .then(() => {
    console.log(`\n== Initializing contract`);
    const transaction = bitconchWeb3.BudgetProgram.payOnBoth(
      contractFunds.publicKey,
      contractState.publicKey,
      account2.publicKey,
      50,
      bitconchWeb3.BudgetProgram.signatureCondition(approver1.publicKey),
      bitconchWeb3.BudgetProgram.signatureCondition(approver2.publicKey),
    );
    return connection.sendTransaction(transaction, contractFunds);
  })
  .then(confirmTransaction)
  .then(showBalance)
  .then(() => {
    console.log(`\n== Apply approver 1`);
    const transaction = bitconchWeb3.BudgetProgram.applySignature(
      approver1.publicKey,
      contractState.publicKey,
      account2.publicKey,
    );
    return connection.sendTransaction(transaction, approver1);
  })
  .then(confirmTransaction)
  .then(showBalance)
  .then(() => {
    console.log(`\n== Apply approver 2`);
    const transaction = bitconchWeb3.BudgetProgram.applySignature(
      approver2.publicKey,
      contractState.publicKey,
      account2.publicKey,
    );
    return connection.sendTransaction(transaction, approver2);
  })
  .then(confirmTransaction)
  .then(showBalance)

  .then(() => {
    console.log('\nDone');
  })

  .catch(err => {
    console.log(err);
  });
