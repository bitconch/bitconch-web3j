
# Bitconch JavaScript API

This is the Bitconch Javascript API built on the Bitconch [JSON RPC API](https://bitconch.io/bitconch/jsonrpc-api.html)

[Latest API Documentation](https://bitconch.io/bitconch-web3j/)


## Installation

### Yarn
```
$ yarn add @bitconch/bitconch-web3j
```

### npm
```
$ npm install --save @bitconch/bitconch-web3j
```

### Browser bundle
```html
<script src="https://github.com/bitconch/bitconch-web3j/releases/download/v0.0.6/bitconchweb3j.min.js"></script>
```

### BPF program development
clang-7.0 must be installed to build BPF programs, such as
`examples/bpf-c-noop/`.  See `bpf-sdk/README.md` for installation details.

Rust must be installed to build Rust BPF programs, see: https://www.rust-lang.org/install.html such as
`examples/bpf-rust-noop/`.  See https://www.rust-lang.org/install.html for installation details.

## Usage

### Javascript
```js
const bitconchWeb3j = require('@bitconch/bitconch-web3j');
console.log(bitconchWeb3j);
```

### ES6
```js
import bitconchWeb3j from '@bitconch/bitconch-web3j';
console.log(bitconchWeb3j);
```

### Browser bundle
```js
// `bitconchWeb3j` is provided in the global namespace by the `bitconch-web3j.min.js` script bundle.
console.log(bitconchWeb3j);
```

## Local Network
The `bitconch-localnet` program is provided to easily start a test Bitconch cluster
locally on your machine.  Docker must be installed.  The JSON RPC endpoint of
the local cluster is `http://localhost:8899`.

To start, first fetch the latest Docker image by running:
```bash
$ npx bitconch-localnet update
```

Then run the following command to start the cluster
```bash
$ npx bitconch-localnet up
```

While the cluster is running logs are available with:
```bash
$ npx bitconch-localnet logs -f
```

Stop the cluster with:
```bash
$ npx bitconch-localnet down
```

## Flow

A [Flow library definition](https://flow.org/en/docs/libdefs/) is provided at
[module.flow.js](https://github.com/bitconch/bitconch-web3j/tree/master/module.flow.js).
Add the following line under the [libs] section of your project's .flowconfig to
activate it:
```ini
[libs]
node_modules/@bitconch/bitconch-web3j/module.flow.js
```

## Examples
See the [examples/](https://github.com/bitconch/bitconch-web3j/tree/master/examples) directory for small snippets.

Standalone examples:
* Web wallet: https://github.com/bitconch/faucet
* Tic-tac-toe: https://github.com/bitconch/bus-explorer

## Releases
Releases are available on [Github](https://github.com/bitconch/bitconch-web3j/releases)
and [npmjs.com](https://www.npmjs.com/package/@bitconch/bitconch-web3j)

Each Github release features a tarball containing API documentation and a
minified version of the module suitable for direct use in a browser environment
(&lt;script&gt; tag)
