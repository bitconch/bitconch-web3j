// @flow

import assert from 'assert';
import {parse as urlParse, format as urlFormat} from 'url';
import fetch from 'node-fetch';
import jayson from 'jayson/lib/client/browser';
import {struct} from 'superstruct';
import {Client as RpcWebSocketClient} from 'rpc-websockets';

import {DEFAULT_TICKS_PER_SLOT, NUM_TICKS_PER_SECOND} from './timing';
import {PublicKey} from './publickey';
import {Transaction} from './transaction';
import {sleep} from './util/sleep';
import type {Blockhash} from './blockhash';
import type {Account} from './account';
import type {TransactionSignature} from './transaction';

type RpcRequest = (methodName: string, args: Array<any>) => any;

function createRpcRequest(url): RpcRequest {
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
 * 对“getBalance”消息的预期JSON RPC响应
 */
const GetBalanceRpcResult = struct({
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
const AccountInfoResult = struct({
  executable: 'boolean',
  owner: 'array',
  difs: 'number',
  data: 'array',
});

/**
 * 对“getAccountInfo”消息的预期JSON RPC响应
 */
const GetAccountInfoRpcResult = jsonRpcResult(AccountInfoResult);

/***
 * “accountNotification”消息的预期JSON RPC响应
 */
const AccountNotificationResult = struct({
  subscription: 'number',
  result: AccountInfoResult,
});

/**
 * @private
 */
const ProgramAccountInfoResult = struct(['string', AccountInfoResult]);

/***
 * 对“programNotification”消息的预期JSON RPC响应
 */
const ProgramAccountNotificationResult = struct({
  subscription: 'number',
  result: ProgramAccountInfoResult,
});

/**
 * “confirmTransaction”消息的预期JSON RPC响应
 */
const ConfirmTransactionRpcResult = jsonRpcResult('boolean');

/**
 * 对“getSignatureStatus”消息的预期JSON RPC响应
 */
const GetSignatureStatusRpcResult = jsonRpcResult(
  struct.enum([
    'AccountInUse',
    'Confirmed',
    'GenericFailure',
    'ProgramRuntimeError',
    'SignatureNotFound',
  ]),
);

/**
 * 对“getTransactionCount”消息的预期JSON RPC响应
 */
const GetTransactionCountRpcResult = jsonRpcResult('number');

/**
 * 对“getRecentBlockhash”消息的预期JSON RPC响应
 */
const GetRecentBlockhash = jsonRpcResult('string');

/**
 * 对“requestAirdrop”消息的预期JSON RPC响应
 */
const RequestAirdropRpcResult = jsonRpcResult('string');

/**
 * 对“sendTransaction”消息的预期JSON RPC响应
 */
const SendTransactionRpcResult = jsonRpcResult('string');

/**
 * 描述帐户的信息
 *
 * @typedef {Object} AccountInfo
 * @property {number} difs 分配给帐户数
 * @property {PublicKey} owner 拥有该帐户的程序的标识符
 * @property {?Buffer} data 分配给帐户的可选数据
 * @property {boolean} executable `true` 如果此帐户的数据包含已加载的程序
 */
type AccountInfo = {
  executable: boolean,
  owner: PublicKey,
  difs: number,
  data: Buffer,
};

/**
 * pubkey标识的帐户信息
 *
 * @typedef {Object} KeyedAccountInfo
 * @property {PublicKey} accountId
 * @property {AccountInfo} accountInfo
 */
type KeyedAccountInfo = {
  accountId: PublicKey,
  accountInfo: AccountInfo,
};

/**
 * 帐户更改通知的回调函数
 */
export type AccountChangeCallback = (accountInfo: AccountInfo) => void;

/**
 * @private
 */
type AccountSubscriptionInfo = {
  publicKey: string, // 该帐户的PublicKey为58字符串
  callback: AccountChangeCallback,
  subscriptionId: null | number, // 当没有当前服务器订阅ID时为null
};

/**
 * 程序帐户更改通知的回调函数
 */
export type ProgramAccountChangeCallback = (
  keyedAccountInfo: KeyedAccountInfo,
) => void;

/**
 * @private
 */
type ProgramAccountSubscriptionInfo = {
  programId: string, // 该程序的PublicKey为58字符串
  callback: ProgramAccountChangeCallback,
  subscriptionId: null | number, // 当没有当前服务器订阅ID时为null
};

/**
 * 可能的签名状态值
 *
 * @typedef {string} SignatureStatus
 */
export type SignatureStatus =
  | 'Confirmed'
  | 'AccountInUse'
  | 'SignatureNotFound'
  | 'ProgramRuntimeError'
  | 'GenericFailure';

/**
 * 与fullnode JSON RPC端点的连接
 */
export class Connection {
  _rpcRequest: RpcRequest;
  _rpcWebSocket: RpcWebSocketClient;
  _rpcWebSocketConnected: boolean = false;

  _blockhashInfo: {
    recentBlockhash: Blockhash | null,
    seconds: number,
    transactionSignatures: Array<string>,
  };
  _disableBlockhashCaching: boolean = false;
  _accountChangeSubscriptions: {[number]: AccountSubscriptionInfo} = {};
  _accountChangeSubscriptionCounter: number = 0;
  _programAccountChangeSubscriptions: {
    [number]: ProgramAccountSubscriptionInfo,
  } = {};
  _programAccountChangeSubscriptionCounter: number = 0;

  /**
   * 建立JSON RPC连接
   *
   * @param endpoint fullnode JSON RPC端点的URL
   */
  constructor(endpoint: string) {
    let url = urlParse(endpoint);

    this._rpcRequest = createRpcRequest(url.href);
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
    this._rpcWebSocket.on('error', this._wsOnError.bind(this));
    this._rpcWebSocket.on('close', this._wsOnClose.bind(this));
    this._rpcWebSocket.on(
      'accountNotification',
      this._wsOnAccountNotification.bind(this),
    );
    this._rpcWebSocket.on(
      'programNotification',
      this._wsOnProgramAccountNotification.bind(this),
    );
  }

  /**
   * 获取指定公钥的余额
   */
  async getBalance(publicKey: PublicKey): Promise<number> {
    const unsafeRes = await this._rpcRequest('getBalance', [
      publicKey.toBase58(),
    ]);
    const res = GetBalanceRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 获取指定公钥的所有帐户信息
   */
  async getAccountInfo(publicKey: PublicKey): Promise<AccountInfo> {
    const unsafeRes = await this._rpcRequest('getAccountInfo', [
      publicKey.toBase58(),
    ]);
    const res = GetAccountInfoRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }

    const {result} = res;
    assert(typeof result !== 'undefined');

    return {
      executable: result.executable,
      owner: new PublicKey(result.owner),
      difs: result.difs,
      data: Buffer.from(result.data),
    };
  }

  /**
   * 确认指定签名标识的事务
   */
  async confirmTransaction(signature: TransactionSignature): Promise<boolean> {
    const unsafeRes = await this._rpcRequest('confirmTransaction', [signature]);
    const res = ConfirmTransactionRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 获取群集的当前事务计数
   */
  async getSignatureStatus(
    signature: TransactionSignature,
  ): Promise<SignatureStatus> {
    const unsafeRes = await this._rpcRequest('getSignatureStatus', [signature]);
    const res = GetSignatureStatusRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 获取群集的当前事务计数
   */
  async getTransactionCount(): Promise<number> {
    const unsafeRes = await this._rpcRequest('getTransactionCount', []);
    const res = GetTransactionCountRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return Number(res.result);
  }

  /**
   * 从群集中获取最近的blockhash
   */
  async getRecentBlockhash(): Promise<Blockhash> {
    const unsafeRes = await this._rpcRequest('getRecentBlockhash', []);
    const res = GetRecentBlockhash(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 请求为指定帐户分配difs
   */
  async requestAirdrop(
    to: PublicKey,
    amount: number,
  ): Promise<TransactionSignature> {
    const unsafeRes = await this._rpcRequest('requestAirdrop', [
      to.toBase58(),
      amount,
    ]);
    const res = RequestAirdropRpcResult(unsafeRes);
    if (res.error) {
      throw new Error(res.error.message);
    }
    assert(typeof res.result !== 'undefined');
    return res.result;
  }

  /**
   * 签署并发送交易
   */
  async sendTransaction(
    transaction: Transaction,
    ...signers: Array<Account>
  ): Promise<TransactionSignature> {
    for (;;) {
      // 尝试使用最近的blockhash最多30秒
      const seconds = new Date().getSeconds();
      if (
        this._blockhashInfo.recentBlockhash != null &&
        this._blockhashInfo.seconds < seconds + 30
      ) {
        transaction.recentBlockhash = this._blockhashInfo.recentBlockhash;
        transaction.sign(...signers);
        if (!transaction.signature) {
          throw new Error('!signature'); // 永远不应该发生
        }

        // 如果之前使用当前的recentBlockhash没有看到此事务的签名，则全部完成。
        const signature = transaction.signature.toString();
        if (!this._blockhashInfo.transactionSignatures.includes(signature)) {
          this._blockhashInfo.transactionSignatures.push(signature);
          if (this._disableBlockhashCaching) {
            this._blockhashInfo.seconds = -1;
          }
          break;
        }
      }

      // 获取新的blockhash
      let attempts = 0;
      const startTime = Date.now();
      for (;;) {
        const recentBlockhash = await this.getRecentBlockhash();

        if (this._blockhashInfo.recentBlockhash != recentBlockhash) {
          this._blockhashInfo = {
            recentBlockhash,
            seconds: new Date().getSeconds(),
            transactionSignatures: [],
          };
          break;
        }
        if (attempts === 16) {
          throw new Error(
            `Unable to obtain a new blockhash after ${Date.now() -
              startTime}ms`,
          );
        }

        // 睡了大约半个插槽
        await sleep((500 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SECOND);

        ++attempts;
      }
    }

    const wireTransaction = transaction.serialize();
    return await this.sendRawTransaction(wireTransaction);
  }

  /**
   * 将已签名并序列化的事务发送到有线格式
   */
  async sendRawTransaction(
    rawTransaction: Buffer,
  ): Promise<TransactionSignature> {
    // sendTransaction RPC API需要在原始事务字节之前添加u64长度字段
    const rpcTransaction = Buffer.alloc(8 + rawTransaction.length);
    rpcTransaction.writeUInt32LE(rawTransaction.length, 0);
    rawTransaction.copy(rpcTransaction, 8);

    const unsafeRes = await this._rpcRequest('sendTransaction', [
      [...rpcTransaction],
    ]);
    const res = SendTransactionRpcResult(unsafeRes);
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
  _wsOnError(err: Error) {
    console.log('ws error:', err.message);
  }

  /**
   * @private
   */
  _wsOnClose(code: number, message: string) {
    // 1000意味着_rpcWebSocket.close（）被显式调用
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
    const programKeys = Object.keys(
      this._programAccountChangeSubscriptions,
    ).map(Number);
    if (accountKeys.length === 0 && programKeys.length === 0) {
      this._rpcWebSocket.close();
      return;
    }

    if (!this._rpcWebSocketConnected) {
      for (let id of accountKeys) {
        this._accountChangeSubscriptions[id].subscriptionId = null;
      }
      for (let id of programKeys) {
        this._programAccountChangeSubscriptions[id].subscriptionId = null;
      }
      this._rpcWebSocket.connect();
      return;
    }

    for (let id of accountKeys) {
      const {subscriptionId, publicKey} = this._accountChangeSubscriptions[id];
      if (subscriptionId === null) {
        try {
          this._accountChangeSubscriptions[
            id
          ].subscriptionId = await this._rpcWebSocket.call('accountSubscribe', [
            publicKey,
          ]);
        } catch (err) {
          console.log(
            `accountSubscribe error for ${publicKey}: ${err.message}`,
          );
        }
      }
    }
    for (let id of programKeys) {
      const {
        subscriptionId,
        programId,
      } = this._programAccountChangeSubscriptions[id];
      console.log('program-id: ' + programId);
      if (subscriptionId === null) {
        try {
          this._programAccountChangeSubscriptions[
            id
          ].subscriptionId = await this._rpcWebSocket.call('programSubscribe', [
            programId,
          ]);
        } catch (err) {
          console.log(
            `programSubscribe error for ${programId}: ${err.message}`,
          );
        }
      }
    }
  }

  /**
   * @private
   */
  _wsOnAccountNotification(notification: Object) {
    const res = AccountNotificationResult(notification);
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
          owner: new PublicKey(result.owner),
          difs: result.difs,
          data: Buffer.from(result.data),
        });
        return true;
      }
    }
  }

  /**
   * 注册指定帐户更改时要调用的回调
   *
   * @param publickey 要监控的帐户的公钥
   * @param callback 每当帐户更改时调用的函数
   * @return 订阅ID
   */
  onAccountChange(
    publicKey: PublicKey,
    callback: AccountChangeCallback,
  ): number {
    const id = ++this._accountChangeSubscriptionCounter;
    this._accountChangeSubscriptions[id] = {
      publicKey: publicKey.toBase58(),
      callback,
      subscriptionId: null,
    };
    this._updateSubscriptions();
    return id;
  }

  /**
   * 取消注册帐户通知回调
   *
   * @param id 订阅ID以取消注册
   */
  async removeAccountChangeListener(id: number): Promise<void> {
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
  _wsOnProgramAccountNotification(notification: Object) {
    const res = ProgramAccountNotificationResult(notification);
    if (res.error) {
      throw new Error(res.error.message);
    }

    const keys = Object.keys(this._programAccountChangeSubscriptions).map(
      Number,
    );
    for (let id of keys) {
      const sub = this._programAccountChangeSubscriptions[id];
      if (sub.subscriptionId === res.subscription) {
        const {result} = res;
        assert(typeof result !== 'undefined');

        sub.callback({
          accountId: result[0],
          accountInfo: {
            executable: result[1].executable,
            owner: new PublicKey(result[1].owner),
            difs: result[1].difs,
            data: Buffer.from(result[1].data),
          },
        });
        return true;
      }
    }
  }

  /**
   * 注册在指定程序拥有的帐户发生更改时要调用的回调
   *
   * @param programId 监控程序的公钥
   * @param callback 每当帐户更改时调用的函数
   * @return 订阅ID
   */
  onProgramAccountChange(
    programId: PublicKey,
    callback: ProgramAccountChangeCallback,
  ): number {
    const id = ++this._programAccountChangeSubscriptionCounter;
    this._programAccountChangeSubscriptions[id] = {
      programId: programId.toBase58(),
      callback,
      subscriptionId: null,
    };
    this._updateSubscriptions();
    return id;
  }

  /**
   * 取消注册帐户通知回调
   *
   * @param id 订阅ID以取消注册
   */
  async removeProgramAccountChangeListener(id: number): Promise<void> {
    if (this._programAccountChangeSubscriptions[id]) {
      const {subscriptionId} = this._programAccountChangeSubscriptions[id];
      delete this._programAccountChangeSubscriptions[id];
      if (subscriptionId !== null) {
        try {
          await this._rpcWebSocket.call('programUnsubscribe', [subscriptionId]);
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
