'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var _classCallCheck = _interopDefault(require('@babel/runtime/helpers/classCallCheck'));
var _createClass = _interopDefault(require('@babel/runtime/helpers/createClass'));
var _defineProperty = _interopDefault(require('@babel/runtime/helpers/defineProperty'));
var nacl = _interopDefault(require('tweetnacl'));
var BN = _interopDefault(require('bn.js'));
var bs58 = _interopDefault(require('bs58'));
var _regeneratorRuntime = _interopDefault(require('@babel/runtime/regenerator'));
var _asyncToGenerator = _interopDefault(require('@babel/runtime/helpers/asyncToGenerator'));
var BufferLayout = require('buffer-layout');
var _toConsumableArray = _interopDefault(require('@babel/runtime/helpers/toConsumableArray'));
var assert = _interopDefault(require('assert'));
var url = require('url');
var fetch = _interopDefault(require('node-fetch'));
var jayson = _interopDefault(require('jayson/lib/client/browser'));
var superstruct = require('superstruct');
var rpcWebsockets = require('rpc-websockets');
var _possibleConstructorReturn = _interopDefault(require('@babel/runtime/helpers/possibleConstructorReturn'));
var _getPrototypeOf = _interopDefault(require('@babel/runtime/helpers/getPrototypeOf'));
var _get = _interopDefault(require('@babel/runtime/helpers/get'));
var _inherits = _interopDefault(require('@babel/runtime/helpers/inherits'));

var PubKey =
/*#__PURE__*/
function () {
  function PubKey(value) {
    _classCallCheck(this, PubKey);

    _defineProperty(this, "_bn", void 0);

    if (typeof value === 'string') {
      if (value.startsWith('0x')) {
        this._bn = new BN(value.substring(2), 16);
      } else {
        this._bn = new BN(bs58.decode(value));
      }
    } else {
      this._bn = new BN(value);
    }

    if (this._bn.byteLength() > 32) {
      throw new Error("Invalid public key input");
    }
  }

  _createClass(PubKey, [{
    key: "equals",
    value: function equals(pubKey) {
      return this._bn.eq(pubKey._bn);
    }
  }, {
    key: "toBase58",
    value: function toBase58() {
      return bs58.encode(this.toBuffer());
    }
  }, {
    key: "toBuffer",
    value: function toBuffer() {
      var b = this._bn.toArrayLike(Buffer);

      if (b.length === 32) {
        return b;
      }

      var zeroPad = Buffer.alloc(32);
      b.copy(zeroPad, 32 - b.length);
      return zeroPad;
    }
  }, {
    key: "toString",
    value: function toString() {
      return this.toBase58();
    }
  }], [{
    key: "isPubKey",
    value: function isPubKey(o) {
      return o instanceof PubKey;
    }
  }]);

  return PubKey;
}();

/**
 * 
 */

var BusAccount =
/*#__PURE__*/
function () {
  /**
   * 
   *
   * 
   * 
   *
   * @param secretKey 
   */
  function BusAccount() {
    var secretKey = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

    _classCallCheck(this, BusAccount);

    _defineProperty(this, "_keypair", void 0);

    if (secretKey) {
      this._keypair = nacl.sign.keyPair.fromSecretKey(secretKey);
    } else {
      this._keypair = nacl.sign.keyPair();
    }
  }
  /**
   * 
   */


  _createClass(BusAccount, [{
    key: "pubKey",
    get: function get() {
      return new PubKey(this._keypair.publicKey);
    }
    /**
     * 
     */

  }, {
    key: "privateKey",
    get: function get() {
      return this._keypair.secretKey;
    }
  }]);

  return BusAccount;
}();

var NUM_TICKS_PER_SECOND = 10;
var DEFAULT_TICKS_PER_ROUND = 8;

var pubKey = function pubKey() {
  var property = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'pubKey';
  return BufferLayout.blob(32, property);
};
var uint64 = function uint64() {
  var property = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'uint64';
  return BufferLayout.blob(8, property);
};
var rustString = function rustString() {
  var property = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'string';
  var rsl = BufferLayout.struct([BufferLayout.u32('length'), BufferLayout.u32('lengthPadding'), BufferLayout.blob(BufferLayout.offset(BufferLayout.u32(), -8), 'chars')], property);

  var _decode = rsl.decode.bind(rsl);

  var _encode = rsl.encode.bind(rsl);

  rsl.decode = function (buffer, offset) {
    var data = _decode(buffer, offset);

    return data.chars.toString('utf8');
  };

  rsl.encode = function (str, buffer, offset) {
    var data = {
      chars: Buffer.from(str, 'utf8')
    };
    return _encode(data, buffer, offset);
  };

  return rsl;
};

function decodeLength(bytes) {
  var len = 0;
  var size = 0;

  for (;;) {
    var elem = bytes.shift();
    len |= (elem & 0x7f) << size * 7;
    size += 1;

    if ((elem & 0x80) === 0) {
      break;
    }
  }

  return len;
}
function encodeLength(bytes, len) {
  var rem_len = len;

  for (;;) {
    var elem = rem_len & 0x7f;
    rem_len >>= 7;

    if (rem_len == 0) {
      bytes.push(elem);
      break;
    } else {
      elem |= 0x80;
      bytes.push(elem);
    }
  }
}

/**
 */
var PACKET_DATA_SIZE = 512;
/**
 *
 * @typedef {Object} TransactionInstructionCtorFields
 * @property {?Array<PubKey>} keys
 * @property {?PubKey} controllerId
 * @property {?Buffer} data
 */

/**
 */
var TxOperation =
/**
 */

/**
 */

/**
 */
function TxOperation(opts) {
  _classCallCheck(this, TxOperation);

  _defineProperty(this, "keys", []);

  _defineProperty(this, "controllerId", void 0);

  _defineProperty(this, "data", Buffer.alloc(0));

  opts && Object.assign(this, opts);
};
/**
 * @private
 */

/**
 * Transaction class
 */
