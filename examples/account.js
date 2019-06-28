/*
 Create a new account
*/

//eslint-disable-next-line import/no-commonjs
const bitconchWeb3 = require('..');
//const bitconchWeb3 = require('@bitconch/web3.js');

const account = new bitconchWeb3.Account();
console.log(account.publicKey.toString());
