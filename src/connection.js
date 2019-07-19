// @flow

import assert from 'assert';
import {parse as urlParse, format as urlFormat} from 'url';
import fetch from 'node-fetch';
import jayson from 'jayson/lib/client/browser';
import {struct} from 'superstruct';
import {Client as RpcWebSocketClient} from 'rpc-websockets';

import {DEFAULT_TICKS_PER_ROUND, NUM_TICKS_PER_SECOND} from './timing';
import {PubKey} from './pubkey';
import {Transaction} from './transaction-controller';
import {sleep} from './util/sleep';
import type {Blockhash} from './bus-blockhash';
import type {BusAccount} from './bus-account';
import type {TxnSignature} from './transaction-controller';

type RpcReq = (methodName: string, args: Array<any>) => any;

/**
 * 
 *
 * @typedef {Object} NodeInfo
 * @property {string} id 
 * @property {string} gossip 
 * @property {string} tpu 
 * @property {string|null} rpc 
 */
type NodeInfo = {
  id: string,
  gossip: string,
  tpu: string | null,
  rpc: string | null,
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
 * 
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
  // lamports: 'number',
  dif: 'number',
  data: 'array',
});

/**
 *
 */
const FetchAccountDetailRpcResult = jsonRpcResult(AccountDetailResult);

/***
 * 
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
 * 
 */
const ControllerAccountNoticeResult = struct({
  subscription: 'number',
  result: ControllerAccountDetailResult,
});

/**
 * 
 */
const ConfmTxnRpcResult = jsonRpcResult('boolean');

/**
 *
 */
const FetchRoundLeader = jsonRpcResult('string');

/**
 * 
 */