var Transaction =
/*#__PURE__*/
function () {
  _createClass(Transaction, [{
    key: "signature",

    /**
     */

    /**
     */
    get: function get() {
      if (this.signatures.length > 0) {
        return this.signatures[0].signature;
      }

      return null;
    }
    /**
     */

  }]);

  /**
   */
  function Transaction(opts) {
    _classCallCheck(this, Transaction);

    _defineProperty(this, "signatures", []);

    _defineProperty(this, "instructions", []);

    _defineProperty(this, "recentBlockhash", void 0);

    opts && Object.assign(this, opts);
  }
  /**
   */


  _createClass(Transaction, [{
    key: "add",
    value: function add() {
      var _this = this;

      for (var _len = arguments.length, items = new Array(_len), _key = 0; _key < _len; _key++) {
        items[_key] = arguments[_key];
      }

      if (items.length === 0) {
        throw new Error('No instructions');
      }

      items.forEach(function (item) {
        if (item instanceof Transaction) {
          _this.instructions = _this.instructions.concat(item.instructions);
        } else {
          _this.instructions.push(new TxOperation(item));
        }
      });
      return this;
    }
    /**
     * @private
     */

  }, {
    key: "_fetchSignData",
    value: function _fetchSignData() {
      var recentBlockhash = this.recentBlockhash;

      if (!recentBlockhash) {
        throw new Error('Transaction recentBlockhash required');
      }

      if (this.instructions.length < 1) {
        throw new Error('No instructions provided');
      }

      var keys = this.signatures.map(function (_ref) {
        var pubKey = _ref.pubKey;
        return pubKey.toString();
      });
      var numRequiredSignatures = 0;
      var controllerIds = [];
      this.instructions.forEach(function (instruction) {
        var controllerId = instruction.controllerId.toString();

        if (!controllerIds.includes(controllerId)) {
          controllerIds.push(controllerId);
        }

        instruction.keys.forEach(function (keySignerPair) {
          var keyStr = keySignerPair.pubkey.toString();

          if (!keys.includes(keyStr)) {
            if (keySignerPair.isSigner) {
              numRequiredSignatures += 1;
            }

            keys.push(keyStr);
          }
        });
      });

      if (numRequiredSignatures > this.signatures.length) {
        throw new Error("Insufficent signatures: expected ".concat(numRequiredSignatures, " but got ").concat(this.signatures.length));
      }

      var keyCount = [];
      encodeLength(keyCount, keys.length);
      var controllerIdCount = [];
      encodeLength(controllerIdCount, controllerIds.length);
      var instructions = this.instructions.map(function (instruction) {
        var data = instruction.data,
            controllerId = instruction.controllerId;
        var keyIndicesCount = [];
        encodeLength(keyIndicesCount, instruction.keys.length);
        var dataCount = [];
        encodeLength(dataCount, instruction.data.length);
        return {
          controllerIdIndex: controllerIds.indexOf(controllerId.toString()),
          keyIndicesCount: Buffer.from(keyIndicesCount),
          keyIndices: Buffer.from(instruction.keys.map(function (keyObj) {
            return keys.indexOf(keyObj.pubkey.toString());
          })),
          dataLength: Buffer.from(dataCount),
          data: data
        };
      });
      instructions.forEach(function (instruction) {
        assert(instruction.controllerIdIndex >= 0);
        instruction.keyIndices.forEach(function (keyIndex) {
          return assert(keyIndex >= 0);
        });
      });
      var instructionCount = [];
      encodeLength(instructionCount, instructions.length);
      var instructionBuffer = Buffer.alloc(PACKET_DATA_SIZE);
      Buffer.from(instructionCount).copy(instructionBuffer);
      var instructionBufferLength = instructionCount.length;
      instructions.forEach(function (instruction) {
        var instructionLayout = BufferLayout.struct([BufferLayout.u8('controllerIdIndex'), BufferLayout.blob(instruction.keyIndicesCount.length, 'keyIndicesCount'), BufferLayout.seq(BufferLayout.u8('keyIndex'), instruction.keyIndices.length, 'keyIndices'), BufferLayout.blob(instruction.dataLength.length, 'dataLength'), BufferLayout.seq(BufferLayout.u8('userdatum'), instruction.data.length, 'data')]);
        var length = instructionLayout.encode(instruction, instructionBuffer, instructionBufferLength);
        instructionBufferLength += length;
      });
      instructionBuffer = instructionBuffer.slice(0, instructionBufferLength);
      var signDataLayout = BufferLayout.struct([BufferLayout.blob(1, 'numRequiredSignatures'), BufferLayout.blob(keyCount.length, 'keyCount'), BufferLayout.seq(pubKey('key'), keys.length, 'keys'), pubKey('recentBlockhash'), BufferLayout.blob(controllerIdCount.length, 'controllerIdCount'), BufferLayout.seq(pubKey('controllerId'), controllerIds.length, 'controllerIds')]);
      var transaction = {
        numRequiredSignatures: Buffer.from([this.signatures.length]),
        keyCount: Buffer.from(keyCount),
        keys: keys.map(function (key) {
          return new PubKey(key).toBuffer();
        }),
        recentBlockhash: Buffer.from(bs58.decode(recentBlockhash)),
        controllerIdCount: Buffer.from(controllerIdCount),
        controllerIds: controllerIds.map(function (controllerId) {
          return new PubKey(controllerId).toBuffer();
        })
      };
      var signData = Buffer.alloc(2048);
      var length = signDataLayout.encode(transaction, signData);
      instructionBuffer.copy(signData, length);
      signData = signData.slice(0, length + instructionBuffer.length);
      return signData;
    }
  }, {
    key: "sign",
    value: function sign() {
      this.signPartial.apply(this, arguments);
    }
  }, {
    key: "signPartial",
    value: function signPartial() {
      for (var _len2 = arguments.length, partialSigners = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        partialSigners[_key2] = arguments[_key2];
      }

      if (partialSigners.length === 0) {
        throw new Error('No signers');
      }

      var signatures = partialSigners.map(function (accountOrPubKey) {
        var pubKey = accountOrPubKey instanceof BusAccount ? accountOrPubKey.pubKey : accountOrPubKey;
        return {
          signature: null,
          pubKey: pubKey
        };
      });
      this.signatures = signatures;

      var signData = this._fetchSignData();

      partialSigners.forEach(function (accountOrPubKey, index) {
        if (accountOrPubKey instanceof PubKey) {
          return;
        }

        var signature = nacl.sign.detached(signData, accountOrPubKey.privateKey);
        assert(signature.length === 64);
        signatures[index].signature = Buffer.from(signature);
      });
    }
  }, {
    key: "addSigner",
    value: function addSigner(signer) {
      var index = this.signatures.findIndex(function (sigpair) {
        return signer.pubKey.equals(sigpair.pubKey);
      });

      if (index < 0) {
        throw new Error("Unknown signer: ".concat(signer.pubKey.toString()));
      }

      var signData = this._fetchSignData();

      var signature = nacl.sign.detached(signData, signer.privateKey);
      assert(signature.length === 64);
      this.signatures[index].signature = Buffer.from(signature);
    }
  }, {
    key: "serialize",
    value: function serialize() {
      var signatures = this.signatures;

      if (!signatures) {
        throw new Error('Transaction has not been signed');
      }

      var signData = this._fetchSignData();

      var signatureCount = [];
      encodeLength(signatureCount, signatures.length);
      var transactionLength = signatureCount.length + signatures.length * 64 + signData.length;
      var wireTransaction = Buffer.alloc(transactionLength);
      assert(signatures.length < 256);
      Buffer.from(signatureCount).copy(wireTransaction, 0);
      signatures.forEach(function (_ref2, index) {
        var signature = _ref2.signature;
        assert(signature !== null, "null signature");
        assert(signature.length === 64, "signature has invalid length");
        Buffer.from(signature).copy(wireTransaction, signatureCount.length + index * 64);
      });
      signData.copy(wireTransaction, signatureCount.length + signatures.length * 64);
      assert(wireTransaction.length <= PACKET_DATA_SIZE, "Transaction too large: ".concat(wireTransaction.length, " > ").concat(PACKET_DATA_SIZE));
      return wireTransaction;
    }
    /**
     * @private
     */

  }, {
    key: "keys",
    get: function get() {
      assert(this.instructions.length === 1);
      return this.instructions[0].keys.map(function (keyObj) {
        return keyObj.pubkey;
      });
    }
    /**
     * @private
     */

  }, {
    key: "controllerId",
    get: function get() {
      assert(this.instructions.length === 1);
      return this.instructions[0].controllerId;
    }
    /**
     * @private
     */

  }, {
    key: "data",
    get: function get() {
      assert(this.instructions.length === 1);
      return this.instructions[0].data;
    }
    /**
     */

  }], [{
    key: "from",
    value: function from(buffer) {
      var PUBKEY_LENGTH = 32;
      var SIGNATURE_LENGTH = 64;
      var transaction = new Transaction();

      var byteArray = _toConsumableArray(buffer);

      var signatureCount = decodeLength(byteArray);
      var signatures = [];

      for (var i = 0; i < signatureCount; i++) {
        var signature = byteArray.slice(0, SIGNATURE_LENGTH);
        byteArray = byteArray.slice(SIGNATURE_LENGTH);
        signatures.push(signature);
      }

      byteArray = byteArray.slice(1);
      var accountCount = decodeLength(byteArray);
      var accounts = [];

      for (var _i = 0; _i < accountCount; _i++) {
        var account = byteArray.slice(0, PUBKEY_LENGTH);
        byteArray = byteArray.slice(PUBKEY_LENGTH);
        accounts.push(account);
      }

      var recentBlockhash = byteArray.slice(0, PUBKEY_LENGTH);
      byteArray = byteArray.slice(PUBKEY_LENGTH);
      var controllerIdCount = decodeLength(byteArray);
      var programs = [];

      for (var _i2 = 0; _i2 < controllerIdCount; _i2++) {
        var program = byteArray.slice(0, PUBKEY_LENGTH);
        byteArray = byteArray.slice(PUBKEY_LENGTH);
        programs.push(program);
      }

      var instructionCount = decodeLength(byteArray);
      var instructions = [];

      for (var _i3 = 0; _i3 < instructionCount; _i3++) {
        var instruction = {};
        instruction.programIndex = byteArray.shift();
        var accountIndexCount = decodeLength(byteArray);
        instruction.accountIndex = byteArray.slice(0, accountIndexCount);
        byteArray = byteArray.slice(accountIndexCount);
        var dataLength = decodeLength(byteArray);
        instruction.data = byteArray.slice(0, dataLength);
        byteArray = byteArray.slice(dataLength);
        instructions.push(instruction);
      }

      transaction.recentBlockhash = new PubKey(recentBlockhash).toBase58();

      for (var _i4 = 0; _i4 < signatureCount; _i4++) {
        var sigPubkeyPair = {
          signature: Buffer.from(signatures[_i4]),
          pubKey: new PubKey(accounts[_i4])
        };
        transaction.signatures.push(sigPubkeyPair);
      }

      for (var _i5 = 0; _i5 < instructionCount; _i5++) {
        var instructionData = {
          keys: [],
          controllerId: new PubKey(programs[instructions[_i5].programIndex]),
          data: Buffer.from(instructions[_i5].data)
        };

        var _loop = function _loop(j) {
          var pubkey = new PubKey(accounts[instructions[_i5].accountIndex[j]]);
          instructionData.keys.push({
            pubkey: pubkey,
            isSigner: transaction.signatures.some(function (keyObj) {
              return keyObj.pubKey.toString() === pubkey.toString();
            })
          });
        };

        for (var j = 0; j < instructions[_i5].accountIndex.length; j++) {
          _loop(j);
        }

        var _instruction = new TxOperation(instructionData);

        transaction.instructions.push(_instruction);
      }

      return transaction;
    }
  }]);

  return Transaction;
}();

// 
function sleep(ms) {
  return new Promise(function (resolve) {
    return setTimeout(resolve, ms);
  });
}

