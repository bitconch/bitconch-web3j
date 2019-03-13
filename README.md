# bitconch-web3j

# How to develop

## Development tools

bitconch-web3j is the implementation of javascript API for bitconch chain. We will publish documents soon. 

### 1. Build Tools: rollup and cross-env

When we are building an npmjs package, we usually need a lot of tools which can help to faciliate their awesomeness.
We use rollup (rollupjs.org) to bundle (aka **build**) our javascript lib into a larger module. 
Use  cross-env with rollup or jest, corss-env automatically set the environment variables for us, sweet, yeah!

```shell

cross-env NODE_ENV=production rollup -c

```
We have make a configuration file at **rollup.config.js**

### 2. Test Tools: jest 

We use jest(https://jestjs.io/en/) 

```js

npm run 

```

which will run jest and divert all output to standard error.

### 3. Code beautify: prettier and eslint 

### 4. File change monitor: watchjs 

### 5. Working Flows

1. Made some changes in the /src 

2. Test the codes using test cases in /test folder

3. Use lint and beautify tools

4. Run up the local test net

5. Run the samples to check all works

### 6. Documentation

We are using esdoc (https://esdoc.org/) which is a good documentation generator for JavaScript. 
ESdoc comes with a awesome plugin called ESdoc standard plugin, so we would install ESdoc and this plugin.

```
npm install esdoc esdoc-standard-plugin --savedev

```

To generate the docs, we firstly configrue the esdoc configuration file **.esdoc.json** at the roor folder of the project, then run the command 

```
./node_modules/.bin/esdoc 

```
This will generate documents to ./docs/folder.


### 7. Utilities

We came with a utility called **testnet.sh** which will start a local instance of bus,

the local testnet will be on localhost:

