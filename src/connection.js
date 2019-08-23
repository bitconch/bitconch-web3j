// @flow

import assert from 'assert';
import {parse as urlParse, format as urlFormat} from 'url';
import fetch from 'node-fetch';
import jayson from 'jayson/lib/client/browser';
import {struct} from 'superstruct';
import {Client as RpcWebSocketClient} from 'rpc-websockets';

import {DEFAULT_TICKS_PER_SLOT, NUM_TICKS_PER_SEC} from './timing';
import {PubKey} from './pubkey';
import {Transaction} from './transaction-controller';
import {sleep} from './util/sleep';
import type {Blockhash} from './bus-blockhash';
import type {FeeCalculator} from './fee-calculator';
import type {BusAccount} from './bus-account';
import type {TxnSignature} from './transaction-controller';

type RpcReq = (methodName: string, args: Array<any>) => any;

/**
 * Information describing a cluster node
 *
 * @typedef {Object} NodeInfo
 * @property {string} pubkey Identity public key of the node
 * @property {string} gossip Gossip network address for the node
 * @property {string} tpu TPU network address for the node (null if not available)
 * @property {string|null} rpc JSON RPC network address for the node (null if not available)
 */
type NodeInfo = {
  pubkey: string,
  gossip: string,
  tpu: string | null,
  rpc: string | null,
};

/**
 * Information describing a vote account
 *
 * @typedef {Object} VoteAccountInfo
 * @property {string} votePubkey Public key of the vote account
 * @property {string} nodePubkey Identity public key of the node voting with this account
 * @property {string} stake The stake, in difs, delegated to this vote account
 * @property {string} commission A 32-bit integer used as a fraction (commission/0xFFFFFFFF) for rewards payout
 */
type VoteAccountInfo = {
  votePubkey: string,
  nodePubkey: string,
  stake: number,
  commission: number,
};

function createRpcReq(url): RpcReq {
  const server = jayson(async (request, callback) => {
    const options = {
      method: 'POST',
      body: request,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    try {
      const res = await fetch(url, options);
      const text = await res.text();
      callback(null, text);
    } catch (err) {
      callback(err);
    }
  });

  return (method, args) => {
    return new Promise((resolve, reject) => {
      server.request(method, args, (err, response) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(response);
      });
    });
  };
}

/**
 * Expected JSON RPC response for the "fetchAccountBalance" message
 */
const FetchBalanceRpcResult = struct({
  jsonrpc: struct.literal('2.0'),
  id: 'string',
  error: 'any?',
  result: 'number?',
});

/**
 * @private
 */
function jsonRpcResult(resultDescription: any) {
  const jsonRpcVersion = struct.literal('2.0');
  return struct.union([
    struct({
      jsonrpc: jsonRpcVersion,
      id: 'string',
      error: 'any',
    }),
    struct({
      jsonrpc: jsonRpcVersion,
      id: 'string',
      error: 'null?',
      result: resultDescription,
    }),
  ]);
}

/**
 * @private
 */
const AccountDetailResult = struct({
  executable: 'boolean',
  owner: 'array',
  difs: 'number',
  data: 'array',
});

/**
 * Expected JSON RPC response for the "fetchAccountDetail" message
 */
const fetchAccountDetailRpcResult = jsonRpcResult(AccountDetailResult);

/***
 * Expected JSON RPC response for the "accountNotification" message
 */
const AccountNoticeResult = struct({
  subscription: 'number',
  result: AccountDetailResult,
});

/**
 * @private
 */
const ControllerAccountDetailResult = struct(['string', AccountDetailResult]);

/***
 * Expected JSON RPC response for the "programNotification" message
 */
const ControllerAccountNoticeResult = struct({
  subscription: 'number',
  result: ControllerAccountDetailResult,
});

/**
 * Expected JSON RPC response for the "confmTxn" message
 */
const ConfmTxnRpcResult = jsonRpcResult('boolean');

/**
 * Expected JSON RPC response for the "fetchRoundLeader" message
 */
const FetchRoundLeader = jsonRpcResult('string');

/**
 * Expected JSON RPC response for the "fetchClusterNodes" message
 */
const GetClusterNodes = jsonRpcResult(
  struct.list([
    struct({
      pubkey: 'string',
      gossip: 'string',
      tpu: struct.union(['null', 'string']),
      rpc: struct.union(['null', 'string']),
    }),
  ]),
);
/**
 * @ignore
 */
const GetClusterNodes_015 = jsonRpcResult(
  struct.list([
    struct({
      id: 'string',
      gossip: 'string',
      tpu: struct.union(['null', 'string']),
      rpc: struct.union(['null', 'string']),
    }),
  ]),
);

/**
 * Expected JSON RPC response for the "getEpochVoteAccounts" message
 */
const GetEpochVoteAccounts = jsonRpcResult(
  struct.list([
    struct({
      votePubkey: 'string',
      nodePubkey: 'string',
      stake: 'number',
      commission: 'number',
    }),
  ]),
);

/**
 * Expected JSON RPC response for the "fetchSignatureState" message
 */
const FetchSignatureStateRpcResult = jsonRpcResult(
  struct.union([
    'null',
    struct.union([struct({Ok: 'null'}), struct({Err: 'object'})]),
  ]),
);

/**
 * Expected JSON RPC response for the "fetchTxnAmount" message
 */
const FetchTxnAmountRpcResult = jsonRpcResult('number');

/**
 * Expected JSON RPC response for the "getTotalSupply" message
 */
const GetTotalSupplyRpcResult = jsonRpcResult('number');

/**
 * Expected JSON RPC response for the "fetchRecentBlockhash" message
 */
const FetchRecentBlockhash = jsonRpcResult([
  'string',
  struct({
    lamportsPerSignature: 'number',
    maxLamportsPerSignature: 'number',
    minLamportsPerSignature: 'number',
    targetLamportsPerSignature: 'number',
    targetSignaturesPerSlot: 'number',
  }),
]);
/**
 * @ignore
 */
const GetRecentBlockhash_015 = jsonRpcResult([
  'string',
  struct({
    lamportsPerSignature: 'number',
  }),
]);

/**
 * Expected JSON RPC response for the "reqDrone" message
 */
const ReqDroneRpcResult = jsonRpcResult('string');

/**
 * Expected JSON RPC response for the "sendTxn" message
 */
const SendTxnRpcResult = jsonRpcResult('string');

/**
 * Information describing an account
 *
 * @typedef {Object} AccountDetail
 * @property {number} difs Number of difs assigned to the account
 * @property {PubKey} owner Identifier of the program that owns the account
 * @property {?Buffer} data Optional data assigned to the account
 * @property {boolean} executable `true` if this account's data contains a loaded program
 */
type AccountDetail = {
  executable: boolean,
  owner: PubKey,
  difs: number,
  data: Buffer,
};

/**
 * BusAccount information identified by pubkey
 *
 * @typedef {Object} KeyedAccountDetail
 * @property {PubKey} accountId
 * @property {AccountDetail} fetchAccountDetail
 */
type KeyedAccountDetail = {
  accountId: PubKey,
  fetchAccountDetail: AccountDetail,
};

/**
 * Callback function for account change notifications
 */
export type AccountChangeCallback = (fetchAccountDetail: AccountDetail) => void;

/**
 * @private
 */
type AccountSubscriptionDetail = {
  pubKey: string, // PubKey of the account as a base 58 string
  callback: AccountChangeCallback,
  subscriptionId: null | number, // null when there's no current server subscription id
};

/**
 * Callback function for program account change notifications
 */
export type ControllerAccountChangeCallback = (
  keyedAccountInfo: KeyedAccountDetail,
) => void;

/**
 * @private
 */