function createRpcReq(url) {
  var server = jayson(
  /*#__PURE__*/
  function () {
    var _ref = _asyncToGenerator(
    /*#__PURE__*/
    _regeneratorRuntime.mark(function _callee(request, callback) {
      var options, res, text;
      return _regeneratorRuntime.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              options = {
                method: 'POST',
                body: request,
                headers: {
                  'Content-Type': 'application/json'
                }
              };
              _context.prev = 1;
              _context.next = 4;
              return fetch(url, options);

            case 4:
              res = _context.sent;
              _context.next = 7;
              return res.text();

            case 7:
              text = _context.sent;
              callback(null, text);
              _context.next = 14;
              break;

            case 11:
              _context.prev = 11;
              _context.t0 = _context["catch"](1);
              callback(_context.t0);

            case 14:
            case "end":
              return _context.stop();
          }
        }
      }, _callee, null, [[1, 11]]);
    }));

    return function (_x, _x2) {
      return _ref.apply(this, arguments);
    };
  }());
  return function (method, args) {
    return new Promise(function (resolve, reject) {
      server.request(method, args, function (err, response) {
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


var FetchBalanceRpcResult = superstruct.struct({
  jsonrpc: superstruct.struct.literal('2.0'),
  id: 'string',
  error: 'any?',
  result: 'number?'
});
/**
 * @private
 */

function jsonRpcResult(resultDescription) {
  var jsonRpcVersion = superstruct.struct.literal('2.0');
  return superstruct.struct.union([superstruct.struct({
    jsonrpc: jsonRpcVersion,
    id: 'string',
    error: 'any'
  }), superstruct.struct({
    jsonrpc: jsonRpcVersion,
    id: 'string',
    error: 'null?',
    result: resultDescription
  })]);
}
/**
 * @private
 */


var AccountDetailResult = superstruct.struct({
  executable: 'boolean',
  owner: 'array',
  // lamports: 'number',
  dif: 'number',
  data: 'array'
});
/**
 *
 */

var FetchAccountDetailRpcResult = jsonRpcResult(AccountDetailResult);
/***
 * 
 */

var AccountNoticeResult = superstruct.struct({
  subscription: 'number',
  result: AccountDetailResult
});
/**
 * @private
 */

var ControllerAccountDetailResult = superstruct.struct(['string', AccountDetailResult]);
/***
 * 
 */

var ControllerAccountNoticeResult = superstruct.struct({
  subscription: 'number',
  result: ControllerAccountDetailResult
});
/**
 * 
 */

var ConfmTxnRpcResult = jsonRpcResult('boolean');
/**
 *
 */

var FetchRoundLeader = jsonRpcResult('string');
/**
 * 
 */

var FetchClusterNodes = jsonRpcResult(superstruct.struct.list([superstruct.struct({
  id: 'string',
  gossip: 'string',
  tpu: superstruct.struct.union(['null', 'string']),
  rpc: superstruct.struct.union(['null', 'string'])
})]));
/**
 * 
 */

var FetchSignatureStateRpcResult = jsonRpcResult(superstruct.struct.union(['null', superstruct.struct.union([superstruct.struct({
  Ok: 'null'
}), superstruct.struct({
  Err: 'object'
})])]));
/**
 *
 */

var FetchTxnAmountRpcResult = jsonRpcResult('number');
/**
 * 
 */

var FetchRecentBlockhash = jsonRpcResult('string');
/**
 * 
 */

var ReqDroneRpcResult = jsonRpcResult('string');
/**
 * 
 */

var SendTxnRpcResult = jsonRpcResult('string');
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

/**
 * 
 */
var Connection =
/*#__PURE__*/
function () {
  /**
   * 
   *
   * 
   */
  function Connection(endpoint) {
    _classCallCheck(this, Connection);

    _defineProperty(this, "_rpcReq", void 0);

    _defineProperty(this, "_rpcWebSocket", void 0);

    _defineProperty(this, "_rpcWebSocketConnected", false);

    _defineProperty(this, "_blockhashInfo", void 0);

    _defineProperty(this, "_disableBlockhashCaching", false);

    _defineProperty(this, "_accountChangeSubscriptions", {});

    _defineProperty(this, "_accountChangeSubscriptionCounter", 0);

    _defineProperty(this, "_controllerAccountChangeSubscriptions", {});

    _defineProperty(this, "_controllerAccountChangeSubscriptionCounter", 0);

    var url$1 = url.parse(endpoint);
    this._rpcReq = createRpcReq(url$1.href);
    this._blockhashInfo = {
      recentBlockhash: null,
      seconds: -1,
      transactionSignatures: []
    };
    url$1.protocol = url$1.protocol === 'https:' ? 'wss:' : 'ws:';
    url$1.host = '';
    url$1.port = String(Number(url$1.port) + 1);

    if (url$1.port === '1') {
      url$1.port = url$1.protocol === 'wss:' ? '8901' : '8900';
    }

    this._rpcWebSocket = new rpcWebsockets.Client(url.format(url$1), {
      autoconnect: false,
      max_reconnects: Infinity
    });

    this._rpcWebSocket.on('open', this._wsOnOpen.bind(this));

    this._rpcWebSocket.on('error', this._wsOnErr.bind(this));

    this._rpcWebSocket.on('close', this._wsOnClose.bind(this));

    this._rpcWebSocket.on('accountNotice', this._wsOnAccountNotice.bind(this));

    this._rpcWebSocket.on('controllerNotification', this._wsOnControllerAccountNotice.bind(this));
  }
  /**
   * 
   */


  _createClass(Connection, [{
    key: "fetchAccountBalance",
    value: function () {
      var _fetchAccountBalance = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee2(pubKey) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.next = 2;
                return this._rpcReq('getDif', [pubKey.toBase58()]);

              case 2:
                unsafeRes = _context2.sent;
                res = FetchBalanceRpcResult(unsafeRes);

                if (!res.error) {
                  _context2.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context2.abrupt("return", res.result);

              case 8:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function fetchAccountBalance(_x3) {
        return _fetchAccountBalance.apply(this, arguments);
      }

      return fetchAccountBalance;
    }()
    /**
     *
     */

  }, {
    key: "fetchAccountDetail",
    value: function () {
      var _fetchAccountDetail = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee3(pubKey) {
        var unsafeRes, res, result;
        return _regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.next = 2;
                return this._rpcReq('getAccountInfo', [pubKey.toBase58()]);

              case 2:
                unsafeRes = _context3.sent;
                res = FetchAccountDetailRpcResult(unsafeRes);

                if (!res.error) {
                  _context3.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                result = res.result;
                assert(typeof result !== 'undefined');
                return _context3.abrupt("return", {
                  executable: result.executable,
                  owner: new PubKey(result.owner),
                  dif: result.dif,
                  data: Buffer.from(result.data)
                });

              case 9:
              case "end":
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function fetchAccountDetail(_x4) {
        return _fetchAccountDetail.apply(this, arguments);
      }

      return fetchAccountDetail;
    }()
    /**
     * 
     */

  }, {
    key: "confmTxn",
    value: function () {
      var _confmTxn = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee4(signature) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                _context4.next = 2;
                return this._rpcReq('confirmTxn', [signature]);

              case 2:
                unsafeRes = _context4.sent;
                res = ConfmTxnRpcResult(unsafeRes);

                if (!res.error) {
                  _context4.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context4.abrupt("return", res.result);

              case 8:
              case "end":
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function confmTxn(_x5) {
        return _confmTxn.apply(this, arguments);
      }

      return confmTxn;
    }()
    /**
     * 
     */

  }, {
    key: "fetchRoundLeader",
    value: function () {
      var _fetchRoundLeader = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee5() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                _context5.next = 2;
                return this._rpcReq('getRoundLeader', []);

              case 2:
                unsafeRes = _context5.sent;
                res = FetchRoundLeader(unsafeRes);

                if (!res.error) {
                  _context5.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context5.abrupt("return", res.result);

              case 8:
              case "end":
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function fetchRoundLeader() {
        return _fetchRoundLeader.apply(this, arguments);
      }

      return fetchRoundLeader;
    }()
    /**
     * 
     */

  }, {
    key: "fetchClusterNodes",
    value: function () {
      var _fetchClusterNodes = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee6() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                _context6.next = 2;
                return this._rpcReq('getClusterNodes', []);

              case 2:
                unsafeRes = _context6.sent;
                res = FetchClusterNodes(unsafeRes);

                if (!res.error) {
                  _context6.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context6.abrupt("return", res.result);

              case 8:
              case "end":
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function fetchClusterNodes() {
        return _fetchClusterNodes.apply(this, arguments);
      }

      return fetchClusterNodes;
    }()
    /**
     * 
     */

  }, {
    key: "fetchSignatureState",
    value: function () {
      var _fetchSignatureState = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee7(signature) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                _context7.next = 2;
                return this._rpcReq('getSignatureState', [signature]);

              case 2:
                unsafeRes = _context7.sent;
                res = FetchSignatureStateRpcResult(unsafeRes);

                if (!res.error) {
                  _context7.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context7.abrupt("return", res.result);

              case 8:
              case "end":
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function fetchSignatureState(_x6) {
        return _fetchSignatureState.apply(this, arguments);
      }

      return fetchSignatureState;
    }()
    /**
     * 
     */

  }, {
    key: "fetchTxnAmount",
    value: function () {
      var _fetchTxnAmount = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee8() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                _context8.next = 2;
                return this._rpcReq('getTxnCnt', []);

              case 2:
                unsafeRes = _context8.sent;
                res = FetchTxnAmountRpcResult(unsafeRes);

                if (!res.error) {
                  _context8.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context8.abrupt("return", Number(res.result));

              case 8:
              case "end":
                return _context8.stop();
            }
          }
        }, _callee8, this);
      }));

      function fetchTxnAmount() {
        return _fetchTxnAmount.apply(this, arguments);
      }

      return fetchTxnAmount;
    }()
    /**
     * 
     */

  }, {
    key: "fetchRecentBlockhash",
    value: function () {
      var _fetchRecentBlockhash = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee9() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                _context9.next = 2;
                return this._rpcReq('getLatestBlockhash', []);

              case 2:
                unsafeRes = _context9.sent;
                res = FetchRecentBlockhash(unsafeRes);

                if (!res.error) {
                  _context9.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context9.abrupt("return", res.result);

              case 8:
              case "end":
                return _context9.stop();
            }
          }
        }, _callee9, this);
      }));

      function fetchRecentBlockhash() {
        return _fetchRecentBlockhash.apply(this, arguments);
      }

      return fetchRecentBlockhash;
    }()
    /**
     * 
     */

  }, {
    key: "reqDrone",
    value: function () {
      var _reqDrone = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee10(to, amount) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee10$(_context10) {
          while (1) {
            switch (_context10.prev = _context10.next) {
              case 0:
                _context10.next = 2;
                return this._rpcReq('requestDif', [to.toBase58(), amount]);

              case 2:
                unsafeRes = _context10.sent;
                res = ReqDroneRpcResult(unsafeRes);

                if (!res.error) {
                  _context10.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context10.abrupt("return", res.result);

              case 8:
              case "end":
                return _context10.stop();
            }
          }
        }, _callee10, this);
      }));

      function reqDrone(_x7, _x8) {
        return _reqDrone.apply(this, arguments);
      }

      return reqDrone;
    }()
    /**
     * 
     */

  }, {
    key: "sendTxn",
    value: function () {
      var _sendTxn = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee11(transaction) {
        var _len,
            signers,
            _key,
            seconds,
            signature,
            attempts,
            startTime,
            recentBlockhash,
            wireTransaction,
            _args11 = arguments;

        return _regeneratorRuntime.wrap(function _callee11$(_context11) {
          while (1) {
            switch (_context11.prev = _context11.next) {
              case 0:
                for (_len = _args11.length, signers = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                  signers[_key - 1] = _args11[_key];
                }

              case 1:
                seconds = new Date().getSeconds();

                if (!(this._blockhashInfo.recentBlockhash != null && this._blockhashInfo.seconds < seconds + 30)) {
                  _context11.next = 12;
                  break;
                }

                transaction.recentBlockhash = this._blockhashInfo.recentBlockhash;
                transaction.sign.apply(transaction, signers);

                if (transaction.signature) {
                  _context11.next = 7;
                  break;
                }

                throw new Error('!signature');

              case 7:
                signature = transaction.signature.toString();

                if (this._blockhashInfo.transactionSignatures.includes(signature)) {
                  _context11.next = 12;
                  break;
                }

                this._blockhashInfo.transactionSignatures.push(signature);

                if (this._disableBlockhashCaching) {
                  this._blockhashInfo.seconds = -1;
                }

                return _context11.abrupt("break", 29);

              case 12:
                attempts = 0;
                startTime = Date.now();

              case 14:
                _context11.next = 16;
                return this.fetchRecentBlockhash();

              case 16:
                recentBlockhash = _context11.sent;

                if (!(this._blockhashInfo.recentBlockhash != recentBlockhash)) {
                  _context11.next = 20;
                  break;
                }

                this._blockhashInfo = {
                  recentBlockhash: recentBlockhash,
                  seconds: new Date().getSeconds(),
                  transactionSignatures: []
                };
                return _context11.abrupt("break", 27);

              case 20:
                if (!(attempts === 50)) {
                  _context11.next = 22;
                  break;
                }

                throw new Error("Unable to obtain a new blockhash after ".concat(Date.now() - startTime, "ms"));

              case 22:
                _context11.next = 24;
                return sleep(500 * DEFAULT_TICKS_PER_ROUND / NUM_TICKS_PER_SECOND);

              case 24:
                ++attempts;

              case 25:
                _context11.next = 14;
                break;

              case 27:
                _context11.next = 1;
                break;

              case 29:
                wireTransaction = transaction.serialize();
                _context11.next = 32;
                return this.sendOriginalTx(wireTransaction);

              case 32:
                return _context11.abrupt("return", _context11.sent);

              case 33:
              case "end":
                return _context11.stop();
            }
          }
        }, _callee11, this);
      }));

      function sendTxn(_x9) {
        return _sendTxn.apply(this, arguments);
      }

      return sendTxn;
    }()
    /**
     * @private
     */

  }, {
    key: "fullnodeExit",
    value: function () {
      var _fullnodeExit = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee12() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee12$(_context12) {
          while (1) {
            switch (_context12.prev = _context12.next) {
              case 0:
                _context12.next = 2;
                return this._rpcReq('fullnodeQuit', []);

              case 2:
                unsafeRes = _context12.sent;
                res = jsonRpcResult('boolean')(unsafeRes);

                if (!res.error) {
                  _context12.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context12.abrupt("return", res.result);

              case 8:
              case "end":
                return _context12.stop();
            }
          }
        }, _callee12, this);
      }));

      function fullnodeExit() {
        return _fullnodeExit.apply(this, arguments);
      }

      return fullnodeExit;
    }()
  }, {
    key: "sendOriginalTx",
    value: function () {
      var _sendOriginalTx = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee13(rawTransaction) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee13$(_context13) {
          while (1) {
            switch (_context13.prev = _context13.next) {
              case 0:
                _context13.next = 2;
                return this._rpcReq('sendTxn', [_toConsumableArray(rawTransaction)]);

              case 2:
                unsafeRes = _context13.sent;
                res = SendTxnRpcResult(unsafeRes);

                if (!res.error) {
                  _context13.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                assert(res.result);
                return _context13.abrupt("return", res.result);

              case 9:
              case "end":
                return _context13.stop();
            }
          }
        }, _callee13, this);
      }));

      function sendOriginalTx(_x10) {
        return _sendOriginalTx.apply(this, arguments);
      }

      return sendOriginalTx;
    }()
    /**
     * @private
     */

  }, {
    key: "_wsOnOpen",
    value: function _wsOnOpen() {
      this._rpcWebSocketConnected = true;

      this._updateSubscriptions();
    }
    /**
     * @private
     */

  }, {
    key: "_wsOnErr",
    value: function _wsOnErr(err) {
      console.log('ws error:', err.message);
    }
    /**
     * @private
     */

  }, {
    key: "_wsOnClose",
    value: function _wsOnClose(code, message) {
      if (code !== 1000) {
        console.log('ws close:', code, message);
      }

      this._rpcWebSocketConnected = false;
    }
    /**
     * @private
     */

  }, {
    key: "_updateSubscriptions",
    value: function () {
      var _updateSubscriptions2 = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee14() {
        var accountKeys, controllerKeys, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, id, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, _id, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, _id2, _this$_accountChangeS, subscriptionId, pubKey, _iteratorNormalCompletion4, _didIteratorError4, _iteratorError4, _iterator4, _step4, _id3, _this$_controllerAcco, controllerId;

        return _regeneratorRuntime.wrap(function _callee14$(_context14) {
          while (1) {
            switch (_context14.prev = _context14.next) {
              case 0:
                accountKeys = Object.keys(this._accountChangeSubscriptions).map(Number);
                controllerKeys = Object.keys(this._controllerAccountChangeSubscriptions).map(Number);

                if (!(accountKeys.length === 0 && controllerKeys.length === 0)) {
                  _context14.next = 5;
                  break;
                }

                this._rpcWebSocket.close();

                return _context14.abrupt("return");

              case 5:
                if (this._rpcWebSocketConnected) {
                  _context14.next = 46;
                  break;
                }

                _iteratorNormalCompletion = true;
                _didIteratorError = false;
                _iteratorError = undefined;
                _context14.prev = 9;

                for (_iterator = accountKeys[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                  id = _step.value;
                  this._accountChangeSubscriptions[id].subscriptionId = null;
                }

                _context14.next = 17;
                break;

              case 13:
                _context14.prev = 13;
                _context14.t0 = _context14["catch"](9);
                _didIteratorError = true;
                _iteratorError = _context14.t0;

              case 17:
                _context14.prev = 17;
                _context14.prev = 18;

                if (!_iteratorNormalCompletion && _iterator["return"] != null) {
                  _iterator["return"]();
                }

              case 20:
                _context14.prev = 20;

                if (!_didIteratorError) {
                  _context14.next = 23;
                  break;
                }

                throw _iteratorError;

              case 23:
                return _context14.finish(20);

              case 24:
                return _context14.finish(17);

              case 25:
                _iteratorNormalCompletion2 = true;
                _didIteratorError2 = false;
                _iteratorError2 = undefined;
                _context14.prev = 28;

                for (_iterator2 = controllerKeys[Symbol.iterator](); !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  _id = _step2.value;
                  this._controllerAccountChangeSubscriptions[_id].subscriptionId = null;
                }

                _context14.next = 36;
                break;

              case 32:
                _context14.prev = 32;
                _context14.t1 = _context14["catch"](28);
                _didIteratorError2 = true;
                _iteratorError2 = _context14.t1;

              case 36:
                _context14.prev = 36;
                _context14.prev = 37;

                if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
                  _iterator2["return"]();
                }

              case 39:
                _context14.prev = 39;

                if (!_didIteratorError2) {
                  _context14.next = 42;
                  break;
                }

                throw _iteratorError2;

              case 42:
                return _context14.finish(39);

              case 43:
                return _context14.finish(36);

              case 44:
                this._rpcWebSocket.connect();

                return _context14.abrupt("return");

              case 46:
                _iteratorNormalCompletion3 = true;
                _didIteratorError3 = false;
                _iteratorError3 = undefined;
                _context14.prev = 49;
                _iterator3 = accountKeys[Symbol.iterator]();

              case 51:
                if (_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done) {
                  _context14.next = 67;
                  break;
                }

                _id2 = _step3.value;
                _this$_accountChangeS = this._accountChangeSubscriptions[_id2], subscriptionId = _this$_accountChangeS.subscriptionId, pubKey = _this$_accountChangeS.pubKey;

                if (!(subscriptionId === null)) {
                  _context14.next = 64;
                  break;
                }

                _context14.prev = 55;
                _context14.next = 58;
                return this._rpcWebSocket.call('accountSubscribe', [pubKey]);

              case 58:
                this._accountChangeSubscriptions[_id2].subscriptionId = _context14.sent;
                _context14.next = 64;
                break;

              case 61:
                _context14.prev = 61;
                _context14.t2 = _context14["catch"](55);
                console.log("accountSubscribe error for ".concat(pubKey, ": ").concat(_context14.t2.message));

              case 64:
                _iteratorNormalCompletion3 = true;
                _context14.next = 51;
                break;

              case 67:
                _context14.next = 73;
                break;

              case 69:
                _context14.prev = 69;
                _context14.t3 = _context14["catch"](49);
                _didIteratorError3 = true;
                _iteratorError3 = _context14.t3;

              case 73:
                _context14.prev = 73;
                _context14.prev = 74;

                if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
                  _iterator3["return"]();
                }

              case 76:
                _context14.prev = 76;

                if (!_didIteratorError3) {
                  _context14.next = 79;
                  break;
                }

                throw _iteratorError3;

              case 79:
                return _context14.finish(76);

              case 80:
                return _context14.finish(73);

              case 81:
                _iteratorNormalCompletion4 = true;
                _didIteratorError4 = false;
                _iteratorError4 = undefined;
                _context14.prev = 84;
                _iterator4 = controllerKeys[Symbol.iterator]();

              case 86:
                if (_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done) {
                  _context14.next = 102;
                  break;
                }

                _id3 = _step4.value;
                _this$_controllerAcco = this._controllerAccountChangeSubscriptions[_id3], subscriptionId = _this$_controllerAcco.subscriptionId, controllerId = _this$_controllerAcco.controllerId;

                if (!(subscriptionId === null)) {
                  _context14.next = 99;
                  break;
                }

                _context14.prev = 90;
                _context14.next = 93;
                return this._rpcWebSocket.call('controllerSubscribe', [controllerId]);

              case 93:
                this._controllerAccountChangeSubscriptions[_id3].subscriptionId = _context14.sent;
                _context14.next = 99;
                break;

              case 96:
                _context14.prev = 96;
                _context14.t4 = _context14["catch"](90);
                console.log("programSubscribe error for ".concat(controllerId, ": ").concat(_context14.t4.message));

              case 99:
                _iteratorNormalCompletion4 = true;
                _context14.next = 86;
                break;

              case 102:
                _context14.next = 108;
                break;

              case 104:
                _context14.prev = 104;
                _context14.t5 = _context14["catch"](84);
                _didIteratorError4 = true;
                _iteratorError4 = _context14.t5;

              case 108:
                _context14.prev = 108;
                _context14.prev = 109;

                if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
                  _iterator4["return"]();
                }

              case 111:
                _context14.prev = 111;

                if (!_didIteratorError4) {
                  _context14.next = 114;
                  break;
                }

                throw _iteratorError4;

              case 114:
                return _context14.finish(111);

              case 115:
                return _context14.finish(108);

              case 116:
              case "end":
                return _context14.stop();
            }
          }
        }, _callee14, this, [[9, 13, 17, 25], [18,, 20, 24], [28, 32, 36, 44], [37,, 39, 43], [49, 69, 73, 81], [55, 61], [74,, 76, 80], [84, 104, 108, 116], [90, 96], [109,, 111, 115]]);
      }));

      function _updateSubscriptions() {
        return _updateSubscriptions2.apply(this, arguments);
      }

      return _updateSubscriptions;
    }()
    /**
     * @private
     */

  }, {
    key: "_wsOnAccountNotice",
    value: function _wsOnAccountNotice(notification) {
      var res = AccountNoticeResult(notification);

      if (res.error) {
        throw new Error(res.error.message);
      }

      var keys = Object.keys(this._accountChangeSubscriptions).map(Number);
      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (var _iterator5 = keys[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          var id = _step5.value;
          var sub = this._accountChangeSubscriptions[id];

          if (sub.subscriptionId === res.subscription) {
            var result = res.result;
            assert(typeof result !== 'undefined');
            sub.callback({
              executable: result.executable,
              owner: new PubKey(result.owner),
              dif: result.dif,
              data: Buffer.from(result.data)
            });
            return true;
          }
        }
      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5["return"] != null) {
            _iterator5["return"]();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }
    }
  }, {
    key: "onAccountChange",
    value: function onAccountChange(pubKey, callback) {
      var id = ++this._accountChangeSubscriptionCounter;
      this._accountChangeSubscriptions[id] = {
        pubKey: pubKey.toBase58(),
        callback: callback,
        subscriptionId: null
      };

      this._updateSubscriptions();

      return id;
    }
  }, {
    key: "removeListenerOfAccountChange",
    value: function () {
      var _removeListenerOfAccountChange = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee15(id) {
        var subscriptionId;
        return _regeneratorRuntime.wrap(function _callee15$(_context15) {
          while (1) {
            switch (_context15.prev = _context15.next) {
              case 0:
                if (!this._accountChangeSubscriptions[id]) {
                  _context15.next = 15;
                  break;
                }

                subscriptionId = this._accountChangeSubscriptions[id].subscriptionId;
                delete this._accountChangeSubscriptions[id];

                if (!(subscriptionId !== null)) {
                  _context15.next = 12;
                  break;
                }

                _context15.prev = 4;
                _context15.next = 7;
                return this._rpcWebSocket.call('accountUnsubscribe', [subscriptionId]);

              case 7:
                _context15.next = 12;
                break;

              case 9:
                _context15.prev = 9;
                _context15.t0 = _context15["catch"](4);
                console.log('accountUnsubscribe error:', _context15.t0.message);

              case 12:
                this._updateSubscriptions();

                _context15.next = 16;
                break;

              case 15:
                throw new Error("Unknown account change id: ".concat(id));

              case 16:
              case "end":
                return _context15.stop();
            }
          }
        }, _callee15, this, [[4, 9]]);
      }));

      function removeListenerOfAccountChange(_x11) {
        return _removeListenerOfAccountChange.apply(this, arguments);
      }

      return removeListenerOfAccountChange;
    }()
    /**
     * @private
     */

  }, {
    key: "_wsOnControllerAccountNotice",
    value: function _wsOnControllerAccountNotice(notification) {
      var res = ControllerAccountNoticeResult(notification);

      if (res.error) {
        throw new Error(res.error.message);
      }

      var keys = Object.keys(this._controllerAccountChangeSubscriptions).map(Number);
      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (var _iterator6 = keys[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
          var id = _step6.value;
          var sub = this._controllerAccountChangeSubscriptions[id];

          if (sub.subscriptionId === res.subscription) {
            var result = res.result;
            assert(typeof result !== 'undefined');
            sub.callback({
              accountId: result[0],
              accountDetail: {
                executable: result[1].executable,
                owner: new PubKey(result[1].owner),
                dif: result[1].dif,
                data: Buffer.from(result[1].data)
              }
            });
            return true;
          }
        }
      } catch (err) {
        _didIteratorError6 = true;
        _iteratorError6 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion6 && _iterator6["return"] != null) {
            _iterator6["return"]();
          }
        } finally {
          if (_didIteratorError6) {
            throw _iteratorError6;
          }
        }
      }
    }
  }, {
    key: "onControllerAccountChange",
    value: function onControllerAccountChange(controllerId, callback) {
      var id = ++this._controllerAccountChangeSubscriptionCounter;
      this._controllerAccountChangeSubscriptions[id] = {
        controllerId: controllerId.toBase58(),
        callback: callback,
        subscriptionId: null
      };

      this._updateSubscriptions();

      return id;
    }
  }, {
    key: "removeControllerAccountChangeListener",
    value: function () {
      var _removeControllerAccountChangeListener = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee16(id) {
        var subscriptionId;
        return _regeneratorRuntime.wrap(function _callee16$(_context16) {
          while (1) {
            switch (_context16.prev = _context16.next) {
              case 0:
                if (!this._controllerAccountChangeSubscriptions[id]) {
                  _context16.next = 15;
                  break;
                }

                subscriptionId = this._controllerAccountChangeSubscriptions[id].subscriptionId;
                delete this._controllerAccountChangeSubscriptions[id];

                if (!(subscriptionId !== null)) {
                  _context16.next = 12;
                  break;
                }

                _context16.prev = 4;
                _context16.next = 7;
                return this._rpcWebSocket.call('controllerUnsubscribe', [subscriptionId]);

              case 7:
                _context16.next = 12;
                break;

              case 9:
                _context16.prev = 9;
                _context16.t0 = _context16["catch"](4);
                console.log('controllerUnsubscribe error:', _context16.t0.message);

              case 12:
                this._updateSubscriptions();

                _context16.next = 16;
                break;

              case 15:
                throw new Error("Unknown account change id: ".concat(id));

              case 16:
              case "end":
                return _context16.stop();
            }
          }
        }, _callee16, this, [[4, 9]]);
      }));

      function removeControllerAccountChangeListener(_x12) {
        return _removeControllerAccountChangeListener.apply(this, arguments);
      }

      return removeControllerAccountChangeListener;
    }()
  }]);

  return Connection;
}();

