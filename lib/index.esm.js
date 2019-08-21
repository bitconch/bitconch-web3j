import _classCallCheck from '@babel/runtime/helpers/classCallCheck';
import _createClass from '@babel/runtime/helpers/createClass';
import _defineProperty from '@babel/runtime/helpers/defineProperty';
import nacl from 'tweetnacl';
import BN from 'bn.js';
import bs58 from 'bs58';
import _regeneratorRuntime from '@babel/runtime/regenerator';
import _asyncToGenerator from '@babel/runtime/helpers/asyncToGenerator';
import { blob, struct, u32, offset, u8, seq, ns64 } from 'buffer-layout';
import _toConsumableArray from '@babel/runtime/helpers/toConsumableArray';
import assert from 'assert';
import _slicedToArray from '@babel/runtime/helpers/slicedToArray';
import { parse, format } from 'url';
import fetch from 'node-fetch';
import jayson from 'jayson/lib/client/browser';
import { struct as struct$1 } from 'superstruct';
import { Client } from 'rpc-websockets';
import _possibleConstructorReturn from '@babel/runtime/helpers/possibleConstructorReturn';
import _getPrototypeOf from '@babel/runtime/helpers/getPrototypeOf';
import _get from '@babel/runtime/helpers/get';
import _inherits from '@babel/runtime/helpers/inherits';

/**
 * A public key
 */