const FetchClusterNodes = jsonRpcResult(
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
 * 
 */
const FetchSignatureStateRpcResult = jsonRpcResult(
  struct.union([
    'null',
    struct.union([struct({Ok: 'null'}), struct({Err: 'object'})]),
  ]),
);

/**
 *
 */
const FetchTxnAmountRpcResult = jsonRpcResult('number');

/**
 * 
 */
const FetchRecentBlockhash = jsonRpcResult('string');

/**
 * 
 */
const ReqDroneRpcResult = jsonRpcResult('string');

/**
 * 
 */
const SendTxnRpcResult = jsonRpcResult('string');

/**
 * Information describing an account
 *
 * @typedef {Object} AccountDetail
//  * @property {number} lamports 
 * @property {number} dif 
 * @property {PubKey} owner
 * @property {?Buffer} data 
 * @property {boolean} executable 
 */
type AccountDetail = {
  executable: boolean,
  owner: PubKey,
  // lamports: number,
  dif: number,
  data: Buffer,
};

/**
 * 
 *
 * @typedef {Object} KeyedAccountDetail
 * @property {PubKey} accountId
 * @property {AccountDetail} AccountDetail
 */
type KeyedAccountDetail = {
  accountId: PubKey,
  accountDetail: AccountDetail,
};

/**
 * 
 */
export type AccountChangeCallback = (accountInfo: AccountDetail) => void;

/**
 * @private
 */
type AccountSubscriptionDetail = {
  pubKey: string,
  callback: AccountChangeCallback,
  subscriptionId: null | number,
};

/**
 * 
 */
export type ControllerAccountChangeCallback = (
  keyedAccountDetail: KeyedAccountDetail,
) => void;

/**
 * @private
 */
type ControllerAccountSubscriptionDetail = {
  controllerId: string, 
  callback: ControllerAccountChangeCallback,
  subscriptionId: null | number, 
};

/**
 * 
 *
 * @typedef {Object} SignaturePass
 */
export type SignaturePass = {|
  Ok: null,
|};

/**
 *
 *
 * @typedef {Object} TxnErr
 */
export type TxnErr = {|
  Err: Object,
|};

/**
 * 
 */
export class Connection {
  _rpcReq: RpcReq;
  _rpcWebSocket: RpcWebSocketClient;
  _rpcWebSocketConnected: boolean = false;

  _blockhashInfo: {
    recentBlockhash: Blockhash | null,
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
   * 
   *
   * 
   */
  constructor(endpoint: string) {
    let url = urlParse(endpoint);

    this._rpcReq = createRpcReq(url.href);
    this._blockhashInfo = {
      recentBlockhash: null,
      seconds: -1,
      transactionSignatures: [],
    };

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.host = '';
    url.port = String(Number(url.port) + 1);
    if (url.port === '1') {
      url.port = url.protocol === 'wss:' ? '8901' : '8900';
    }
    this._rpcWebSocket = new RpcWebSocketClient(urlFormat(url), {
      autoconnect: false,
      max_reconnects: Infinity,
    });
    this._rpcWebSocket.on('open', this._wsOnOpen.bind(this));
    this._rpcWebSocket.on('error', this._wsOnErr.bind(this));
    this._rpcWebSocket.on('close', this._wsOnClose.bind(this));
    this._rpcWebSocket.on(
      'accountNotice',
      this._wsOnAccountNotice.bind(this),
    );
    this._rpcWebSocket.on(
      'controllerNotification',
      this._wsOnControllerAccountNotice.bind(this),
    );
  }

  /**
   * 
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
   *
   */
  async fetchAccountDetail(pubKey: PubKey): Promise<AccountDetail> {
    const unsafeRes = await this._rpcReq('getAccountInfo', [
      pubKey.toBase58(),
    ]);
    const res = FetchAccountDetailRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }

    const {result} = res;
    assert(typeof result !== 'undefined');

    return {
      executable: result.executable,
      owner: new PubKey(result.owner),
      dif: result.dif,
      data: Buffer.from(result.data),
    };
  }

  /**
   * 
   */
  async confmTxRpcRlt(signature: TxnSignature): Promise<boolean> {
    const unsafeRes = await this._rpcReq('confmTx', [signature]);
    const res = ConfmTxnRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 
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
   * 
   */
  async fetchClusterNodes(): Promise<Array<NodeInfo>> {
    const unsafeRes = await this._rpcReq('getClusterNodes', []);
    const res = FetchClusterNodes(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 
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
   * 
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
   * 
   */
  async fetchRecentBlockhash(): Promise<Blockhash> {
    const unsafeRes = await this._rpcReq('getLatestBlockhash', []);
    const res = FetchRecentBlockhash(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 
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
   * 
   */
  async sendTxn(
    transaction: Transaction,
    ...signers: Array<BusAccount>
  ): Promise<TxnSignature> {
    for (;;) {
      const seconds = new Date().getSeconds();
      if (
        this._blockhashInfo.recentBlockhash != null &&
        this._blockhashInfo.seconds < seconds + 30
      ) {
        transaction.recentBlockhash = this._blockhashInfo.recentBlockhash;
        transaction.sign(...signers);
        if (!transaction.signature) {
          throw new Error('!signature'); 
        }

        const signature = transaction.signature.toString();
        if (!this._blockhashInfo.transactionSignatures.includes(signature)) {
          this._blockhashInfo.transactionSignatures.push(signature);
          if (this._disableBlockhashCaching) {
            this._blockhashInfo.seconds = -1;
          }
          break;
        }
      }

      let attempts = 0;
      const startTime = Date.now();
      for (;;) {
        const recentBlockhash = await this.fetchRecentBlockhash();

        if (this._blockhashInfo.recentBlockhash != recentBlockhash) {
          this._blockhashInfo = {
            recentBlockhash,
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

        await sleep((500 * DEFAULT_TICKS_PER_ROUND) / NUM_TICKS_PER_SECOND);

        ++attempts;
      }
    }

    const wireTransaction = transaction.serialize();
    return await this.sendOriginalTx(wireTransaction);
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

  async sendOriginalTx(
    rawTransaction: Buffer,
  ): Promise<TxnSignature> {
    const unsafeRes = await this._rpcReq('sendTx', [
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
    this._rpcWebSocketConnected = true;
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
    if (code !== 1000) {
      console.log('ws close:', code, message);
    }
    this._rpcWebSocketConnected = false;
  }

  /**
   * @private
   */
  async _updateSubscriptions() {
    const accountKeys = Object.keys(this._accountChangeSubscriptions).map(
      Number,
    );
    const controllerKeys = Object.keys(
      this._controllerAccountChangeSubscriptions,
    ).map(Number);
    if (accountKeys.length === 0 && controllerKeys.length === 0) {
      this._rpcWebSocket.close();
      return;
    }

    if (!this._rpcWebSocketConnected) {
      for (let id of accountKeys) {
        this._accountChangeSubscriptions[id].subscriptionId = null;
      }
      for (let id of controllerKeys) {
        this._controllerAccountChangeSubscriptions[id].subscriptionId = null;
      }
      this._rpcWebSocket.connect();
      return;
    }

    for (let id of accountKeys) {
      const {subscriptionId, pubKey} = this._accountChangeSubscriptions[id];
      if (subscriptionId === null) {
        try {
          this._accountChangeSubscriptions[
            id
          ].subscriptionId = await this._rpcWebSocket.call('accountSubscribe', [
            pubKey,
          ]);
        } catch (err) {
          console.log(
            `accountSubscribe error for ${pubKey}: ${err.message}`,
          );
        }
      }
    }
    for (let id of controllerKeys) {
      const {
        subscriptionId,
        controllerId,
      } = this._controllerAccountChangeSubscriptions[id];
      if (subscriptionId === null) {
        try {
          this._controllerAccountChangeSubscriptions[
            id
          ].subscriptionId = await this._rpcWebSocket.call('controllerSubscribe', [
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
          dif: result.dif,
          data: Buffer.from(result.data),
        });
        return true;
      }
    }
  }

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

  async removeListenerOfAccountChange(id: number): Promise<void> {
    if (this._accountChangeSubscriptions[id]) {
      const {subscriptionId} = this._accountChangeSubscriptions[id];
      delete this._accountChangeSubscriptions[id];
      if (subscriptionId !== null) {
        try {
          await this._rpcWebSocket.call('accountUnsubscribe', [subscriptionId]);
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
  _wsOnControllerAccountNotice(notification: Object) {
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
          accountDetail: {
            executable: result[1].executable,
            owner: new PubKey(result[1].owner),
            dif: result[1].dif,
            data: Buffer.from(result[1].data),
          },
        });
        return true;
      }
    }
  }

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

  async removeControllerAccountChangeListener(id: number): Promise<void> {
    if (this._controllerAccountChangeSubscriptions[id]) {
      const {subscriptionId} = this._controllerAccountChangeSubscriptions[id];
      delete this._controllerAccountChangeSubscriptions[id];
      if (subscriptionId !== null) {
        try {
          await this._rpcWebSocket.call('controllerUnsubscribe', [subscriptionId]);
        } catch (err) {
          console.log('controllerUnsubscribe error:', err.message);
        }
      }
      this._updateSubscriptions();
    } else {
      throw new Error(`Unknown account change id: ${id}`);
    }
  }
}
