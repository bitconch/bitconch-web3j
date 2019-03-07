# bitconch-web3j

# How to develop

## Development tools

bitconch-web3j is the implementation of javascript API for bitconch chain. We will publish documents soon. 

### 1. Build Tools: rollup and cross-env

We use rollup (rollupjs.org) to bundle (aka **build**) our javascript lib into a larger module. 
Use  cross-env with rollup or jest, corss-env automatically set the environment variables for us, sweet, yeah!

```shell

cross-env NODE_ENV=production rollup -c

```
We have make a configuration file at **rollup.config.js**

### 2. Test Tools: jest 

### 3. Code beautify: prettier and eslint 

### 4. File change monitor: watchjs 

### 5. Working Flows

1. Made some changes in the /src 

2. Test the codes using test cases in /test folder

3. Use lint and beautify tools

4. Run up the local test net

5. Run the samples to check all works