var PubKey =
/*#__PURE__*/
function () {
  /**
   * Create a new PubKey object
   */
  function PubKey(value) {
    _classCallCheck(this, PubKey);

    _defineProperty(this, "_bn", void 0);

    if (typeof value === 'string') {
      // hexadecimal number
      if (value.startsWith('0x')) {
        this._bn = new BN(value.substring(2), 16);
      } else {
        // assume base 58 encoding by default
        this._bn = new BN(bs58.decode(value));
      }
    } else {
      this._bn = new BN(value);
    }

    if (this._bn.byteLength() > 32) {
      throw new Error("Invalid public key input");
    }
  }
  /**
   * Checks if the provided object is a PubKey
   */


  _createClass(PubKey, [{
    key: "equals",

    /**
     * Checks if two publicKeys are equal
     */
    value: function equals(pubKey) {
      return this._bn.eq(pubKey._bn);
    }
    /**
     * Return the base-58 representation of the public key
     */

  }, {
    key: "toBase58",
    value: function toBase58() {
      return bs58.encode(this.toBuffer());
    }
    /**
     * Return the Buffer representation of the public key
     */

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
    /**
     * Returns a string representation of the public key
     */

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
 * An account key pair (public and secret keys).
 */

var BusAccount =
/*#__PURE__*/
function () {
  /**
   * Create a new BusAccount object
   *
   * If the privateKey parameter is not provided a new key pair is randomly
   * created for the account
   *
   * @param privateKey Secret key for the account
   */
  function BusAccount() {
    var privateKey = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

    _classCallCheck(this, BusAccount);

    _defineProperty(this, "_keypair", void 0);

    if (privateKey) {
      this._keypair = nacl.sign.keyPair.fromSecretKey(privateKey);
    } else {
      this._keypair = nacl.sign.keyPair();
    }
  }
  /**
   * The public key for this account
   */


  _createClass(BusAccount, [{
    key: "pubKey",
    get: function get() {
      return new PubKey(this._keypair.publicKey);
    }
    /**
     * The **unencrypted** secret key for this account
     */

  }, {
    key: "privateKey",
    get: function get() {
      return this._keypair.secretKey;
    }
  }]);

  return BusAccount;
}();

// TODO: These constants should be removed in favor of reading them out of a
// Syscall account

/**
 * @ignore
 */
var NUM_TICKS_PER_SEC = 10;
/**
 * @ignore
 */

var DEFAULT_TICKS_PER_SLOT = 8;

/**
 * Layout for a public key
 */

var pubKey = function pubKey() {
  var property = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'pubKey';
  return blob(32, property);
};
/**
 * Layout for a 64bit unsigned value
 */

var uint64 = function uint64() {
  var property = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'uint64';
  return blob(8, property);
};
/**
 * Layout for a Rust String type
 */

var rustString = function rustString() {
  var property = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'string';
  var rsl = struct([u32('length'), u32('lengthPadding'), blob(offset(u32(), -8), 'chars')], property);

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
 * Maximum over-the-wire size of a Transaction
 *
 * 1280 is IPv6 minimum MTU
 * 40 bytes is the size of the IPv6 header
 * 8 bytes is the size of the fragment header
 */
var PACKET_DATA_SIZE = 1280 - 40 - 8;
/**
 * List of TxOperation object fields that may be initialized at construction
 *
 * @typedef {Object} TxInstructionControlFields
 * @property {?Array<PubKey>} keys
 * @property {?PubKey} controllerId
 * @property {?Buffer} data
 */

/**
 * Transaction Instruction class
 */
var TxOperation =
/**
 * Public keys to include in this transaction
 * Boolean represents whether this pubkey needs to sign the transaction
 */

/**
 * Program Id to execute
 */

/**
 * Program input
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
     * Signatures for the transaction.  Typically created by invoking the
     * `sign()` method
     */

    /**
     * The first (payer) Transaction signature
     */
    get: function get() {
      if (this.signatures.length > 0) {
        return this.signatures[0].signature;
      }

      return null;
    }
    /**
     * The operations to atomically execute
     */

  }]);

  /**
   * Construct an empty Transaction
   */
  function Transaction(opts) {
    _classCallCheck(this, Transaction);

    _defineProperty(this, "signatures", []);

    _defineProperty(this, "operations", []);

    _defineProperty(this, "recentPackagehash", void 0);

    opts && Object.assign(this, opts);
  }
  /**
   * Add one or more operations to this Transaction
   */


  _createClass(Transaction, [{
    key: "add",
    value: function add() {
      var _this = this;

      for (var _len = arguments.length, items = new Array(_len), _key = 0; _key < _len; _key++) {
        items[_key] = arguments[_key];
      }

      if (items.length === 0) {
        throw new Error('No operations');
      }

      items.forEach(function (item) {
        if (item instanceof Transaction) {
          _this.operations = _this.operations.concat(item.operations);
        } else if (item instanceof TxOperation) {
          _this.operations.push(item);
        } else {
          _this.operations.push(new TxOperation(item));
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
      var recentPackagehash = this.recentPackagehash;

      if (!recentPackagehash) {
        throw new Error('Transaction recentPackagehash required');
      }

      if (this.operations.length < 1) {
        throw new Error('No operations provided');
      }

      var keys = this.signatures.map(function (_ref) {
        var pubKey = _ref.pubKey;
        return pubKey.toString();
      });
      var numRequiredSignatures = 0;
      var numCreditOnlySignedAccounts = 0;
      var numCreditOnlyUnsignedAccounts = 0;
      var programIds = [];
      this.operations.forEach(function (instruction) {
        instruction.keys.forEach(function (keySignerPair) {
          var keyStr = keySignerPair.pubkey.toString();

          if (!keys.includes(keyStr)) {
            if (keySignerPair.isSigner) {
              numRequiredSignatures += 1;

              if (!keySignerPair.isDebitable) {
                numCreditOnlySignedAccounts += 1;
              }
            } else {
              if (!keySignerPair.isDebitable) {
                numCreditOnlyUnsignedAccounts += 1;
              }
            }

            keys.push(keyStr);
          }
        });
        var controllerId = instruction.controllerId.toString();

        if (!programIds.includes(controllerId)) {
          programIds.push(controllerId);
        }
      });
      programIds.forEach(function (controllerId) {
        if (!keys.includes(controllerId)) {
          keys.push(controllerId);
          numCreditOnlyUnsignedAccounts += 1;
        }
      });

      if (numRequiredSignatures > this.signatures.length) {
        throw new Error("Insufficent signatures: expected ".concat(numRequiredSignatures, " but got ").concat(this.signatures.length));
      }

      var keyCount = [];
      encodeLength(keyCount, keys.length);
      var operations = this.operations.map(function (instruction) {
        var data = instruction.data,
            controllerId = instruction.controllerId;
        var keyIndicesCount = [];
        encodeLength(keyIndicesCount, instruction.keys.length);
        var dataCount = [];
        encodeLength(dataCount, instruction.data.length);
        return {
          programIdIndex: keys.indexOf(controllerId.toString()),
          keyIndicesCount: Buffer.from(keyIndicesCount),
          keyIndices: Buffer.from(instruction.keys.map(function (keyObj) {
            return keys.indexOf(keyObj.pubkey.toString());
          })),
          dataLength: Buffer.from(dataCount),
          data: data
        };
      });
      operations.forEach(function (instruction) {
        assert(instruction.programIdIndex >= 0);
        instruction.keyIndices.forEach(function (keyIndex) {
          return assert(keyIndex >= 0);
        });
      });
      var instructionCount = [];
      encodeLength(instructionCount, operations.length);
      var instructionBuffer = Buffer.alloc(PACKET_DATA_SIZE);
      Buffer.from(instructionCount).copy(instructionBuffer);
      var instructionBufferLength = instructionCount.length;
      operations.forEach(function (instruction) {
        var instructionLayout = struct([u8('programIdIndex'), blob(instruction.keyIndicesCount.length, 'keyIndicesCount'), seq(u8('keyIndex'), instruction.keyIndices.length, 'keyIndices'), blob(instruction.dataLength.length, 'dataLength'), seq(u8('userdatum'), instruction.data.length, 'data')]);
        var length = instructionLayout.encode(instruction, instructionBuffer, instructionBufferLength);
        instructionBufferLength += length;
      });
      instructionBuffer = instructionBuffer.slice(0, instructionBufferLength);
      var signDataLayout = struct([blob(1, 'numRequiredSignatures'), blob(1, 'numCreditOnlySignedAccounts'), blob(1, 'numCreditOnlyUnsignedAccounts'), blob(keyCount.length, 'keyCount'), seq(pubKey('key'), keys.length, 'keys'), pubKey('recentPackagehash')]);
      var transaction = {
        numRequiredSignatures: Buffer.from([this.signatures.length]),
        numCreditOnlySignedAccounts: Buffer.from([numCreditOnlySignedAccounts]),
        numCreditOnlyUnsignedAccounts: Buffer.from([numCreditOnlyUnsignedAccounts]),
        keyCount: Buffer.from(keyCount),
        keys: keys.map(function (key) {
          return new PubKey(key).toBuffer();
        }),
        recentPackagehash: Buffer.from(bs58.decode(recentPackagehash))
      };
      var signData = Buffer.alloc(2048);
      var length = signDataLayout.encode(transaction, signData);
      instructionBuffer.copy(signData, length);
      signData = signData.slice(0, length + instructionBuffer.length);
      return signData;
    }
    /**
     * Sign the Transaction with the specified accounts.  Multiple signatures may
     * be applied to a Transaction. The first signature is considered "primary"
     * and is used when testing for Transaction confirmation.
     *
     * Transaction fields should not be modified after the first call to `sign`,
     * as doing so may invalidate the signature and cause the Transaction to be
     * rejected.
     *
     * The Transaction must be assigned a valid `recentPackagehash` before invoking this method
     */

  }, {
    key: "sign",
    value: function sign() {
      this.signPartial.apply(this, arguments);
    }
    /**
     * Partially sign a Transaction with the specified accounts.  The `BusAccount`
     * inputs will be used to sign the Transaction immediately, while any
     * `PubKey` inputs will be referenced in the signed Transaction but need to
     * be filled in later by calling `addSigner()` with the matching `BusAccount`.
     *
     * All the caveats from the `sign` method apply to `signPartial`
     */

  }, {
    key: "signPartial",
    value: function signPartial() {
      for (var _len2 = arguments.length, partialSigners = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        partialSigners[_key2] = arguments[_key2];
      }

      if (partialSigners.length === 0) {
        throw new Error('No signers');
      }

      var signatures = partialSigners.map(function (accountOrPublicKey) {
        var pubKey = accountOrPublicKey instanceof BusAccount ? accountOrPublicKey.pubKey : accountOrPublicKey;
        return {
          signature: null,
          pubKey: pubKey
        };
      });
      this.signatures = signatures;

      var signData = this._fetchSignData();

      partialSigners.forEach(function (accountOrPublicKey, index) {
        if (accountOrPublicKey instanceof PubKey) {
          return;
        }

        var signature = nacl.sign.detached(signData, accountOrPublicKey.privateKey);
        assert(signature.length === 64);
        signatures[index].signature = Buffer.from(signature);
      });
    }
    /**
     * Fill in a signature for a partially signed Transaction.  The `signer` must
     * be the corresponding `BusAccount` for a `PubKey` that was previously provided to
     * `signPartial`
     */

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
    /**
     * Serialize the Transaction in the wire format.
     *
     * The Transaction must have a valid `signature` before invoking this method
     */

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
     * Deprecated method
     * @private
     */

  }, {
    key: "keys",
    get: function get() {
      assert(this.operations.length === 1);
      return this.operations[0].keys.map(function (keyObj) {
        return keyObj.pubkey;
      });
    }
    /**
     * Deprecated method
     * @private
     */

  }, {
    key: "controllerId",
    get: function get() {
      assert(this.operations.length === 1);
      return this.operations[0].controllerId;
    }
    /**
     * Deprecated method
     * @private
     */

  }, {
    key: "data",
    get: function get() {
      assert(this.operations.length === 1);
      return this.operations[0].data;
    }
    /**
     * Parse a wire transaction into a Transaction object.
     */

  }], [{
    key: "from",
    value: function from(buffer) {
      var PUBKEY_LENGTH = 32;
      var SIGNATURE_LENGTH = 64;

      function isCreditDebit(i, numRequiredSignatures, numCreditOnlySignedAccounts, numCreditOnlyUnsignedAccounts, numKeys) {
        return i < numRequiredSignatures - numCreditOnlySignedAccounts || i >= numRequiredSignatures && i < numKeys - numCreditOnlyUnsignedAccounts;
      }

      var transaction = new Transaction(); // Slice up wire data

      var byteArray = _toConsumableArray(buffer);

      var signatureCount = decodeLength(byteArray);
      var signatures = [];

      for (var i = 0; i < signatureCount; i++) {
        var signature = byteArray.slice(0, SIGNATURE_LENGTH);
        byteArray = byteArray.slice(SIGNATURE_LENGTH);
        signatures.push(signature);
      }

      var numRequiredSignatures = byteArray.shift(); // byteArray = byteArray.slice(1); // Skip numRequiredSignatures byte

      var numCreditOnlySignedAccounts = byteArray.shift(); // byteArray = byteArray.slice(1); // Skip numCreditOnlySignedAccounts byte

      var numCreditOnlyUnsignedAccounts = byteArray.shift(); // byteArray = byteArray.slice(1); // Skip numCreditOnlyUnsignedAccounts byte

      var accountCount = decodeLength(byteArray);
      var accounts = [];

      for (var _i = 0; _i < accountCount; _i++) {
        var account = byteArray.slice(0, PUBKEY_LENGTH);
        byteArray = byteArray.slice(PUBKEY_LENGTH);
        accounts.push(account);
      }

      var recentPackagehash = byteArray.slice(0, PUBKEY_LENGTH);
      byteArray = byteArray.slice(PUBKEY_LENGTH);
      var instructionCount = decodeLength(byteArray);
      var operations = [];

      for (var _i2 = 0; _i2 < instructionCount; _i2++) {
        var instruction = {};
        instruction.programIndex = byteArray.shift();
        var accountIndexCount = decodeLength(byteArray);
        instruction.accountIndex = byteArray.slice(0, accountIndexCount);
        byteArray = byteArray.slice(accountIndexCount);
        var dataLength = decodeLength(byteArray);
        instruction.data = byteArray.slice(0, dataLength);
        byteArray = byteArray.slice(dataLength);
        operations.push(instruction);
      } // Populate Transaction object


      transaction.recentPackagehash = new PubKey(recentPackagehash).toBase58();

      for (var _i3 = 0; _i3 < signatureCount; _i3++) {
        var sigPubkeyPair = {
          signature: Buffer.from(signatures[_i3]),
          pubKey: new PubKey(accounts[_i3])
        };
        transaction.signatures.push(sigPubkeyPair);
      }

      for (var _i4 = 0; _i4 < instructionCount; _i4++) {
        var instructionData = {
          keys: [],
          controllerId: new PubKey(accounts[operations[_i4].programIndex]),
          data: Buffer.from(operations[_i4].data)
        };

        var _loop = function _loop(j) {
          var pubkey = new PubKey(accounts[operations[_i4].accountIndex[j]]);
          instructionData.keys.push({
            pubkey: pubkey,
            isSigner: transaction.signatures.some(function (keyObj) {
              return keyObj.pubKey.toString() === pubkey.toString();
            }),
            isDebitable: isCreditDebit(j, numRequiredSignatures, numCreditOnlySignedAccounts, numCreditOnlyUnsignedAccounts, accounts.length)
          });
        };

        for (var j = 0; j < operations[_i4].accountIndex.length; j++) {
          _loop(j);
        }

        var _instruction = new TxOperation(instructionData);

        transaction.operations.push(_instruction);
      }

      return transaction;
    }
  }]);

  return Transaction;
}();

// zzz
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
 * Expected JSON RPC response for the "fetchAccountBalance" message
 */


var FetchBalanceRpcResult = struct$1({
  jsonrpc: struct$1.literal('2.0'),
  id: 'string',
  error: 'any?',
  result: 'number?'
});
/**
 * @private
 */

function jsonRpcResult(resultDescription) {
  var jsonRpcVersion = struct$1.literal('2.0');
  return struct$1.union([struct$1({
    jsonrpc: jsonRpcVersion,
    id: 'string',
    error: 'any'
  }), struct$1({
    jsonrpc: jsonRpcVersion,
    id: 'string',
    error: 'null?',
    result: resultDescription
  })]);
}
/**
 * @private
 */


var AccountDetailResult = struct$1({
  executable: 'boolean',
  owner: 'array',
  lamports: 'number',
  data: 'array'
});
/**
 * Expected JSON RPC response for the "fetchAccountDetail" message
 */

var fetchAccountDetailRpcResult = jsonRpcResult(AccountDetailResult);
/***
 * Expected JSON RPC response for the "accountNotification" message
 */

var AccountNoticeResult = struct$1({
  subscription: 'number',
  result: AccountDetailResult
});
/**
 * @private
 */

var ControllerAccountDetailResult = struct$1(['string', AccountDetailResult]);
/***
 * Expected JSON RPC response for the "programNotification" message
 */

var ControllerAccountNoticeResult = struct$1({
  subscription: 'number',
  result: ControllerAccountDetailResult
});
/**
 * Expected JSON RPC response for the "confmTxn" message
 */

var ConfmTxnRpcResult = jsonRpcResult('boolean');
/**
 * Expected JSON RPC response for the "fetchRoundLeader" message
 */

var FetchRoundLeader = jsonRpcResult('string');
/**
 * Expected JSON RPC response for the "fetchClusterNodes" message
 */

var GetClusterNodes = jsonRpcResult(struct$1.list([struct$1({
  pubkey: 'string',
  gossip: 'string',
  tpu: struct$1.union(['null', 'string']),
  rpc: struct$1.union(['null', 'string'])
})]));
/**
 * @ignore
 */

var GetClusterNodes_015 = jsonRpcResult(struct$1.list([struct$1({
  id: 'string',
  gossip: 'string',
  tpu: struct$1.union(['null', 'string']),
  rpc: struct$1.union(['null', 'string'])
})]));
/**
 * Expected JSON RPC response for the "getEpochVoteAccounts" message
 */

var GetEpochVoteAccounts = jsonRpcResult(struct$1.list([struct$1({
  votePubkey: 'string',
  nodePubkey: 'string',
  stake: 'number',
  commission: 'number'
})]));
/**
 * Expected JSON RPC response for the "fetchSignatureState" message
 */

var FetchSignatureStateRpcResult = jsonRpcResult(struct$1.union(['null', struct$1.union([struct$1({
  Ok: 'null'
}), struct$1({
  Err: 'object'
})])]));
/**
 * Expected JSON RPC response for the "fetchTxnAmount" message
 */

var FetchTxnAmountRpcResult = jsonRpcResult('number');
/**
 * Expected JSON RPC response for the "getTotalSupply" message
 */

var GetTotalSupplyRpcResult = jsonRpcResult('number');
/**
 * Expected JSON RPC response for the "fetchRecentBlockhash" message
 */

var FetchRecentBlockhash = jsonRpcResult(['string', struct$1({
  lamportsPerSignature: 'number',
  maxLamportsPerSignature: 'number',
  minLamportsPerSignature: 'number',
  targetLamportsPerSignature: 'number',
  targetSignaturesPerSlot: 'number'
})]);
/**
 * @ignore
 */

var GetRecentBlockhash_015 = jsonRpcResult(['string', struct$1({
  lamportsPerSignature: 'number'
})]);
/**
 * Expected JSON RPC response for the "reqDrone" message
 */

var ReqDroneRpcResult = jsonRpcResult('string');
/**
 * Expected JSON RPC response for the "sendTxn" message
 */

var SendTxnRpcResult = jsonRpcResult('string');
/**
 * Information describing an account
 *
 * @typedef {Object} AccountDetail
 * @property {number} lamports Number of lamports assigned to the account
 * @property {PubKey} owner Identifier of the program that owns the account
 * @property {?Buffer} data Optional data assigned to the account
 * @property {boolean} executable `true` if this account's data contains a loaded program
 */

// This type exists to workaround an esdoc parse error

/**
 * A connection to a fullnode JSON RPC endpoint
 */
var Connection =
/*#__PURE__*/
function () {
  /**
   * Establish a JSON RPC connection
   *
   * @param endpoint URL to the fullnode JSON RPC endpoint
   */
  function Connection(endpoint) {
    _classCallCheck(this, Connection);

    _defineProperty(this, "_rpcReq", void 0);

    _defineProperty(this, "_rpcWebSock", void 0);

    _defineProperty(this, "_rpcWebSockConnected", false);

    _defineProperty(this, "_blockhashInfo", void 0);

    _defineProperty(this, "_disableBlockhashCaching", false);

    _defineProperty(this, "_accountChangeSubscriptions", {});

    _defineProperty(this, "_accountChangeSubscriptionCounter", 0);

    _defineProperty(this, "_controllerAccountChangeSubscriptions", {});

    _defineProperty(this, "_controllerAccountChangeSubscriptionCounter", 0);

    var url = parse(endpoint);
    this._rpcReq = createRpcReq(url.href);
    this._blockhashInfo = {
      recentPackagehash: null,
      seconds: -1,
      transactionSignatures: []
    };
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.host = '';
    url.port = String(Number(url.port) + 1);

    if (url.port === '1') {
      url.port = url.protocol === 'wss:' ? '8901' : '8900';
    }

    this._rpcWebSock = new Client(format(url), {
      autoconnect: false,
      max_reconnects: Infinity
    });

    this._rpcWebSock.on('open', this._wsOnOpen.bind(this));

    this._rpcWebSock.on('error', this._wsOnErr.bind(this));

    this._rpcWebSock.on('close', this._wsOnClose.bind(this));

    this._rpcWebSock.on('accountNotification', this._wsOnAccountNotice.bind(this));

    this._rpcWebSock.on('programNotification', this._wsOnProgramAccountNotification.bind(this));
  }
  /**
   * Fetch the balance for the specified public key
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
     * Fetch all the account info for the specified public key
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
                res = fetchAccountDetailRpcResult(unsafeRes);

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
                  lamports: result.lamports,
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
     * Confirm the transaction identified by the specified signature
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
     * Return the list of nodes that are currently participating in the cluster
     */

  }, {
    key: "fetchClusterNodes",
    value: function () {
      var _fetchClusterNodes = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee5() {
        var unsafeRes, res_015, res;
        return _regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                _context5.next = 2;
                return this._rpcReq('getClusterNodes', []);

              case 2:
                unsafeRes = _context5.sent;
                _context5.prev = 3;
                res_015 = GetClusterNodes_015(unsafeRes);

                if (!res_015.error) {
                  _context5.next = 8;
                  break;
                }

                console.log('no', res_015.error);
                throw new Error(res_015.error.message);

              case 8:
                return _context5.abrupt("return", res_015.result.map(function (node) {
                  node.pubkey = node.id;
                  node.id = undefined;
                  return node;
                }));

              case 11:
                _context5.prev = 11;
                _context5.t0 = _context5["catch"](3);

              case 13:
                // End Legacy v0.15 response
                res = GetClusterNodes(unsafeRes);

                if (!res.error) {
                  _context5.next = 16;
                  break;
                }

                throw new Error(res.error.message);

              case 16:
                assert(typeof res.result !== 'undefined');
                return _context5.abrupt("return", res.result);

              case 18:
              case "end":
                return _context5.stop();
            }
          }
        }, _callee5, this, [[3, 11]]);
      }));

      function fetchClusterNodes() {
        return _fetchClusterNodes.apply(this, arguments);
      }

      return fetchClusterNodes;
    }()
    /**
     * Return the list of nodes that are currently participating in the cluster
     */

  }, {
    key: "getEpochVoteAccounts",
    value: function () {
      var _getEpochVoteAccounts = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee6() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                _context6.next = 2;
                return this._rpcReq('getEpochVoteAccounts', []);

              case 2:
                unsafeRes = _context6.sent;
                res = GetEpochVoteAccounts(unsafeRes); //const res = unsafeRes;

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

      function getEpochVoteAccounts() {
        return _getEpochVoteAccounts.apply(this, arguments);
      }

      return getEpochVoteAccounts;
    }()
    /**
     * Fetch the current slot leader of the cluster
     */

  }, {
    key: "fetchRoundLeader",
    value: function () {
      var _fetchRoundLeader = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee7() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                _context7.next = 2;
                return this._rpcReq('getRoundLeader', []);

              case 2:
                unsafeRes = _context7.sent;
                res = FetchRoundLeader(unsafeRes);

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

      function fetchRoundLeader() {
        return _fetchRoundLeader.apply(this, arguments);
      }

      return fetchRoundLeader;
    }()
    /**
     * Fetch the current transaction count of the cluster
     */

  }, {
    key: "fetchSignatureState",
    value: function () {
      var _fetchSignatureState = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee8(signature) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                _context8.next = 2;
                return this._rpcReq('getSignatureState', [signature]);

              case 2:
                unsafeRes = _context8.sent;
                res = FetchSignatureStateRpcResult(unsafeRes);

                if (!res.error) {
                  _context8.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context8.abrupt("return", res.result);

              case 8:
              case "end":
                return _context8.stop();
            }
          }
        }, _callee8, this);
      }));

      function fetchSignatureState(_x6) {
        return _fetchSignatureState.apply(this, arguments);
      }

      return fetchSignatureState;
    }()
    /**
     * Fetch the current transaction count of the cluster
     */

  }, {
    key: "fetchTxnAmount",
    value: function () {
      var _fetchTxnAmount = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee9() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                _context9.next = 2;
                return this._rpcReq('getTxnCnt', []);

              case 2:
                unsafeRes = _context9.sent;
                res = FetchTxnAmountRpcResult(unsafeRes);

                if (!res.error) {
                  _context9.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context9.abrupt("return", Number(res.result));

              case 8:
              case "end":
                return _context9.stop();
            }
          }
        }, _callee9, this);
      }));

      function fetchTxnAmount() {
        return _fetchTxnAmount.apply(this, arguments);
      }

      return fetchTxnAmount;
    }()
    /**
     * Fetch the current total currency supply of the cluster
     */

  }, {
    key: "getTotalSupply",
    value: function () {
      var _getTotalSupply = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee10() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee10$(_context10) {
          while (1) {
            switch (_context10.prev = _context10.next) {
              case 0:
                _context10.next = 2;
                return this._rpcReq('getTotalSupply', []);

              case 2:
                unsafeRes = _context10.sent;
                res = GetTotalSupplyRpcResult(unsafeRes);

                if (!res.error) {
                  _context10.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context10.abrupt("return", Number(res.result));

              case 8:
              case "end":
                return _context10.stop();
            }
          }
        }, _callee10, this);
      }));

      function getTotalSupply() {
        return _getTotalSupply.apply(this, arguments);
      }

      return getTotalSupply;
    }()
    /**
     * Fetch a recent blockhash from the cluster
     */

  }, {
    key: "fetchRecentBlockhash",
    value: function () {
      var _fetchRecentBlockhash = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee11() {
        var unsafeRes, res_015, _res_015$result, blockhash, feeCalculator, res;

        return _regeneratorRuntime.wrap(function _callee11$(_context11) {
          while (1) {
            switch (_context11.prev = _context11.next) {
              case 0:
                _context11.next = 2;
                return this._rpcReq('getLatestBlockhash', []);

              case 2:
                unsafeRes = _context11.sent;
                _context11.prev = 3;
                res_015 = GetRecentBlockhash_015(unsafeRes);

                if (!res_015.error) {
                  _context11.next = 7;
                  break;
                }

                throw new Error(res_015.error.message);

              case 7:
                _res_015$result = _slicedToArray(res_015.result, 2), blockhash = _res_015$result[0], feeCalculator = _res_015$result[1];
                feeCalculator.targetSignaturesPerSlot = 42;
                feeCalculator.targetLamportsPerSignature = feeCalculator.lamportsPerSignature;
                return _context11.abrupt("return", [blockhash, feeCalculator]);

              case 13:
                _context11.prev = 13;
                _context11.t0 = _context11["catch"](3);

              case 15:
                // End Legacy v0.15 response
                res = FetchRecentBlockhash(unsafeRes);

                if (!res.error) {
                  _context11.next = 18;
                  break;
                }

                throw new Error(res.error.message);

              case 18:
                assert(typeof res.result !== 'undefined');
                return _context11.abrupt("return", res.result);

              case 20:
              case "end":
                return _context11.stop();
            }
          }
        }, _callee11, this, [[3, 13]]);
      }));

      function fetchRecentBlockhash() {
        return _fetchRecentBlockhash.apply(this, arguments);
      }

      return fetchRecentBlockhash;
    }()
    /**
     * Request an allocation of lamports to the specified account
     */

  }, {
    key: "reqDrone",
    value: function () {
      var _reqDrone = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee12(to, amount) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee12$(_context12) {
          while (1) {
            switch (_context12.prev = _context12.next) {
              case 0:
                _context12.next = 2;
                return this._rpcReq('requestDif', [to.toBase58(), amount]);

              case 2:
                unsafeRes = _context12.sent;
                res = ReqDroneRpcResult(unsafeRes);

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

      function reqDrone(_x7, _x8) {
        return _reqDrone.apply(this, arguments);
      }

      return reqDrone;
    }()
    /**
     * Sign and send a transaction
     */

  }, {
    key: "sendTxn",
    value: function () {
      var _sendTxn = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee13(transaction) {
        var _len,
            signers,
            _key,
            seconds,
            signature,
            attempts,
            startTime,
            _ref2,
            _ref3,
            recentPackagehash,
            wireTransaction,
            _args13 = arguments;

        return _regeneratorRuntime.wrap(function _callee13$(_context13) {
          while (1) {
            switch (_context13.prev = _context13.next) {
              case 0:
                for (_len = _args13.length, signers = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                  signers[_key - 1] = _args13[_key];
                }

              case 1:
                // Attempt to use a recent blockhash for up to 30 seconds
                seconds = new Date().getSeconds();

                if (!(this._blockhashInfo.recentPackagehash != null && this._blockhashInfo.seconds < seconds + 30)) {
                  _context13.next = 12;
                  break;
                }

                transaction.recentPackagehash = this._blockhashInfo.recentPackagehash;
                transaction.sign.apply(transaction, signers);

                if (transaction.signature) {
                  _context13.next = 7;
                  break;
                }

                throw new Error('!signature');

              case 7:
                // If the signature of this transaction has not been seen before with the
                // current recentPackagehash, all done.
                signature = transaction.signature.toString();

                if (this._blockhashInfo.transactionSignatures.includes(signature)) {
                  _context13.next = 12;
                  break;
                }

                this._blockhashInfo.transactionSignatures.push(signature);

                if (this._disableBlockhashCaching) {
                  this._blockhashInfo.seconds = -1;
                }

                return _context13.abrupt("break", 31);

              case 12:
                // Fetch a new blockhash
                attempts = 0;
                startTime = Date.now();

              case 14:
                _context13.next = 16;
                return this.fetchRecentBlockhash();

              case 16:
                _ref2 = _context13.sent;
                _ref3 = _slicedToArray(_ref2, 1);
                recentPackagehash = _ref3[0];

                if (!(this._blockhashInfo.recentPackagehash != recentPackagehash)) {
                  _context13.next = 22;
                  break;
                }

                this._blockhashInfo = {
                  recentPackagehash: recentPackagehash,
                  seconds: new Date().getSeconds(),
                  transactionSignatures: []
                };
                return _context13.abrupt("break", 29);

              case 22:
                if (!(attempts === 50)) {
                  _context13.next = 24;
                  break;
                }

                throw new Error("Unable to obtain a new blockhash after ".concat(Date.now() - startTime, "ms"));

              case 24:
                _context13.next = 26;
                return sleep(500 * DEFAULT_TICKS_PER_SLOT / NUM_TICKS_PER_SEC);

              case 26:
                ++attempts;

              case 27:
                _context13.next = 14;
                break;

              case 29:
                _context13.next = 1;
                break;

              case 31:
                wireTransaction = transaction.serialize();
                _context13.next = 34;
                return this.sendNativeTxn(wireTransaction);

              case 34:
                return _context13.abrupt("return", _context13.sent);

              case 35:
              case "end":
                return _context13.stop();
            }
          }
        }, _callee13, this);
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
      _regeneratorRuntime.mark(function _callee14() {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee14$(_context14) {
          while (1) {
            switch (_context14.prev = _context14.next) {
              case 0:
                _context14.next = 2;
                return this._rpcReq('fullnodeQuit', []);

              case 2:
                unsafeRes = _context14.sent;
                res = jsonRpcResult('boolean')(unsafeRes);

                if (!res.error) {
                  _context14.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                return _context14.abrupt("return", res.result);

              case 8:
              case "end":
                return _context14.stop();
            }
          }
        }, _callee14, this);
      }));

      function fullnodeExit() {
        return _fullnodeExit.apply(this, arguments);
      }

      return fullnodeExit;
    }()
    /**
     * Send a transaction that has already been signed and serialized into the
     * wire format
     */

  }, {
    key: "sendNativeTxn",
    value: function () {
      var _sendNativeTxn = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee15(rawTransaction) {
        var unsafeRes, res;
        return _regeneratorRuntime.wrap(function _callee15$(_context15) {
          while (1) {
            switch (_context15.prev = _context15.next) {
              case 0:
                _context15.next = 2;
                return this._rpcReq('sendTxn', [_toConsumableArray(rawTransaction)]);

              case 2:
                unsafeRes = _context15.sent;
                res = SendTxnRpcResult(unsafeRes);

                if (!res.error) {
                  _context15.next = 6;
                  break;
                }

                throw new Error(res.error.message);

              case 6:
                assert(typeof res.result !== 'undefined');
                assert(res.result);
                return _context15.abrupt("return", res.result);

              case 9:
              case "end":
                return _context15.stop();
            }
          }
        }, _callee15, this);
      }));

      function sendNativeTxn(_x10) {
        return _sendNativeTxn.apply(this, arguments);
      }

      return sendNativeTxn;
    }()
    /**
     * @private
     */

  }, {
    key: "_wsOnOpen",
    value: function _wsOnOpen() {
      this._rpcWebSockConnected = true;

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
      // 1000 means _rpcWebSock.close() was called explicitly
      if (code !== 1000) {
        console.log('ws close:', code, message);
      }

      this._rpcWebSockConnected = false;
    }
    /**
     * @private
     */

  }, {
    key: "_updateSubscriptions",
    value: function () {
      var _updateSubscriptions2 = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee16() {
        var accountKeys, programKeys, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, id, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, _id, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, _id2, _this$_accountChangeS, subscriptionId, pubKey, _iteratorNormalCompletion4, _didIteratorError4, _iteratorError4, _iterator4, _step4, _id3, _this$_controllerAcco, controllerId;

        return _regeneratorRuntime.wrap(function _callee16$(_context16) {
          while (1) {
            switch (_context16.prev = _context16.next) {
              case 0:
                accountKeys = Object.keys(this._accountChangeSubscriptions).map(Number);
                programKeys = Object.keys(this._controllerAccountChangeSubscriptions).map(Number);

                if (!(accountKeys.length === 0 && programKeys.length === 0)) {
                  _context16.next = 5;
                  break;
                }

                this._rpcWebSock.close();

                return _context16.abrupt("return");

              case 5:
                if (this._rpcWebSockConnected) {
                  _context16.next = 46;
                  break;
                }

                _iteratorNormalCompletion = true;
                _didIteratorError = false;
                _iteratorError = undefined;
                _context16.prev = 9;

                for (_iterator = accountKeys[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                  id = _step.value;
                  this._accountChangeSubscriptions[id].subscriptionId = null;
                }

                _context16.next = 17;
                break;

              case 13:
                _context16.prev = 13;
                _context16.t0 = _context16["catch"](9);
                _didIteratorError = true;
                _iteratorError = _context16.t0;

              case 17:
                _context16.prev = 17;
                _context16.prev = 18;

                if (!_iteratorNormalCompletion && _iterator["return"] != null) {
                  _iterator["return"]();
                }

              case 20:
                _context16.prev = 20;

                if (!_didIteratorError) {
                  _context16.next = 23;
                  break;
                }

                throw _iteratorError;

              case 23:
                return _context16.finish(20);

              case 24:
                return _context16.finish(17);

              case 25:
                _iteratorNormalCompletion2 = true;
                _didIteratorError2 = false;
                _iteratorError2 = undefined;
                _context16.prev = 28;

                for (_iterator2 = programKeys[Symbol.iterator](); !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  _id = _step2.value;
                  this._controllerAccountChangeSubscriptions[_id].subscriptionId = null;
                }

                _context16.next = 36;
                break;

              case 32:
                _context16.prev = 32;
                _context16.t1 = _context16["catch"](28);
                _didIteratorError2 = true;
                _iteratorError2 = _context16.t1;

              case 36:
                _context16.prev = 36;
                _context16.prev = 37;

                if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
                  _iterator2["return"]();
                }

              case 39:
                _context16.prev = 39;

                if (!_didIteratorError2) {
                  _context16.next = 42;
                  break;
                }

                throw _iteratorError2;

              case 42:
                return _context16.finish(39);

              case 43:
                return _context16.finish(36);

              case 44:
                this._rpcWebSock.connect();

                return _context16.abrupt("return");

              case 46:
                _iteratorNormalCompletion3 = true;
                _didIteratorError3 = false;
                _iteratorError3 = undefined;
                _context16.prev = 49;
                _iterator3 = accountKeys[Symbol.iterator]();

              case 51:
                if (_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done) {
                  _context16.next = 67;
                  break;
                }

                _id2 = _step3.value;
                _this$_accountChangeS = this._accountChangeSubscriptions[_id2], subscriptionId = _this$_accountChangeS.subscriptionId, pubKey = _this$_accountChangeS.pubKey;

                if (!(subscriptionId === null)) {
                  _context16.next = 64;
                  break;
                }

                _context16.prev = 55;
                _context16.next = 58;
                return this._rpcWebSock.call('accountSubscribe', [pubKey]);

              case 58:
                this._accountChangeSubscriptions[_id2].subscriptionId = _context16.sent;
                _context16.next = 64;
                break;

              case 61:
                _context16.prev = 61;
                _context16.t2 = _context16["catch"](55);
                console.log("accountSubscribe error for ".concat(pubKey, ": ").concat(_context16.t2.message));

              case 64:
                _iteratorNormalCompletion3 = true;
                _context16.next = 51;
                break;

              case 67:
                _context16.next = 73;
                break;

              case 69:
                _context16.prev = 69;
                _context16.t3 = _context16["catch"](49);
                _didIteratorError3 = true;
                _iteratorError3 = _context16.t3;

              case 73:
                _context16.prev = 73;
                _context16.prev = 74;

                if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
                  _iterator3["return"]();
                }

              case 76:
                _context16.prev = 76;

                if (!_didIteratorError3) {
                  _context16.next = 79;
                  break;
                }

                throw _iteratorError3;

              case 79:
                return _context16.finish(76);

              case 80:
                return _context16.finish(73);

              case 81:
                _iteratorNormalCompletion4 = true;
                _didIteratorError4 = false;
                _iteratorError4 = undefined;
                _context16.prev = 84;
                _iterator4 = programKeys[Symbol.iterator]();

              case 86:
                if (_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done) {
                  _context16.next = 102;
                  break;
                }

                _id3 = _step4.value;
                _this$_controllerAcco = this._controllerAccountChangeSubscriptions[_id3], subscriptionId = _this$_controllerAcco.subscriptionId, controllerId = _this$_controllerAcco.controllerId;

                if (!(subscriptionId === null)) {
                  _context16.next = 99;
                  break;
                }

                _context16.prev = 90;
                _context16.next = 93;
                return this._rpcWebSock.call('programSubscribe', [controllerId]);

              case 93:
                this._controllerAccountChangeSubscriptions[_id3].subscriptionId = _context16.sent;
                _context16.next = 99;
                break;

              case 96:
                _context16.prev = 96;
                _context16.t4 = _context16["catch"](90);
                console.log("programSubscribe error for ".concat(controllerId, ": ").concat(_context16.t4.message));

              case 99:
                _iteratorNormalCompletion4 = true;
                _context16.next = 86;
                break;

              case 102:
                _context16.next = 108;
                break;

              case 104:
                _context16.prev = 104;
                _context16.t5 = _context16["catch"](84);
                _didIteratorError4 = true;
                _iteratorError4 = _context16.t5;

              case 108:
                _context16.prev = 108;
                _context16.prev = 109;

                if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
                  _iterator4["return"]();
                }

              case 111:
                _context16.prev = 111;

                if (!_didIteratorError4) {
                  _context16.next = 114;
                  break;
                }

                throw _iteratorError4;

              case 114:
                return _context16.finish(111);

              case 115:
                return _context16.finish(108);

              case 116:
              case "end":
                return _context16.stop();
            }
          }
        }, _callee16, this, [[9, 13, 17, 25], [18,, 20, 24], [28, 32, 36, 44], [37,, 39, 43], [49, 69, 73, 81], [55, 61], [74,, 76, 80], [84, 104, 108, 116], [90, 96], [109,, 111, 115]]);
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
              lamports: result.lamports,
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
    /**
     * Register a callback to be invoked whenever the specified account changes
     *
     * @param publickey Public key of the account to monitor
     * @param callback Function to invoke whenever the account is changed
     * @return subscription id
     */

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
    /**
     * Deregister an account notification callback
     *
     * @param id subscription id to deregister
     */

  }, {
    key: "removeListenerOfAccountChange",
    value: function () {
      var _removeListenerOfAccountChange = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee17(id) {
        var subscriptionId;
        return _regeneratorRuntime.wrap(function _callee17$(_context17) {
          while (1) {
            switch (_context17.prev = _context17.next) {
              case 0:
                if (!this._accountChangeSubscriptions[id]) {
                  _context17.next = 15;
                  break;
                }

                subscriptionId = this._accountChangeSubscriptions[id].subscriptionId;
                delete this._accountChangeSubscriptions[id];

                if (!(subscriptionId !== null)) {
                  _context17.next = 12;
                  break;
                }

                _context17.prev = 4;
                _context17.next = 7;
                return this._rpcWebSock.call('accountUnsubscribe', [subscriptionId]);

              case 7:
                _context17.next = 12;
                break;

              case 9:
                _context17.prev = 9;
                _context17.t0 = _context17["catch"](4);
                console.log('accountUnsubscribe error:', _context17.t0.message);

              case 12:
                this._updateSubscriptions();

                _context17.next = 16;
                break;

              case 15:
                throw new Error("Unknown account change id: ".concat(id));

              case 16:
              case "end":
                return _context17.stop();
            }
          }
        }, _callee17, this, [[4, 9]]);
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
    key: "_wsOnProgramAccountNotification",
    value: function _wsOnProgramAccountNotification(notification) {
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
              fetchAccountDetail: {
                executable: result[1].executable,
                owner: new PubKey(result[1].owner),
                lamports: result[1].lamports,
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
    /**
     * Register a callback to be invoked whenever accounts owned by the
     * specified program change
     *
     * @param controllerId Public key of the program to monitor
     * @param callback Function to invoke whenever the account is changed
     * @return subscription id
     */

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
    /**
     * Deregister an account notification callback
     *
     * @param id subscription id to deregister
     */

  }, {
    key: "removeControllerAccountChangeListener",
    value: function () {
      var _removeControllerAccountChangeListener = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee18(id) {
        var subscriptionId;
        return _regeneratorRuntime.wrap(function _callee18$(_context18) {
          while (1) {
            switch (_context18.prev = _context18.next) {
              case 0:
                if (!this._controllerAccountChangeSubscriptions[id]) {
                  _context18.next = 15;
                  break;
                }

                subscriptionId = this._controllerAccountChangeSubscriptions[id].subscriptionId;
                delete this._controllerAccountChangeSubscriptions[id];

                if (!(subscriptionId !== null)) {
                  _context18.next = 12;
                  break;
                }

                _context18.prev = 4;
                _context18.next = 7;
                return this._rpcWebSock.call('programUnsubscribe', [subscriptionId]);

              case 7:
                _context18.next = 12;
                break;

              case 9:
                _context18.prev = 9;
                _context18.t0 = _context18["catch"](4);
                console.log('programUnsubscribe error:', _context18.t0.message);

              case 12:
                this._updateSubscriptions();

                _context18.next = 16;
                break;

              case 15:
                throw new Error("Unknown account change id: ".concat(id));

              case 16:
              case "end":
                return _context18.stop();
            }
          }
        }, _callee18, this, [[4, 9]]);
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
 * Sign, send and confirm a transaction
 */

function sendAndconfmTx(_x, _x2) {
  return _sendAndconfmTx.apply(this, arguments);
}

function _sendAndconfmTx() {
  _sendAndconfmTx = _asyncToGenerator(
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
            // Wait up to a couple slots for a confirmation
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
            return sleep(500 * DEFAULT_TICKS_PER_SLOT / NUM_TICKS_PER_SEC);

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
  return _sendAndconfmTx.apply(this, arguments);
}

/**
 * Factory class for transactions to interact with the System program
 */

var SystemController =
/*#__PURE__*/
function () {
  function SystemController() {
    _classCallCheck(this, SystemController);
  }

  _createClass(SystemController, null, [{
    key: "createNewAccount",

    /**
     * Generate a Transaction that creates a new account
     */
    value: function createNewAccount(from, _createNewAccount, lamports, space, controllerId) {
      var dataLayout = struct([u32('instruction'), ns64('lamports'), ns64('space'), pubKey('controllerId')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 0,
        // Create BusAccount instruction
        lamports: lamports,
        space: space,
        controllerId: controllerId.toBuffer()
      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true,
          isDebitable: true
        }, {
          pubkey: _createNewAccount,
          isSigner: false,
          isDebitable: true
        }],
        controllerId: SystemController.controllerId,
        data: data
      });
    }
    /**
     * Generate a Transaction that transfers lamports from one account to another
     */

  }, {
    key: "transfer",
    value: function transfer(from, to, amount) {
      var dataLayout = struct([u32('instruction'), ns64('amount')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 2,
        // Move instruction
        amount: amount
      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true,
          isDebitable: true
        }, {
          pubkey: to,
          isSigner: false,
          isDebitable: false
        }],
        controllerId: SystemController.controllerId,
        data: data
      });
    }
    /**
     * Generate a Transaction that assigns an account to a program
     */

  }, {
    key: "assign",
    value: function assign(from, controllerId) {
      var dataLayout = struct([u32('instruction'), pubKey('controllerId')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 1,
        // Assign instruction
        controllerId: controllerId.toBuffer()
      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true,
          isDebitable: true
        }],
        controllerId: SystemController.controllerId,
        data: data
      });
    }
  }, {
    key: "controllerId",

    /**
     * Public key that identifies the System program
     */
    get: function get() {
      return new PubKey('0x000000000000000000000000000000000000000000000000000000000000000');
    }
  }]);

  return SystemController;
}();

/**
 * Program loader interface
 */

var ControllerLoader =
/*#__PURE__*/
function () {
  function ControllerLoader() {
    _classCallCheck(this, ControllerLoader);
  }

  _createClass(ControllerLoader, null, [{
    key: "load",

    /**
     * Loads a generic program
     *
     * @param connection The connection to use
     * @param payer System account that pays to load the program
     * @param program BusAccount to load the program into
     * @param controllerId Public key that identifies the loader
     * @param data Program octets
     */
    value: function () {
      var _load = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee(connection, payer, program, controllerId, data) {
        var transaction, dataLayout, chunkSize, offset$1, array, transactions, bytes, _data, _transaction, _dataLayout, _data2, _transaction2;

        return _regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                transaction = SystemController.createNewAccount(payer.pubKey, program.pubKey, 1, data.length, controllerId);
                _context.next = 3;
                return sendAndconfmTx(connection, transaction, payer);

              case 3:
                dataLayout = struct([u32('instruction'), u32('offset'), u32('bytesLength'), u32('bytesLengthPadding'), seq(u8('byte'), offset(u32(), -8), 'bytes')]);
                chunkSize = ControllerLoader.chunkSize;
                offset$1 = 0;
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
                  // Load instruction
                  offset: offset$1,
                  bytes: bytes
                }, _data);
                _transaction = new Transaction().add({
                  keys: [{
                    pubkey: program.pubKey,
                    isSigner: true,
                    isDebitable: true
                  }],
                  controllerId: controllerId,
                  data: _data
                });
                transactions.push(sendAndconfmTx(connection, _transaction, payer, program)); // Delay ~1 tick between write transactions in an attempt to reduce AccountInUse errors
                // since all the write transactions modify the same program account

                _context.next = 16;
                return sleep(1000 / NUM_TICKS_PER_SEC);

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
                offset$1 += chunkSize;
                array = array.slice(chunkSize);
                _context.next = 8;
                break;

              case 24:
                _context.next = 26;
                return Promise.all(transactions);

              case 26:
                _dataLayout = struct([u32('instruction')]);
                _data2 = Buffer.alloc(_dataLayout.span);

                _dataLayout.encode({
                  instruction: 1 // Finalize instruction

                }, _data2);

                _transaction2 = new Transaction().add({
                  keys: [{
                    pubkey: program.pubKey,
                    isSigner: true,
                    isDebitable: true
                  }],
                  controllerId: controllerId,
                  data: _data2
                });
                _context.next = 32;
                return sendAndconfmTx(connection, _transaction2, payer, program);

              case 32:
                return _context.abrupt("return", program.pubKey);

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

    /**
     * Amount of program data placed in each load Transaction
     */
    get: function get() {
      // Keep program chunks under PACKET_DATA_SIZE, leaving enough room for the
      // rest of the Transaction fields
      //
      // TODO: replace 300 with a proper constant for the size of the other
      // Transaction fields
      return PACKET_DATA_SIZE - 300;
    }
  }]);

  return ControllerLoader;
}();

/**
 * Factory class for transactions to interact with a program loader
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
     * Load a BPF program
     *
     * @param connection The connection to use
     * @param owner User account to load the program into
     * @param elfBytes The entire ELF containing the BPF program
     */
    value: function load(connection, payer, elf) {
      var program = new BusAccount();
      return ControllerLoader.load(connection, payer, program, BpfControllerLoader.controllerId, elf);
    }
  }, {
    key: "controllerId",

    /**
     * Public key that identifies the BpfControllerLoader
     */
    get: function get() {
      return new PubKey('BPFLoader1111111111111111111111111111111111');
    }
  }]);

  return BpfControllerLoader;
}();

