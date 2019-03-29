/*
 Fetch the balance of an account
*/

//eslint-disable-next-line import/no-commonjs
const bitconchWeb3 = require('..');
//const bitconchWeb3 = require('@@bitconch/bitconch-web3j');

const account = new bitconchWeb3.Account();

let url;
url = 'http://localhost:8899';
//url = 'http://testnet.bitconch.io:8899';
const connection = new bitconchWeb3.Connection(url);

connection.getBalance(account.publicKey)
.then((balance) => {
  console.log(`${account.publicKey} has a balance of ${balance}`);
});