/**
 * 
 */

function sendAndConfmTxn(_x, _x2) {
  return _sendAndConfmTxn.apply(this, arguments);
}

function _sendAndConfmTxn() {
  _sendAndConfmTxn = _asyncToGenerator(
  /*#__PURE__*/
  _regeneratorRuntime.mark(function _callee(connection, transaction) {
    var sendRetries,
        signature,
        _len,
        signers,
        _key,
        start,
        status,
        statusRetries,
        duration,
        _args = arguments;

    return _regeneratorRuntime.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            sendRetries = 10;

            for (_len = _args.length, signers = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
              signers[_key - 2] = _args[_key];
            }

          case 2:
            start = Date.now();
            _context.next = 5;
            return connection.sendTxn.apply(connection, [transaction].concat(signers));

          case 5:
            signature = _context.sent;
            // 
            status = null;
            statusRetries = 6;

          case 8:
            _context.next = 10;
            return connection.fetchSignatureState(signature);

          case 10:
            status = _context.sent;

            if (!status) {
              _context.next = 13;
              break;
            }

            return _context.abrupt("break", 19);

          case 13:
            if (!(--statusRetries <= 0)) {
              _context.next = 15;
              break;
            }

            return _context.abrupt("break", 19);

          case 15:
            _context.next = 17;
            return sleep(500 * DEFAULT_TICKS_PER_ROUND / NUM_TICKS_PER_SECOND);

          case 17:
            _context.next = 8;
            break;

          case 19:
            if (!(status && 'Ok' in status)) {
              _context.next = 21;
              break;
            }

            return _context.abrupt("break", 30);

          case 21:
            if (!(--sendRetries <= 0)) {
              _context.next = 24;
              break;
            }

            duration = (Date.now() - start) / 1000;
            throw new Error("Transaction '".concat(signature, "' was not confirmed in ").concat(duration.toFixed(2), " seconds (").concat(JSON.stringify(status), ")"));

          case 24:
            if (!(status && status.Err && !('AccountInUse' in status.Err))) {
              _context.next = 26;
              break;
            }

            throw new Error("Transaction ".concat(signature, " failed (").concat(JSON.stringify(status), ")"));

          case 26:
            _context.next = 28;
            return sleep(Math.random() * 100);

          case 28:
            _context.next = 2;
            break;

          case 30:
            assert(signature !== undefined);
            return _context.abrupt("return", signature);

          case 32:
          case "end":
            return _context.stop();
        }
      }
    }, _callee);
  }));
  return _sendAndConfmTxn.apply(this, arguments);
}