type ControllerAccountSubscriptionDetail = {
  controllerId: string, // PubKey of the program as a base 58 string
  callback: ControllerAccountChangeCallback,
  subscriptionId: null | number, // null when there's no current server subscription id
};

/**
 * Signature status: Success
 *
 * @typedef {Object} SignaturePass
 */
export type SignaturePass = {|
  Ok: null,
|};

/**
 * Signature status: TxnErr
 *
 * @typedef {Object} TxnErr
 */
export type TxnErr = {|
  Err: Object,
|};

/**
 * @ignore
 */
type BlockhashAndFeeCalculator = [Blockhash, FeeCalculator]; // This type exists to workaround an esdoc parse error

/**
 * A connection to a fullnode JSON RPC endpoint
 */
export class Connection {
  _rpcReq: RpcReq;
  _rpcWebSock: RpcWebSocketClient;
  _rpcWebSockConnected: boolean = false;

  _blockhashInfo: {
    recentPackagehash: Blockhash | null,
    seconds: number,
    transactionSignatures: Array<string>,
  };
  _disableBlockhashCaching: boolean = false;
  _accountChangeSubscriptions: {[number]: AccountSubscriptionDetail} = {};
  _accountChangeSubscriptionCounter: number = 0;
  _controllerAccountChangeSubscriptions: {
    [number]: ControllerAccountSubscriptionDetail,
  } = {};
  _controllerAccountChangeSubscriptionCounter: number = 0;

  /**
   * Establish a JSON RPC connection
   *
   * @param endpoint URL to the fullnode JSON RPC endpoint
   */
  constructor(endpoint: string) {
    let url = urlParse(endpoint);

    this._rpcReq = createRpcReq(url.href);
    this._blockhashInfo = {
      recentPackagehash: null,
      seconds: -1,
      transactionSignatures: [],
    };

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.host = '';
    url.port = String(Number(url.port) + 1);
    if (url.port === '1') {
      url.port = url.protocol === 'wss:' ? '8901' : '8900';
    }
    this._rpcWebSock = new RpcWebSocketClient(urlFormat(url), {
      autoconnect: false,
      max_reconnects: Infinity,
    });
    this._rpcWebSock.on('open', this._wsOnOpen.bind(this));
    this._rpcWebSock.on('error', this._wsOnErr.bind(this));
    this._rpcWebSock.on('close', this._wsOnClose.bind(this));
    this._rpcWebSock.on(
      'accountNotification',
      this._wsOnAccountNotice.bind(this),
    );
    this._rpcWebSock.on(
      'programNotification',
      this._wsOnProgramAccountNotification.bind(this),
    );
  }

  /**
   * Fetch the balance for the specified public key
   */
  async fetchAccountBalance(pubKey: PubKey): Promise<number> {
    const unsafeRes = await this._rpcReq('getDif', [
      pubKey.toBase58(),
    ]);
    const res = FetchBalanceRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Fetch all the account info for the specified public key
   */
  async fetchAccountDetail(pubKey: PubKey): Promise<AccountDetail> {
    const unsafeRes = await this._rpcReq('getAccountInfo', [
      pubKey.toBase58(),
    ]);
    const res = fetchAccountDetailRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }

    const {result} = res;
    assert(typeof result !== 'undefined');

    return {
      executable: result.executable,
      owner: new PubKey(result.owner),
      difs: result.difs,
      data: Buffer.from(result.data),
    };
  }