/**
 * Represents a condition that is met by executing a `sealWithSignature()`
 * transaction
 *
 * @typedef {Object} SignatureCond
 * @property {string} type Must equal the string 'timestamp'
 * @property {PubKey} from Public key from which `sealWithSignature()` will be accepted from
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


function serializeTime(when) {
  var data = Buffer.alloc(8 + 20);
  data.writeUInt32LE(20, 0); // size of timestamp as u64

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
        var date = serializeTime(condition.when);
        var from = condition.from.toBuffer();
        var data = Buffer.alloc(4 + date.length + from.length);
        data.writeUInt32LE(0, 0); // Condition enum = Timestamp

        date.copy(data, 4);
        from.copy(data, 4 + date.length);
        return data;
      }

    case 'signature':
      {
        var _from = condition.from.toBuffer();

        var _data = Buffer.alloc(4 + _from.length);

        _data.writeUInt32LE(1, 0); // Condition enum = Signature


        _from.copy(_data, 4);

        return _data;
      }

    default:
      throw new Error("Unknown condition type: ".concat(condition.type));
  }
}
/**
 * Factory class for transactions to interact with the Budget program
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
     * Creates a timestamp condition
     */
    value: function datetimeCond(from, when) {
      return {
        type: 'timestamp',
        from: from,
        when: when
      };
    }
    /**
     * Creates a signature condition
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
     * Generates a transaction that transfers lamports once any of the conditions are met
     */

  }, {
    key: "pay",
    value: function pay(from, program, to, amount) {
      var data = Buffer.alloc(1024);
      var pos = 0;
      data.writeUInt32LE(0, pos); // NewBudget instruction

      pos += 4;

      for (var _len = arguments.length, conditions = new Array(_len > 4 ? _len - 4 : 0), _key = 4; _key < _len; _key++) {
        conditions[_key - 4] = arguments[_key];
      }

      switch (conditions.length) {
        case 0:
          {
            data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay

            pos += 4;
            {
              var payment = serializePayment({
                amount: amount,
                to: to
              });
              payment.copy(data, pos);
              pos += payment.length;
            }
            var trimmedData = data.slice(0, pos);
            var transaction = SystemController.createNewAccount(from, program, amount, trimmedData.length, this.controllerId);
            return transaction.add({
              keys: [{
                pubkey: to,
                isSigner: false,
                isDebitable: false
              }, {
                pubkey: program,
                isSigner: false,
                isDebitable: true
              }],
              controllerId: this.controllerId,
              data: trimmedData
            });
          }

        case 1:
          {
            data.writeUInt32LE(1, pos); // BudgetExpr enum = After

            pos += 4;
            {
              var condition = conditions[0];
              var conditionData = serializeCond(condition);
              conditionData.copy(data, pos);
              pos += conditionData.length;
              data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay

              pos += 4;
              var paymentData = serializePayment({
                amount: amount,
                to: to
              });
              paymentData.copy(data, pos);
              pos += paymentData.length;
            }

            var _trimmedData = data.slice(0, pos);

            var _transaction = SystemController.createNewAccount(from, program, amount, _trimmedData.length, this.controllerId);

            return _transaction.add({
              keys: [{
                pubkey: program,
                isSigner: false,
                isDebitable: true
              }],
              controllerId: this.controllerId,
              data: _trimmedData
            });
          }

        case 2:
          {
            data.writeUInt32LE(2, pos); // BudgetExpr enum = Or

            pos += 4;

            for (var _i = 0, _conditions = conditions; _i < _conditions.length; _i++) {
              var _condition = _conditions[_i];

              var _conditionData = serializeCond(_condition);

              _conditionData.copy(data, pos);

              pos += _conditionData.length;
              data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay

              pos += 4;

              var _paymentData = serializePayment({
                amount: amount,
                to: to
              });

              _paymentData.copy(data, pos);

              pos += _paymentData.length;
            }

            var _trimmedData2 = data.slice(0, pos);

            var _transaction2 = SystemController.createNewAccount(from, program, amount, _trimmedData2.length, this.controllerId);

            return _transaction2.add({
              keys: [{
                pubkey: program,
                isSigner: false,
                isDebitable: true
              }],
              controllerId: this.controllerId,
              data: _trimmedData2
            });
          }

        default:
          throw new Error("A maximum of two conditions are support: ".concat(conditions.length, " provided"));
      }
    }
    /**
     * Generates a transaction that transfers lamports once both conditions are met
     */

  }, {
    key: "payOnAll",
    value: function payOnAll(from, program, to, amount, condition1, condition2) {
      var data = Buffer.alloc(1024);
      var pos = 0;
      data.writeUInt32LE(0, pos); // NewBudget instruction

      pos += 4;
      data.writeUInt32LE(3, pos); // BudgetExpr enum = And

      pos += 4;

      for (var _i2 = 0, _arr = [condition1, condition2]; _i2 < _arr.length; _i2++) {
        var condition = _arr[_i2];
        var conditionData = serializeCond(condition);
        conditionData.copy(data, pos);
        pos += conditionData.length;
      }

      data.writeUInt32LE(0, pos); // BudgetExpr enum = Pay

      pos += 4;
      var paymentData = serializePayment({
        amount: amount,
        to: to
      });
      paymentData.copy(data, pos);
      pos += paymentData.length;
      var trimmedData = data.slice(0, pos);
      var transaction = SystemController.createNewAccount(from, program, amount, trimmedData.length, this.controllerId);
      return transaction.add({
        keys: [{
          pubkey: program,
          isSigner: false,
          isDebitable: true
        }],
        controllerId: this.controllerId,
        data: trimmedData
      });
    }
    /**
     * Generates a transaction that applies a timestamp, which could enable a
     * pending payment to proceed.
     */

  }, {
    key: "sealWithDatetime",
    value: function sealWithDatetime(from, program, to, when) {
      var whenData = serializeTime(when);
      var data = Buffer.alloc(4 + whenData.length);
      data.writeUInt32LE(1, 0); // ApplyTimestamp instruction

      whenData.copy(data, 4);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true,
          isDebitable: true
        }, {
          pubkey: program,
          isSigner: false,
          isDebitable: true
        }, {
          pubkey: to,
          isSigner: false,
          isDebitable: false
        }],
        controllerId: this.controllerId,
        data: data
      });
    }
    /**
     * Generates a transaction that applies a signature, which could enable a
     * pending payment to proceed.
     */

  }, {
    key: "sealWithSignature",
    value: function sealWithSignature(from, program, to) {
      var dataLayout = struct([u32('instruction')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 2 // ApplySignature instruction

      }, data);
      return new Transaction().add({
        keys: [{
          pubkey: from,
          isSigner: true,
          isDebitable: true
        }, {
          pubkey: program,
          isSigner: false,
          isDebitable: true
        }, {
          pubkey: to,
          isSigner: false,
          isDebitable: false
        }],
        controllerId: this.controllerId,
        data: data
      });
    }
  }, {
    key: "controllerId",

    /**
     * Public key that identifies the Budget program
     */
    get: function get() {
      return new PubKey('Budget1111111111111111111111111111111111111');
    }
    /**
     * The amount of space this program requires
     */

  }, {
    key: "size",
    get: function get() {
      return 128;
    }
  }]);

  return BudgetController;
}();