var SystemController =
/*#__PURE__*/
function () {
  function SystemController() {
    _classCallCheck(this, SystemController);
  }

  _createClass(SystemController, null, [{
    key: "createNewAccount",
    value: function createNewAccount(from, newAccount, dif, space, controllerId) {
      var dataLayout = BufferLayout.struct([BufferLayout.u32('instruction'), BufferLayout.ns64('dif'), BufferLayout.ns64('space'), pubKey('controllerId')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 0,
        dif: dif,
        space: space,
        controllerId: controllerId.toBuffer()
      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true
        }, {
          pubkey: newAccount,
          isSigner: false
        }],
        controllerId: SystemController.controllerId,
        data: data
      });
    }
  }, {
    key: "transfer",
    value: function transfer(from, to, amount) {
      var dataLayout = BufferLayout.struct([BufferLayout.u32('instruction'), BufferLayout.ns64('amount')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 2,
        amount: amount
      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true
        }, {
          pubkey: to,
          isSigner: false
        }],
        controllerId: SystemController.controllerId,
        data: data
      });
    }
  }, {
    key: "assign",
    value: function assign(from, controllerId) {
      var dataLayout = BufferLayout.struct([BufferLayout.u32('instruction'), pubKey('controllerId')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 1,
        controllerId: controllerId.toBuffer()
      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true
        }],
        controllerId: SystemController.controllerId,
        data: data
      });
    }
  }, {
    key: "controllerId",
    get: function get() {
      return new PubKey('0x000000000000000000000000000000000000000000000000000000000000000');
    }
  }]);

  return SystemController;
}();