  /**
   * Confirm the transaction identified by the specified signature
   */
  async confmTxn(signature: TxnSignature): Promise<boolean> {
    const unsafeRes = await this._rpcReq('confirmTxn', [signature]);
    const res = ConfmTxnRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Return the list of nodes that are currently participating in the cluster
   */
  async fetchClusterNodes(): Promise<Array<NodeInfo>> {
    const unsafeRes = await this._rpcReq('getClusterNodes', []);

    // Legacy v0.15 response.  TODO: Remove in August 2019
    try {
      const res_015 = GetClusterNodes_015(unsafeRes);
      if (res_015.error) {
        console.log('no', res_015.error);
        throw new Error(res_015.error.message);
      }
      return res_015.result.map(node => {
        node.pubkey = node.id;
        node.id = undefined;
        return node;
      });
    } catch (e) {
      // Not legacy format
    }
    // End Legacy v0.15 response

    const res = GetClusterNodes(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Return the list of nodes that are currently participating in the cluster
   */
  async getEpochVoteAccounts(): Promise<Array<VoteAccountInfo>> {
    const unsafeRes = await this._rpcReq('getEpochVoteAccounts', []);
    const res = GetEpochVoteAccounts(unsafeRes);
    //const res = unsafeRes;
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Fetch the current slot leader of the cluster
   */
  async fetchRoundLeader(): Promise<string> {
    const unsafeRes = await this._rpcReq('getRoundLeader', []);
    const res = FetchRoundLeader(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Fetch the current transaction count of the cluster
   */
  async fetchSignatureState(
    signature: TxnSignature,
  ): Promise<SignaturePass | TxnErr | null> {
    const unsafeRes = await this._rpcReq('getSignatureState', [signature]);
    const res = FetchSignatureStateRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Fetch the current transaction count of the cluster
   */
  async fetchTxnAmount(): Promise<number> {
    const unsafeRes = await this._rpcReq('getTxnCnt', []);
    const res = FetchTxnAmountRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return Number(res.result);
  }

  /**
   * Fetch the current total currency supply of the cluster
   */
  async getTotalSupply(): Promise<number> {
    const unsafeRes = await this._rpcReq('getTotalSupply', []);
    const res = GetTotalSupplyRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return Number(res.result);
  }

  /**
   * Fetch a recent blockhash from the cluster
   */
  async fetchRecentBlockhash(): Promise<BlockhashAndFeeCalculator> {
    const unsafeRes = await this._rpcReq('getLatestBlockhash', []);

    // Legacy v0.15 response.  TODO: Remove in August 2019
    try {
      const res_015 = GetRecentBlockhash_015(unsafeRes);
      if (res_015.error) {
        throw new Error(res_015.error.message);
      }
      const [blockhash, feeCalculator] = res_015.result;
      feeCalculator.targetSignaturesPerSlot = 42;
      feeCalculator.targetLamportsPerSignature =
        feeCalculator.lamportsPerSignature;

      return [blockhash, feeCalculator];
    } catch (e) {
      // Not legacy format
    }
    // End Legacy v0.15 response

    const res = FetchRecentBlockhash(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Request an allocation of difs to the specified account
   */
  async reqDrone(
    to: PubKey,
    amount: number,
  ): Promise<TxnSignature> {
    const unsafeRes = await this._rpcReq('requestDif', [
      to.toBase58(),
      amount,
    ]);
    const res = ReqDroneRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Sign and send a transaction
   */
  async sendTxn(
    transaction: Transaction,
    ...signers: Array<BusAccount>
  ): Promise<TxnSignature> {
    for (;;) {
      // Attempt to use a recent blockhash for up to 30 seconds
      const seconds = new Date().getSeconds();
      if (
        this._blockhashInfo.recentPackagehash != null &&
        this._blockhashInfo.seconds < seconds + 30
      ) {
        transaction.recentPackagehash = this._blockhashInfo.recentPackagehash;
        transaction.sign(...signers);
        if (!transaction.signature) {
          throw new Error('!signature'); // should never happen
        }

        // If the signature of this transaction has not been seen before with the
        // current recentPackagehash, all done.
        const signature = transaction.signature.toString();
        if (!this._blockhashInfo.transactionSignatures.includes(signature)) {
          this._blockhashInfo.transactionSignatures.push(signature);
          if (this._disableBlockhashCaching) {
            this._blockhashInfo.seconds = -1;
          }
          break;
        }
      }

      // Fetch a new blockhash
      let attempts = 0;
      const startTime = Date.now();
      for (;;) {
        const [
          recentPackagehash,
          //feeCalculator,
        ] = await this.fetchRecentBlockhash();

        if (this._blockhashInfo.recentPackagehash != recentPackagehash) {
          this._blockhashInfo = {
            recentPackagehash,
            seconds: new Date().getSeconds(),
            transactionSignatures: [],
          };
          break;
        }
        if (attempts === 50) {
          throw new Error(
            `Unable to obtain a new blockhash after ${Date.now() -
              startTime}ms`,
          );
        }

        // Sleep for approximately half a slot
        await sleep((500 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SEC);

        ++attempts;
      }
    }

    const wireTransaction = transaction.serialize();
    return await this.sendNativeTxn(wireTransaction);
  }

  /**
   * @private
   */
  async fullnodeExit(): Promise<boolean> {
    const unsafeRes = await this._rpcReq('fullnodeQuit', []);
    const res = jsonRpcResult('boolean')(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * Send a transaction that has already been signed and serialized into the
   * wire format
   */
  async sendNativeTxn(
    rawTransaction: Buffer,
  ): Promise<TxnSignature> {
    const unsafeRes = await this._rpcReq('sendTxn', [
      [...rawTransaction],
    ]);
    const res = SendTxnRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    assert(res.result);
    return res.result;
  }

  /**
   * @private
   */
  _wsOnOpen() {
    this._rpcWebSockConnected = true;
    this._updateSubscriptions();
  }

  /**
   * @private
   */
  _wsOnErr(err: Error) {
    console.log('ws error:', err.message);
  }

  /**
   * @private
   */
  _wsOnClose(code: number, message: string) {
    // 1000 means _rpcWebSock.close() was called explicitly
    if (code !== 1000) {
      console.log('ws close:', code, message);
    }
    this._rpcWebSockConnected = false;
  }

  /**
   * @private
   */
  async _updateSubscriptions() {
    const accountKeys = Object.keys(this._accountChangeSubscriptions).map(
      Number,
    );
    const programKeys = Object.keys(
      this._controllerAccountChangeSubscriptions,
    ).map(Number);
    if (accountKeys.length === 0 && programKeys.length === 0) {
      this._rpcWebSock.close();
      return;
    }

    if (!this._rpcWebSockConnected) {
      for (let id of accountKeys) {
        this._accountChangeSubscriptions[id].subscriptionId = null;
      }
      for (let id of programKeys) {
        this._controllerAccountChangeSubscriptions[id].subscriptionId = null;
      }
      this._rpcWebSock.connect();
      return;
    }

    for (let id of accountKeys) {
      const {subscriptionId, pubKey} = this._accountChangeSubscriptions[id];
      if (subscriptionId === null) {
        try {
          this._accountChangeSubscriptions[
            id
          ].subscriptionId = await this._rpcWebSock.call('accountSubscribe', [
            pubKey,
          ]);
        } catch (err) {
          console.log(
            `accountSubscribe error for ${pubKey}: ${err.message}`,
          );
        }
      }
    }
    for (let id of programKeys) {
      const {
        subscriptionId,
        controllerId,
      } = this._controllerAccountChangeSubscriptions[id];
      if (subscriptionId === null) {
        try {
          this._controllerAccountChangeSubscriptions[
            id
          ].subscriptionId = await this._rpcWebSock.call('programSubscribe', [
            controllerId,
          ]);
        } catch (err) {
          console.log(
            `programSubscribe error for ${controllerId}: ${err.message}`,
          );
        }
      }
    }
  }

  /**
   * @private
   */
  _wsOnAccountNotice(notification: Object) {
    const res = AccountNoticeResult(notification);
    if (res.error) {
      throw new Error(res.error.message);
    }

    const keys = Object.keys(this._accountChangeSubscriptions).map(Number);
    for (let id of keys) {
      const sub = this._accountChangeSubscriptions[id];
      if (sub.subscriptionId === res.subscription) {
        const {result} = res;
        assert(typeof result !== 'undefined');

        sub.callback({
          executable: result.executable,
          owner: new PubKey(result.owner),
          difs: result.difs,
          data: Buffer.from(result.data),
        });
        return true;
      }
    }
  }

  /**
   * Register a callback to be invoked whenever the specified account changes
   *
   * @param publickey Public key of the account to monitor
   * @param callback Function to invoke whenever the account is changed
   * @return subscription id
   */
  onAccountChange(
    pubKey: PubKey,
    callback: AccountChangeCallback,
  ): number {
    const id = ++this._accountChangeSubscriptionCounter;
    this._accountChangeSubscriptions[id] = {
      pubKey: pubKey.toBase58(),
      callback,
      subscriptionId: null,
    };
    this._updateSubscriptions();
    return id;
  }

  /**
   * Deregister an account notification callback
   *
   * @param id subscription id to deregister
   */
  async removeListenerOfAccountChange(id: number): Promise<void> {
    if (this._accountChangeSubscriptions[id]) {
      const {subscriptionId} = this._accountChangeSubscriptions[id];
      delete this._accountChangeSubscriptions[id];
      if (subscriptionId !== null) {
        try {
          await this._rpcWebSock.call('accountUnsubscribe', [subscriptionId]);
        } catch (err) {
          console.log('accountUnsubscribe error:', err.message);
        }
      }
      this._updateSubscriptions();
    } else {
      throw new Error(`Unknown account change id: ${id}`);
    }
  }

  /**
   * @private
   */
  _wsOnProgramAccountNotification(notification: Object) {
    const res = ControllerAccountNoticeResult(notification);
    if (res.error) {
      throw new Error(res.error.message);
    }

    const keys = Object.keys(this._controllerAccountChangeSubscriptions).map(
      Number,
    );
    for (let id of keys) {
      const sub = this._controllerAccountChangeSubscriptions[id];
      if (sub.subscriptionId === res.subscription) {
        const {result} = res;
        assert(typeof result !== 'undefined');

        sub.callback({
          accountId: result[0],
          fetchAccountDetail: {
            executable: result[1].executable,
            owner: new PubKey(result[1].owner),
            difs: result[1].difs,
            data: Buffer.from(result[1].data),
          },
        });
        return true;
      }
    }
  }

  /**
   * Register a callback to be invoked whenever accounts owned by the
   * specified program change
   *
   * @param controllerId Public key of the program to monitor
   * @param callback Function to invoke whenever the account is changed
   * @return subscription id
   */
  onControllerAccountChange(
    controllerId: PubKey,
    callback: ControllerAccountChangeCallback,
  ): number {
    const id = ++this._controllerAccountChangeSubscriptionCounter;
    this._controllerAccountChangeSubscriptions[id] = {
      controllerId: controllerId.toBase58(),
      callback,
      subscriptionId: null,
    };
    this._updateSubscriptions();
    return id;
  }

  /**
   * Deregister an account notification callback
   *
   * @param id subscription id to deregister
   */
  async removeControllerAccountChangeListener(id: number): Promise<void> {
    if (this._controllerAccountChangeSubscriptions[id]) {
      const {subscriptionId} = this._controllerAccountChangeSubscriptions[id];
      delete this._controllerAccountChangeSubscriptions[id];
      if (subscriptionId !== null) {
        try {
          await this._rpcWebSock.call('programUnsubscribe', [subscriptionId]);
        } catch (err) {
          console.log('programUnsubscribe error:', err.message);
        }
      }
      this._updateSubscriptions();
    } else {
      throw new Error(`Unknown account change id: ${id}`);
    }
  }
}