/**
 * Factory class for transactions to interact with a program loader
 */
var NativeControllerLoader =
/*#__PURE__*/
function () {
  function NativeControllerLoader() {
    _classCallCheck(this, NativeControllerLoader);
  }

  _createClass(NativeControllerLoader, null, [{
    key: "load",

    /**
     * Loads a native program
     *
     * @param connection The connection to use
     * @param payer System account that pays to load the program
     * @param programName Name of the native program
     */
    value: function load(connection, payer, programName) {
      var bytes = _toConsumableArray(Buffer.from(programName));

      var program = new BusAccount();
      return ControllerLoader.load(connection, payer, program, NativeControllerLoader.controllerId, bytes);
    }
  }, {
    key: "controllerId",

    /**
     * Public key that identifies the NativeControllerLoader
     */
    get: function get() {
      return new PubKey('NativeLoader1111111111111111111111111111111');
    }
  }]);

  return NativeControllerLoader;
}();

/**
 * Some amount of tokens
 */
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

    /**
     * Convert to Buffer representation
     */
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
    /**
     * Construct a TokenCount from Buffer representation
     */

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
 * Information about a token
 */

/**
 * @private
 */
var TokenDetailLayout = struct([uint64('supply'), u8('decimals'), rustString('name'), rustString('symbol')]);
/**
 * Information about a token account
 */

