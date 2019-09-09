/*
 Create a new account
*/

//eslint-disable-next-line import/no-commonjs
const bitconchWeb3 = require('..');
//const bitconchWeb3 = require('@bitconch/bitconch-web3j');

const account = new bitconchWeb3.Account();
console.log(account.publicKey.toString());