var ControllerLoader =
/*#__PURE__*/
function () {
  function ControllerLoader() {
    _classCallCheck(this, ControllerLoader);
  }

  _createClass(ControllerLoader, null, [{
    key: "load",
    value: function () {
      var _load = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee(connection, payer, controller, controllerId, data) {
        var transaction, dataLayout, chunkSize, offset, array, transactions, bytes, _data, _transaction, _dataLayout, _data2, _transaction2;

        return _regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                transaction = SystemController.createNewAccount(payer.pubKey, controller.pubKey, 1, data.length, controllerId);
                _context.next = 3;
                return sendAndConfmTxn(connection, transaction, payer);

              case 3:
                dataLayout = BufferLayout.struct([BufferLayout.u32('instruction'), BufferLayout.u32('offset'), BufferLayout.u32('bytesLength'), BufferLayout.u32('bytesLengthPadding'), BufferLayout.seq(BufferLayout.u8('byte'), BufferLayout.offset(BufferLayout.u32(), -8), 'bytes')]);
                chunkSize = ControllerLoader.chunkSize;
                offset = 0;
                array = data;
                transactions = [];

              case 8:
                if (!(array.length > 0)) {
                  _context.next = 24;
                  break;
                }

                bytes = array.slice(0, chunkSize);
                _data = Buffer.alloc(chunkSize + 16);
                dataLayout.encode({
                  instruction: 0,
                  offset: offset,
                  bytes: bytes
                }, _data);
                _transaction = new Transaction().add({
                  keys: [{
                    pubkey: controller.pubKey,
                    isSigner: true
                  }],
                  controllerId: controllerId,
                  data: _data
                });
                transactions.push(sendAndConfmTxn(connection, _transaction, payer, controller));
                _context.next = 16;
                return sleep(1000 / NUM_TICKS_PER_SECOND);

              case 16:
                if (!(transactions.length === 8)) {
                  _context.next = 20;
                  break;
                }

                _context.next = 19;
                return Promise.all(transactions);

              case 19:
                transactions = [];

              case 20:
                offset += chunkSize;
                array = array.slice(chunkSize);
                _context.next = 8;
                break;

              case 24:
                _context.next = 26;
                return Promise.all(transactions);

              case 26:
                _dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);
                _data2 = Buffer.alloc(_dataLayout.span);

                _dataLayout.encode({
                  instruction: 1
                }, _data2);

                _transaction2 = new Transaction().add({
                  keys: [{
                    pubkey: controller.pubKey,
                    isSigner: true
                  }],
                  controllerId: controllerId,
                  data: _data2
                });
                _context.next = 32;
                return sendAndConfmTxn(connection, _transaction2, payer, controller);

              case 32:
                return _context.abrupt("return", controller.pubKey);

              case 33:
              case "end":
                return _context.stop();
            }
          }
        }, _callee);
      }));

      function load(_x, _x2, _x3, _x4, _x5) {
        return _load.apply(this, arguments);
      }

      return load;
    }()
  }, {
    key: "chunkSize",
    get: function get() {
      return 229;
    }
  }]);

  return ControllerLoader;
}();

/**
 * 
 */
var BpfControllerLoader =
/*#__PURE__*/
function () {
  function BpfControllerLoader() {
    _classCallCheck(this, BpfControllerLoader);
  }

  _createClass(BpfControllerLoader, null, [{
    key: "load",

    /**
     * 
     *
     * @param connection 
     * @param owner 
     * @param elfBytes 
     */
    value: function load(connection, payer, elf) {
      var controller = new BusAccount();
      return ControllerLoader.load(connection, payer, controller, BpfControllerLoader.controllerId, elf);
    }
  }, {
    key: "controllerId",

    /**
     * 
     */
    get: function get() {
      return new PubKey('BPFControllerLoader1111111111111111111111111111111111');
    }
  }]);

  return BpfControllerLoader;
}();

/**
 * 
 * 
 *
 * @typedef {Object} SignatureCond
 * @property {string} type 
 * @property {PubKey} from 
 */

/**
 * @private
 */
function serializePayment(payment) {
  var toData = payment.to.toBuffer();
  var data = Buffer.alloc(8 + toData.length);
  data.writeUInt32LE(payment.amount, 0);
  toData.copy(data, 8);
  return data;
}
/**
 * @private
 */


function serializeDate(when) {
  var data = Buffer.alloc(8 + 20);
  data.writeUInt32LE(20, 0); // 

  function iso(date) {
    function pad(number) {
      if (number < 10) {
        return '0' + number;
      }

      return number;
    }

    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()) + 'T' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds()) + 'Z';
  }

  data.write(iso(when), 8);
  return data;
}
/**
 * @private
 */


function serializeCond(condition) {
  switch (condition.type) {
    case 'timestamp':
      {
        var date = serializeDate(condition.when);
        var from = condition.from.toBuffer();
        var data = Buffer.alloc(4 + date.length + from.length);
        data.writeUInt32LE(0, 0);
        date.copy(data, 4);
        from.copy(data, 4 + date.length);
        return data;
      }

    case 'signature':
      {
        var dataLayout = BufferLayout.struct([BufferLayout.u32('condition'), pubKey('from')]);

        var _from = condition.from.toBuffer();

        var _data = Buffer.alloc(4 + _from.length);

        dataLayout.encode({
          instruction: 1,
          from: _from
        }, _data);
        return _data;
      }

    default:
      throw new Error("Unknown condition type: ".concat(condition.type));
  }
}
/**
 * 
 */


var BudgetController =
/*#__PURE__*/
function () {
  function BudgetController() {
    _classCallCheck(this, BudgetController);
  }

  _createClass(BudgetController, null, [{
    key: "datetimeCond",

    /**
     * 
     */
    value: function datetimeCond(from, when) {
      return {
        type: 'timestamp',
        from: from,
        when: when
      };
    }
    /**
     * 
     */

  }, {
    key: "signatureCond",
    value: function signatureCond(from) {
      return {
        type: 'signature',
        from: from
      };
    }
    /**
     * 
     */

  }, {
    key: "pay",
    value: function pay(from, program, to, amount) {
      var data = Buffer.alloc(1024);
      var pos = 0;
      data.writeUInt32LE(0, pos);
      pos += 4;

      for (var _len = arguments.length, conditions = new Array(_len > 4 ? _len - 4 : 0), _key = 4; _key < _len; _key++) {
        conditions[_key - 4] = arguments[_key];
      }

      switch (conditions.length) {
        case 0:
          data.writeUInt32LE(0, pos);
          pos += 4;
          {
            var payment = serializePayment({
              amount: amount,
              to: to
            });
            payment.copy(data, pos);
            pos += payment.length;
          }
          return new Transaction().add({
            keys: [{
              pubkey: from,
              isSigner: true
            }, {
              pubkey: to,
              isSigner: false
            }],
            controllerId: this.controllerId,
            data: data.slice(0, pos)
          });

        case 1:
          data.writeUInt32LE(1, pos);
          pos += 4;
          {
            var condition = conditions[0];
            var conditionData = serializeCond(condition);
            conditionData.copy(data, pos);
            pos += conditionData.length;
            var paymentData = serializePayment({
              amount: amount,
              to: to
            });
            paymentData.copy(data, pos);
            pos += paymentData.length;
          }
          return new Transaction().add({
            keys: [{
              pubkey: from,
              isSigner: true
            }, {
              pubkey: program,
              isSigner: false
            }, {
              pubkey: to,
              isSigner: false
            }],
            controllerId: this.controllerId,
            data: data.slice(0, pos)
          });

        case 2:
          data.writeUInt32LE(2, pos);
          pos += 4;

          for (var _i = 0, _conditions = conditions; _i < _conditions.length; _i++) {
            var _condition = _conditions[_i];

            var _conditionData = serializeCond(_condition);

            _conditionData.copy(data, pos);

            pos += _conditionData.length;

            var _paymentData = serializePayment({
              amount: amount,
              to: to
            });

            _paymentData.copy(data, pos);

            pos += _paymentData.length;
          }

          return new Transaction().add({
            keys: [{
              pubkey: from,
              isSigner: true
            }, {
              pubkey: program,
              isSigner: false
            }, {
              pubkey: to,
              isSigner: false
            }],
            controllerId: this.controllerId,
            data: data.slice(0, pos)
          });

        default:
          throw new Error("A maximum of two conditions are support: ".concat(conditions.length, " provided"));
      }
    }
    /**
     * 
     */

  }, {
    key: "payOnAll",
    value: function payOnAll(from, program, to, amount, condition1, condition2) {
      var data = Buffer.alloc(1024);
      var pos = 0;
      data.writeUInt32LE(0, pos);
      pos += 4;
      data.writeUInt32LE(3, pos);
      pos += 4;

      for (var _i2 = 0, _arr = [condition1, condition2]; _i2 < _arr.length; _i2++) {
        var condition = _arr[_i2];
        var conditionData = serializeCond(condition);
        conditionData.copy(data, pos);
        pos += conditionData.length;
      }

      var paymentData = serializePayment({
        amount: amount,
        to: to
      });
      paymentData.copy(data, pos);
      pos += paymentData.length;
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true
        }, {
          pubkey: program,
          isSigner: false
        }, {
          pubkey: to,
          isSigner: false
        }],
        controllerId: this.controllerId,
        data: data.slice(0, pos)
      });
    }
    /**
     * 
     * 
     */

  }, {
    key: "sealWithDatetime",
    value: function sealWithDatetime(from, program, to, when) {
      var whenData = serializeDate(when);
      var data = Buffer.alloc(4 + whenData.length);
      data.writeUInt32LE(1, 0);
      whenData.copy(data, 4);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true
        }, {
          pubkey: program,
          isSigner: false
        }, {
          pubkey: to,
          isSigner: false
        }],
        controllerId: this.controllerId,
        data: data
      });
    }
    /**
     * 
     * 
     */

  }, {
    key: "sealWithSignature",
    value: function sealWithSignature(from, program, to) {
      var dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        operation: 2
      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true
        }, {
          pubkey: program,
          isSigner: false
        }, {
          pubkey: to,
          isSigner: false
        }],
        controllerId: this.controllerId,
        data: data
      });
    }
  }, {
    key: "controllerId",

    /**
     * 
     */
    get: function get() {
      return new PubKey('Budget1111111111111111111111111111111111111');
    }
    /**
     * 
     */

  }, {
    key: "size",
    get: function get() {
      return 128;
    }
  }]);

  return BudgetController;
}();