/**
 * @private
 */
var TokenAccountDetailLayout = struct([pubKey('token'), pubKey('owner'), uint64('amount'), u8('sourceOption'), pubKey('source'), uint64('originalAmount')]);
// This type exists to workaround an esdoc parse error

/**
 * The built-in token program
 */
var SYSTEM_TOKEN_CONTROLLER_ID = new PubKey('Token11111111111111111111111111111111111111');
/**
 * An ERC20-like Token
 */

var Token =
/*#__PURE__*/
function () {
  /**
   * @private
   */

  /**
   * The public key identifying this token
   */

  /**
   * Program Identifier for the Token program
   */

  /**
   * Create a Token object attached to the specific token
   *
   * @param connection The connection to use
   * @param token Public key of the token
   * @param controllerId Optional token controllerId, uses the system controllerId by default
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
  /**
   * Create a new Token
   *
   * @param connection The connection to use
   * @param owner User account that will own the returned Token BusAccount
   * @param supply Total supply of the new token
   * @param name Descriptive name of this token
   * @param symbol Symbol for this token
   * @param decimals Location of the decimal place
   * @param controllerId Optional token controllerId, uses the system controllerId by default
   * @return Token object for the newly minted token, Public key of the Token BusAccount holding the total supply of new tokens
   */


  _createClass(Token, [{
    key: "createNewAccount",

    /**
     * Create a new and empty token account.
     *
     * This account may then be used as a `transfer()` or `approve()` destination
     *
     * @param owner User account that will own the new token account
     * @param source If not null, create a delegate account that when authorized
     *               may transfer tokens from this `source` account
     * @return Public key of the new empty token account
     */
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
                dataLayout = struct([u32('instruction')]);
                data = Buffer.alloc(dataLayout.span);
                dataLayout.encode({
                  instruction: 1 // NewTokenAccount instruction

                }, data); // Allocate memory for the token

                transaction = SystemController.createNewAccount(owner.pubKey, tokenAccount.pubKey, 1, 1 + TokenAccountDetailLayout.span, this.controllerId);
                _context.next = 8;
                return sendAndconfmTx(this.connection, transaction, owner);

              case 8:
                // Initialize the token account
                keys = [{
                  pubkey: tokenAccount.pubKey,
                  isSigner: true,
                  isDebitable: true
                }, {
                  pubkey: owner.pubKey,
                  isSigner: false,
                  isDebitable: false
                }, {
                  pubkey: this.token,
                  isSigner: false,
                  isDebitable: false
                }];

                if (source) {
                  keys.push({
                    pubkey: source,
                    isSigner: false,
                    isDebitable: false
                  });
                }

                transaction = new Transaction().add({
                  keys: keys,
                  controllerId: this.controllerId,
                  data: data
                });
                _context.next = 13;
                return sendAndconfmTx(this.connection, transaction, owner, tokenAccount);

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
    /**
     * Retrieve token information
     */

  }, {
    key: "fetchTokenDetail",
    value: function () {
      var _fetchTokenDetail = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee2() {
        var fetchAccountDetail, data, fetchTokenDetail;
        return _regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.next = 2;
                return this.connection.fetchAccountDetail(this.token);

              case 2:
                fetchAccountDetail = _context2.sent;

                if (fetchAccountDetail.owner.equals(this.controllerId)) {
                  _context2.next = 5;
                  break;
                }

                throw new Error("Invalid token owner: ".concat(JSON.stringify(fetchAccountDetail.owner)));

              case 5:
                data = Buffer.from(fetchAccountDetail.data);

                if (!(data.readUInt8(0) !== 1)) {
                  _context2.next = 8;
                  break;
                }

                throw new Error("Invalid token data");

              case 8:
                fetchTokenDetail = TokenDetailLayout.decode(data, 1);
                fetchTokenDetail.supply = TokenCount.fromBuffer(fetchTokenDetail.supply);
                return _context2.abrupt("return", fetchTokenDetail);

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
    /**
     * Retrieve account information
     *
     * @param account Public key of the token account
     */

  }, {
    key: "fetchAccountDetail",
    value: function () {
      var _fetchAccountDetail = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee3(account) {
        var fetchAccountDetail, data, tokenAccountInfo;
        return _regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.next = 2;
                return this.connection.fetchAccountDetail(account);

              case 2:
                fetchAccountDetail = _context3.sent;

                if (fetchAccountDetail.owner.equals(this.controllerId)) {
                  _context3.next = 5;
                  break;
                }

                throw new Error("Invalid token account owner");

              case 5:
                data = Buffer.from(fetchAccountDetail.data);

                if (!(data.readUInt8(0) !== 2)) {
                  _context3.next = 8;
                  break;
                }

                throw new Error("Invalid token account data");

              case 8:
                tokenAccountInfo = TokenAccountDetailLayout.decode(data, 1);
                tokenAccountInfo.token = new PubKey(tokenAccountInfo.token);
                tokenAccountInfo.owner = new PubKey(tokenAccountInfo.owner);
                tokenAccountInfo.amount = TokenCount.fromBuffer(tokenAccountInfo.amount);

                if (tokenAccountInfo.sourceOption === 0) {
                  tokenAccountInfo.source = null;
                  tokenAccountInfo.originalAmount = new TokenCount();
                } else {
                  tokenAccountInfo.source = new PubKey(tokenAccountInfo.source);
                  tokenAccountInfo.originalAmount = TokenCount.fromBuffer(tokenAccountInfo.originalAmount);
                }

                if (tokenAccountInfo.token.equals(this.token)) {
                  _context3.next = 15;
                  break;
                }

                throw new Error("Invalid token account token: ".concat(JSON.stringify(tokenAccountInfo.token), " !== ").concat(JSON.stringify(this.token)));

              case 15:
                return _context3.abrupt("return", tokenAccountInfo);

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
    /**
     * Transfer tokens to another account
     *
     * @param owner Owner of the source token account
     * @param source Source token account
     * @param destination Destination token account
     * @param amount Number of tokens to transfer
     */

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
                _context4.t0 = sendAndconfmTx;
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
    /**
     * Grant a third-party permission to transfer up the specified number of tokens from an account
     *
     * @param owner Owner of the source token account
     * @param account Public key of the token account
     * @param delegate Token account authorized to perform a transfer tokens from the source account
     * @param amount Maximum number of tokens the delegate may transfer
     */

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
                return sendAndconfmTx(this.connection, new Transaction().add(this.approveOperation(owner.pubKey, account, delegate, amount)), owner);

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
    /**
     * Remove approval for the transfer of any remaining tokens
     *
     * @param owner Owner of the source token account
     * @param account Public key of the token account
     * @param delegate Token account to revoke authorization from
     */

  }, {
    key: "revoke",
    value: function revoke(owner, account, delegate) {
      return this.approve(owner, account, delegate, 0);
    }
    /**
     * Assign a new owner to the account
     *
     * @param owner Owner of the token account
     * @param account Public key of the token account
     * @param newOwner New owner of the token account
     */

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
                return sendAndconfmTx(this.connection, new Transaction().add(this.setOwnerOperation(owner.pubKey, account, newOwner)), owner);

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
    /**
     * Construct a Transfer instruction
     *
     * @param owner Owner of the source token account
     * @param source Source token account
     * @param destination Destination token account
     * @param amount Number of tokens to transfer
     */

  }, {
    key: "transferOperation",
    value: function () {
      var _transferOperation = _asyncToGenerator(
      /*#__PURE__*/
      _regeneratorRuntime.mark(function _callee7(owner, source, destination, amount) {
        var fetchAccountDetail, dataLayout, data, keys;
        return _regeneratorRuntime.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                _context7.next = 2;
                return this.fetchAccountDetail(source);

              case 2:
                fetchAccountDetail = _context7.sent;

                if (owner.equals(fetchAccountDetail.owner)) {
                  _context7.next = 5;
                  break;
                }

                throw new Error('BusAccount owner mismatch');

              case 5:
                dataLayout = struct([u32('instruction'), uint64('amount')]);
                data = Buffer.alloc(dataLayout.span);
                dataLayout.encode({
                  instruction: 2,
                  // Transfer instruction
                  amount: new TokenCount(amount).toBuffer()
                }, data);
                keys = [{
                  pubkey: owner,
                  isSigner: true,
                  isDebitable: false
                }, {
                  pubkey: source,
                  isSigner: false,
                  isDebitable: true
                }, {
                  pubkey: destination,
                  isSigner: false,
                  isDebitable: true
                }];

                if (fetchAccountDetail.source) {
                  keys.push({
                    pubkey: fetchAccountDetail.source,
                    isSigner: false,
                    isDebitable: true
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
    /**
     * Construct an Approve instruction
     *
     * @param owner Owner of the source token account
     * @param account Public key of the token account
     * @param delegate Token account authorized to perform a transfer tokens from the source account
     * @param amount Maximum number of tokens the delegate may transfer
     */

  }, {
    key: "approveOperation",
    value: function approveOperation(owner, account, delegate, amount) {
      var dataLayout = struct([u32('instruction'), uint64('amount')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 3,
        // Approve instruction
        amount: new TokenCount(amount).toBuffer()
      }, data);
      return new TxOperation({
        keys: [{
          pubkey: owner,
          isSigner: true,
          isDebitable: false
        }, {
          pubkey: account,
          isSigner: false,
          isDebitable: true
        }, {
          pubkey: delegate,
          isSigner: false,
          isDebitable: true
        }],
        controllerId: this.controllerId,
        data: data
      });
    }
    /**
     * Construct an Revoke instruction
     *
     * @param owner Owner of the source token account
     * @param account Public key of the token account
     * @param delegate Token account authorized to perform a transfer tokens from the source account
     */

  }, {
    key: "revokeOperation",
    value: function revokeOperation(owner, account, delegate) {
      return this.approveOperation(owner, account, delegate, 0);
    }
    /**
     * Construct a SetOwner instruction
     *
     * @param owner Owner of the token account
     * @param account Public key of the token account
     * @param newOwner New owner of the token account
     */

  }, {
    key: "setOwnerOperation",
    value: function setOwnerOperation(owner, account, newOwner) {
      var dataLayout = struct([u32('instruction')]);
      var data = Buffer.alloc(dataLayout.span);
      dataLayout.encode({
        instruction: 4 // SetOwner instruction

      }, data);
      return new TxOperation({
        keys: [{
          pubkey: owner,
          isSigner: true,
          isDebitable: false
        }, {
          pubkey: account,
          isSigner: false,
          isDebitable: true
        }, {
          pubkey: newOwner,
          isSigner: false,
          isDebitable: true
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
            initialAccountPublicKey,
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
                initialAccountPublicKey = _context8.sent;
                dataLayout = struct([u32('instruction'), uint64('supply'), u8('decimals'), rustString('name'), rustString('symbol')]);
                data = Buffer.alloc(1024);
                encodeLength = dataLayout.encode({
                  instruction: 0,
                  // NewToken instruction
                  supply: supply.toBuffer(),
                  decimals: decimals,
                  name: name,
                  symbol: symbol
                }, data);
                data = data.slice(0, encodeLength);
                // Allocate memory for the tokenAccount account
                transaction = SystemController.createNewAccount(owner.pubKey, tokenAccount.pubKey, 1, 1 + data.length, controllerId);
                _context8.next = 13;
                return sendAndconfmTx(connection, transaction, owner);

              case 13:
                transaction = new Transaction().add({
                  keys: [{
                    pubkey: tokenAccount.pubKey,
                    isSigner: true,
                    isDebitable: false
                  }, {
                    pubkey: initialAccountPublicKey,
                    isSigner: false,
                    isDebitable: true
                  }],
                  controllerId: controllerId,
                  data: data
                });
                _context8.next = 16;
                return sendAndconfmTx(connection, transaction, owner, tokenAccount);

              case 16:
                return _context8.abrupt("return", [token, initialAccountPublicKey]);

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
 * Sign, send and confirm a raw transaction
 */

function sendAndConfmNativeTxn(_x, _x2) {
  return _sendAndConfmNativeTxn.apply(this, arguments);
}

function _sendAndConfmNativeTxn() {
  _sendAndConfmNativeTxn = _asyncToGenerator(
  /*#__PURE__*/
  _regeneratorRuntime.mark(function _callee(connection, rawTransaction) {
    var start, signature, status, statusRetries, duration;
    return _regeneratorRuntime.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            start = Date.now();
            _context.next = 3;
            return connection.sendNativeTxn(rawTransaction);

          case 3:
            signature = _context.sent;
            // Wait up to a couple slots for a confirmation
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
            return sleep(500 * DEFAULT_TICKS_PER_SLOT / NUM_TICKS_PER_SEC);

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
  return _sendAndConfmNativeTxn.apply(this, arguments);
}

var testnetDefaultChannel = "edge";

/**
 * @private
 */

var endpoint = {
  edge: 'https://api.edge.testnet.solana.com',
  beta: 'https://api.beta.testnet.solana.com',
  stable: 'https://api.testnet.solana.com'
};
/**
 * Retrieves the RPC endpoint URL for the specified testnet release
 * channel
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

///

export { BpfControllerLoader, BudgetController, BusAccount, Connection, ControllerLoader, NativeControllerLoader, PubKey, SystemController, Token, TokenCount, Transaction, TxOperation, sendAndConfmNativeTxn, sendAndconfmTx, testnetChannelEndpoint };
//# sourceMappingURL=index.esm.js.map