var NativeControllerLoader =
/*#__PURE__*/
function () {
  function NativeControllerLoader() {
    _classCallCheck(this, NativeControllerLoader);
  }

  _createClass(NativeControllerLoader, null, [{
    key: "load",
    value: function load(connection, payer, programName) {
      var bytes = _toConsumableArray(Buffer.from(programName));

      var program = new BusAccount();
      return ControllerLoader.load(connection, payer, program, NativeControllerLoader.controllerId, bytes);
    }
  }, {
    key: "controllerId",
    get: function get() {
      return new PubKey('NativeControllerLoader1111111111111111111111111111111');
    }
  }]);

  return NativeControllerLoader;
}();

var TokenCount =
/*#__PURE__*/
function (_BN) {
  _inherits(TokenCount, _BN);

  function TokenCount() {
    _classCallCheck(this, TokenCount);

    return _possibleConstructorReturn(this, _getPrototypeOf(TokenCount).apply(this, arguments));
  }

  _createClass(TokenCount, [{
    key: "toBuffer",
    value: function toBuffer() {
      var a = _get(_getPrototypeOf(TokenCount.prototype), "toArray", this).call(this).reverse();

      var b = Buffer.from(a);

      if (b.length === 8) {
        return b;
      }

      assert(b.length < 8, 'TokenCount too large');
      var zeroPad = Buffer.alloc(8);
      b.copy(zeroPad);
      return zeroPad;
    }
  }], [{
    key: "fromBuffer",
    value: function fromBuffer(buffer) {
      assert(buffer.length === 8, "Invalid buffer length: ".concat(buffer.length));
      return new BN(_toConsumableArray(buffer).reverse().map(function (i) {
        return "00".concat(i.toString(16)).slice(-2);
      }).join(''), 16);
    }
  }]);

  return TokenCount;
}(BN);

/**
 * @private
 */
var TokenDetailLayout = BufferLayout.struct([uint64('supply'), BufferLayout.u8('decimals'), rustString('name'), rustString('symbol')]);

/**
 * @private
 */
var TokenAccountDetailLayout = BufferLayout.struct([pubKey('token'), pubKey('owner'), uint64('amount'), BufferLayout.u8('sourceOption'), pubKey('source'), uint64('originalAmount')]);
var SYSTEM_TOKEN_CONTROLLER_ID = new PubKey('Token11111111111111111111111111111111111111');
var Token =
/*#__PURE__*/
function () {
  /**
   * @private
   */
  function Token(connection, token) {
    var controllerId = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : SYSTEM_TOKEN_CONTROLLER_ID;

    _classCallCheck(this, Token);

    _defineProperty(this, "connection", void 0);

    _defineProperty(this, "token", void 0);

    _defineProperty(this, "controllerId", void 0);

    Object.assign(this, {
      connection: connection,
      token: token,
      controllerId: controllerId
    });
  }

  _createClass(Token, [{
    key: "createNewAccount",
    value: function () {
      var _createNewAccount = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee(owner) {
        var source,
            tokenAccount,
            transaction,
            dataLayout,
            data,
            keys,
            _args = arguments;
        return _regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                source = _args.length > 1 && _args[1] !== undefined ? _args[1] : null;
                tokenAccount = new BusAccount();
                dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);
                data = Buffer.alloc(dataLayout.span);
                dataLayout.encode({
                  instruction: 1
                }, data);
                transaction = SystemController.createNewAccount(owner.pubKey, tokenAccount.pubKey, 1, 1 + TokenAccountDetailLayout.span, this.controllerId);
                _context.next = 8;
                return sendAndConfmTxn(this.connection, transaction, owner);

              case 8:
                keys = [{
                  pubkey: tokenAccount.pubKey,
                  isSigner: true
                }, {
                  pubkey: owner.pubKey,
                  isSigner: false
                }, {
                  pubkey: this.token,
                  isSigner: false
                }];

                if (source) {
                  keys.push({
                    pubkey: source,
                    isSigner: false
                  });
                }

                transaction = new Transaction().add({
                  keys: keys,
                  controllerId: this.controllerId,
                  data: data
                });
                _context.next = 13;
                return sendAndConfmTxn(this.connection, transaction, owner, tokenAccount);

              case 13:
                return _context.abrupt("return", tokenAccount.pubKey);

              case 14:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function createNewAccount(_x) {
        return _createNewAccount.apply(this, arguments);
      }

      return createNewAccount;
    }()
  }, {
    key: "fetchTokenDetail",
    value: function () {
      var _fetchTokenDetail = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee2() {
        var accountDetail, data, tokenDetail;
        return _regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.next = 2;
                return this.connection.fetchAccountDetail(this.token);

              case 2:
                accountDetail = _context2.sent;

                if (accountDetail.owner.equals(this.controllerId)) {
                  _context2.next = 5;
                  break;
                }

                throw new Error("Invalid token owner: ".concat(JSON.stringify(accountDetail.owner)));

              case 5:
                data = Buffer.from(accountDetail.data);

                if (!(data.readUInt8(0) !== 1)) {
                  _context2.next = 8;
                  break;
                }

                throw new Error("Invalid token data");

              case 8:
                tokenDetail = TokenDetailLayout.decode(data, 1);
                tokenDetail.supply = TokenCount.fromBuffer(tokenDetail.supply);
                return _context2.abrupt("return", tokenDetail);

              case 11:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function fetchTokenDetail() {
        return _fetchTokenDetail.apply(this, arguments);
      }

      return fetchTokenDetail;
    }()
  }, {
    key: "fetchAccountDetail",
    value: function () {
      var _fetchAccountDetail = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee3(account) {
        var accountDetail, data, tokenAccountDetail;
        return _regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.next = 2;
                return this.connection.fetchAccountDetail(account);

              case 2:
                accountDetail = _context3.sent;

                if (accountDetail.owner.equals(this.controllerId)) {
                  _context3.next = 5;
                  break;
                }

                throw new Error("Invalid token account owner");

              case 5:
                data = Buffer.from(accountDetail.data);

                if (!(data.readUInt8(0) !== 2)) {
                  _context3.next = 8;
                  break;
                }

                throw new Error("Invalid token account data");

              case 8:
                tokenAccountDetail = TokenAccountDetailLayout.decode(data, 1);
                tokenAccountDetail.token = new PubKey(tokenAccountDetail.token);
                tokenAccountDetail.owner = new PubKey(tokenAccountDetail.owner);
                tokenAccountDetail.amount = TokenCount.fromBuffer(tokenAccountDetail.amount);

                if (tokenAccountDetail.sourceOption === 0) {
                  tokenAccountDetail.source = null;
                  tokenAccountDetail.originalAmount = new TokenCount();
                } else {
                  tokenAccountDetail.source = new PubKey(tokenAccountDetail.source);
                  tokenAccountDetail.originalAmount = TokenCount.fromBuffer(tokenAccountDetail.originalAmount);
                }

                if (tokenAccountDetail.token.equals(this.token)) {
                  _context3.next = 15;
                  break;
                }

                throw new Error("Invalid token account token: ".concat(JSON.stringify(tokenAccountDetail.token), " !== ").concat(JSON.stringify(this.token)));

              case 15:
                return _context3.abrupt("return", tokenAccountDetail);

              case 16:
              case "end":
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function fetchAccountDetail(_x2) {
        return _fetchAccountDetail.apply(this, arguments);
      }

      return fetchAccountDetail;
    }()
  }, {
    key: "transfer",
    value: function () {
      var _transfer = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee4(owner, source, destination, amount) {
        return _regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                _context4.t0 = sendAndConfmTxn;
                _context4.t1 = this.connection;
                _context4.t2 = new Transaction();
                _context4.next = 5;
                return this.transferOperation(owner.pubKey, source, destination, amount);

              case 5:
                _context4.t3 = _context4.sent;
                _context4.t4 = _context4.t2.add.call(_context4.t2, _context4.t3);
                _context4.t5 = owner;
                _context4.next = 10;
                return (0, _context4.t0)(_context4.t1, _context4.t4, _context4.t5);

              case 10:
                return _context4.abrupt("return", _context4.sent);

              case 11:
              case "end":
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function transfer(_x3, _x4, _x5, _x6) {
        return _transfer.apply(this, arguments);
      }

      return transfer;
    }()
  }, {
    key: "approve",
    value: function () {
      var _approve = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee5(owner, account, delegate, amount) {
        return _regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                _context5.next = 2;
                return sendAndConfmTxn(this.connection, new Transaction().add(this.approveOperation(owner.pubKey, account, delegate, amount)), owner);

              case 2:
              case "end":
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function approve(_x7, _x8, _x9, _x10) {
        return _approve.apply(this, arguments);
      }

      return approve;
    }()
  }, {
    key: "revoke",
    value: function revoke(owner, account, delegate) {
      return this.approve(owner, account, delegate, 0);
    }
  }, {
    key: "setOwner",
    value: function () {
      var _setOwner = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee6(owner, account, newOwner) {
        return _regeneratorRuntime.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                _context6.next = 2;
                return sendAndConfmTxn(this.connection, new Transaction().add(this.setOwnerOperation(owner.pubKey, account, newOwner)), owner);

              case 2:
              case "end":
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function setOwner(_x11, _x12, _x13) {
        return _setOwner.apply(this, arguments);
      }

      return setOwner;
    }()
  }, {
    key: "transferOperation",
    value: function () {
      var _transferOperation = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee7(owner, source, destination, amount) {
        var accountInfo, dataLayout, data, keys;
        return _regeneratorRuntime.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                _context7.next = 2;
                return this.fetchAccountDetail(source);

              case 2:
                accountInfo = _context7.sent;

                if (owner.equals(accountInfo.owner)) {
                  _context7.next = 5;
                  break;
                }

                throw new Error('Account owner mismatch');

              case 5:
                dataLayout = BufferLayout.struct([BufferLayout.u32('instruction'), uint64('amount')]);
                data = Buffer.alloc(dataLayout.span);
                dataLayout.encode({
                  instruction: 2,
                  amount: new TokenCount(amount).toBuffer()
                }, data);
                keys = [{
                  pubkey: owner,
                  isSigner: true
                }, {
                  pubkey: source,
                  isSigner: false
                }, {
                  pubkey: destination,
                  isSigner: false
                }];

                if (accountInfo.source) {
                  keys.push({
                    pubkey: accountInfo.source,
                    isSigner: false
                  });
                }

                return _context7.abrupt("return", new TxOperation({
                  keys: keys,
                  controllerId: this.controllerId,
                  data: data
                }));

              case 11:
              case "end":
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function transferOperation(_x14, _x15, _x16, _x17) {
        return _transferOperation.apply(this, arguments);
      }

      return transferOperation;
    }()
  }, {
    key: "approveOperation",
    value: function approveOperation(owner, account, delegate, amount) {
      var dataLayout = BufferLayout.struct([BufferLayout.u32('instruction'), uint64('amount')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 3,
        amount: new TokenCount(amount).toBuffer()
      }, data);
      return new TxOperation({
        keys: [{
          pubkey: owner,
          isSigner: true
        }, {
          pubkey: account,
          isSigner: false
        }, {
          pubkey: delegate,
          isSigner: false
        }],
        controllerId: this.controllerId,
        data: data
      });
    }
  }, {
    key: "revokeOperation",
    value: function revokeOperation(owner, account, delegate) {
      return this.approveOperation(owner, account, delegate, 0);
    }
  }, {
    key: "setOwnerOperation",
    value: function setOwnerOperation(owner, account, newOwner) {
      var dataLayout = BufferLayout.struct([BufferLayout.u32('instruction')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 4
      }, data);
      return new TxOperation({
        keys: [{
          pubkey: owner,
          isSigner: true
        }, {
          pubkey: account,
          isSigner: false
        }, {
          pubkey: newOwner,
          isSigner: false
        }],
        controllerId: this.controllerId,
        data: data
      });
    }
  }], [{
    key: "createNewToken",
    value: function () {
      var _createNewToken = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee8(connection, owner, supply, name, symbol, decimals) {
        var controllerId,
            tokenAccount,
            token,
            initialAccountPubKey,
            transaction,
            dataLayout,
            data,
            encodeLength,
            _args8 = arguments;
        return _regeneratorRuntime.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                controllerId = _args8.length > 6 && _args8[6] !== undefined ? _args8[6] : SYSTEM_TOKEN_CONTROLLER_ID;
                tokenAccount = new BusAccount();
                token = new Token(connection, tokenAccount.pubKey, controllerId);
                _context8.next = 5;
                return token.createNewAccount(owner, null);

              case 5:
                initialAccountPubKey = _context8.sent;
                dataLayout = BufferLayout.struct([BufferLayout.u32('instruction'), uint64('supply'), BufferLayout.u8('decimals'), rustString('name'), rustString('symbol')]);
                data = Buffer.alloc(1024);
                encodeLength = dataLayout.encode({
                  instruction: 0,
                  supply: supply.toBuffer(),
                  decimals: decimals,
                  name: name,
                  symbol: symbol
                }, data);
                data = data.slice(0, encodeLength);
                transaction = SystemController.createNewAccount(owner.pubKey, tokenAccount.pubKey, 1, 1 + data.length, controllerId);
                _context8.next = 13;
                return sendAndConfmTxn(connection, transaction, owner);

              case 13:
                transaction = new Transaction().add({
                  keys: [{
                    pubkey: tokenAccount.pubKey,
                    isSigner: true
                  }, {
                    pubkey: initialAccountPubKey,
                    isSigner: false
                  }],
                  controllerId: controllerId,
                  data: data
                });
                _context8.next = 16;
                return sendAndConfmTxn(connection, transaction, owner, tokenAccount);

              case 16:
                return _context8.abrupt("return", [token, initialAccountPubKey]);

              case 17:
              case "end":
                return _context8.stop();
            }
          }
        }, _callee8);
      }));

      function createNewToken(_x18, _x19, _x20, _x21, _x22, _x23) {
        return _createNewToken.apply(this, arguments);
      }

      return createNewToken;
    }()
  }]);

  return Token;
}();

/**
 *
 */

function sendAndConfmOriginalTxn(_x, _x2) {
  return _sendAndConfmOriginalTxn.apply(this, arguments);
}

function _sendAndConfmOriginalTxn() {
  _sendAndConfmOriginalTxn = _asyncToGenerator(
  /*#__PURE__*/
  _regeneratorRuntime.mark(function _callee(connection, rawTransaction) {
    var start, signature, status, statusRetries, duration;
    return _regeneratorRuntime.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            start = Date.now();
            _context.next = 3;
            return connection.sendOriginalTx(rawTransaction);

          case 3:
            signature = _context.sent;
            // 
            status = null;
            statusRetries = 6;

          case 6:
            _context.next = 8;
            return connection.fetchSignatureState(signature);

          case 8:
            status = _context.sent;

            if (!status) {
              _context.next = 11;
              break;
            }

            return _context.abrupt("break", 18);

          case 11:
            _context.next = 13;
            return sleep(500 * DEFAULT_TICKS_PER_ROUND / NUM_TICKS_PER_SECOND);

          case 13:
            if (!(--statusRetries <= 0)) {
              _context.next = 16;
              break;
            }

            duration = (Date.now() - start) / 1000;
            throw new Error("Raw Transaction '".concat(signature, "' was not confirmed in ").concat(duration.toFixed(2), " seconds (").concat(JSON.stringify(status), ")"));

          case 16:
            _context.next = 6;
            break;

          case 18:
            if (!(status && 'Ok' in status)) {
              _context.next = 20;
              break;
            }

            return _context.abrupt("return", signature);

          case 20:
            throw new Error("Raw transaction ".concat(signature, " failed (").concat(JSON.stringify(status), ")"));

          case 21:
          case "end":
            return _context.stop();
        }
      }
    }, _callee);
  }));
  return _sendAndConfmOriginalTxn.apply(this, arguments);
}

var testnetDefaultChannel = "edge";

/**
 * @private
 */

var endpoint = {
  nightly: 'https://api.nightly.bitconch.io',
  beta: 'https://api.beta.testnet.bitconch.com',
  stable: 'https://api.testnet.bitconch.com'
};
/**
 * 
 * 
 */

function testnetChannelEndpoint(channel) {
  if (!channel) {
    return endpoint[testnetDefaultChannel];
  }

  if (endpoint[channel]) {
    return endpoint[channel];
  }

  throw new Error("Unknown channel: ".concat(channel));
}

exports.BpfControllerLoader = BpfControllerLoader;
exports.BudgetController = BudgetController;
exports.BusAccount = BusAccount;
exports.Connection = Connection;
exports.ControllerLoader = ControllerLoader;
exports.NativeControllerLoader = NativeControllerLoader;
exports.PubKey = PubKey;
exports.SystemController = SystemController;
exports.Token = Token;
exports.TokenCount = TokenCount;
exports.Transaction = Transaction;
exports.TxOperation = TxOperation;
exports.sendAndConfmOriginalTxn = sendAndConfmOriginalTxn;
exports.sendAndConfmTxn = sendAndConfmTxn;
exports.testnetChannelEndpoint = testnetChannelEndpoint;
//# sourceMappingURL=index.cjs.js.map
