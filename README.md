bitconch-web3j

bitconch-web3j is the implementation of javascript API for bitconch chain. We will publish documents soon.
Updates
1.1.x

    Support ERC20 token creation

用户可以发布ERC20代币

用户可以指定代币的名称、符号、发行总量等信息。

用户可以实现代币的锁仓、定时转账、确认转账等功能。

    Support a native coin on Bitconch chain Dif, details for this native coin unit conversion can be found here at https://github.com/bitconch/bus/issues/95

1.1.x版本引入了Bitconch Chain的最小单位Dif，1000Dif=1BUS，Dif的命名来源于现代密码学之父Whitfield Diffie。

1.1.x版本中交易手续费默认为1Dif或者1/1000BUS。

    Suppport a primitive BVM code loader for on-chain storage of DApp code.

1.1.x版本引入了BVM程序加载器，在下一版本中用户可以通过加载器加载链上的BVM代码。
Usage

ES6

const web3j = require('@bitconch/bitconch-web3j');
console.log(web3j);

Javascript

import web3j from '@bitconch/bitconch-web3j';
console.log(web3j);

Contribution
About the commands

    Use npm run release to submit a Pull Request to github
    Ensure npm run pre-relese passes before submitting a Pull Request
    Features and bug fixes should be covered by new test cases
    Commits follow the Angular commit convention
    semantic-release automatically create new release from master branch.
    Different commit message trigger different version of release:
        fix for 0.0.x as bugfix
        feat for 0.1.x as new features
        BREAKING CHANGE for x.0.0 as breaking new releases
        all other commit message will do nothing

    npm run install

    build

    npm build

    use rollup to build all the source to target rules defined in rollup.config.js

    npm 


    npm pre-release

    before push to remote upper stream, run lint, flow, test, and generate documentation.

    npm release

    run CLI semantic-release to push changes to the remote git repo.

    semantic-release automatically set the version number, change logs and publish a release under the code tag on github.

    semantci-release work depends on the correct commit message, so other tools like commitizen or semantic-git-commit-cli are used to enforce the valid comments.

    Use semantice-version for versioning control. semantic-version is a tool to give version number based on git messages. For making things even easier, a CLI semantic-git-commit-cli is installed, it is an interactive-cli, which will automatically give commit message and versioning.

    sgc home page is here https://www.npmjs.com/package/semantic-git-commit-cli, the .sgcrc is the configuration file for sgc, you can just leave it be there. unfortunately, sgc is not working well under windows/ubuntu, for a more general approach, we choose commitizen or git-cz https://github.com/commitizen/cz-cli.

    semantic version

    Semantic-versioning is used here as a method to control the versioning of the source.

    Why? In the world of software management there exists a dreaded place called “dependency hell.”

    As the project grows bigger and bigger, devs will find them being trapped in this kind of hellish situation where it is almost impossible to manage the dependencies of the various components.

    Setup CI

    Travis CI Go to https://travis-ci.org, login using github account, add repo for TravisCI to run.

    Create/Modify .travis.yml

    Circle CI

Development tools

Requirements:

1. Ubuntu (either a physical machine or an GCE or Alibaba CES).

2. NodeJs (stable: 11.11) & npm (6.7.0)

3. Redis (stable: 5.0.3)

Apply GCE/AWS/Alibaba CES

You can refer to this article on how to apply a CES https://help.aliyun.com/document_detail/25422.html?spm=a2c4g.11186623.3.2.56a2164bEhcDi8

Configure the SSH, you can refer to this article https://help.aliyun.com/knowledge_detail/41489.html

After apply the CES instance, you need to configure the port for public access
Configure the SSH to stop from disconnecting

vim /etc/ssh/sshd_config

User "?" command to find ClientAliveInterval and ClientAliveCountMax, change their value to 30 and 86400.

ClientAliveInterval 30 means the client will send a hear beat signal every 30 seconds to keep connected,

ClientAliveCountMax 86400 means after 86400 seconds (24 hours), the connection will be lost

ClientAliveInterval 30
ClientAliveCountMax 86400

Configure the ssh to allow multiple session of a single user login simultaneously, when a user is logged, system give this user a session. Sometimes, we need to login to several sessions for the same users, so we need to change the ssh configuration.

It is recommeneded not to use root to login, but create superusers. So in the following sections, i will teach you how to create su user.

Use the adduser command to add a new user to your system.

Just replace adam with whatever cute names you like.

adduser adam

Set and confirm the new user's password at the prompt. A strong password is highly recommended!

Set password prompts:
Enter new UNIX password:
Retype new UNIX password:
passwd: password updated successfully

Follow the prompts to set the new user's information. It is fine to accept the defaults to leave all of this information blank.

User information prompts:
Changing the user information for username
Enter the new value, or press ENTER for the default
    Full Name []:
    Room Number []:
    Work Phone []:
    Home Phone []:
    Other []:
Is the information correct? [Y/n]

Use the usermod command to add the user to the sudo group.

usermod -aG sudo adam

Install Redis

Redis is an in-memory database that persists on disk. Redis is written in C++ and Tcl. Tcl/Tk is a high level programming language, which you can learn more about it from their offical website. https://www.tcl.tk/. After succesful installation, Redis will run port 6379.

wget http://download.redis.io/redis-stable.tar.gz
tar xvzf redis-stable.tar.gz
cd redis-stable
make

Install tcl and make test to check make if works, in the redis-stable folder,

sudo apt-get remove tk8.4 tcl8.4
sudo apt-get install tk8.5 tcl8.5
make test

Failed to start Advanced key-value store.

In case you meet this stupid situation, that's because user redis did not have permission to create the pid file (or directory it was in). There is another clue Can't open PID file /var/run/redis/redis-server.pid (yet?) after start: No such file or directory

Fix:

cd  /var/run/redis
chown redis /var/run/redis

Install NodeJs

Install NodeJs using apt

Usually, we could easily install nodejs on Ubuntu using apt, like

apt update;apt install nodejs;apt install npm

and check the versions

nodejs -v

Since the apt on GCE/Alibaba CES is sometimes out of date, this method only not so well, if we want to specify the version.

Uninstall NodeJs using apt

apt-get purge nodejs;apt-get autoremove

Install Git

On Ubuntu, use apt, first update the apt repo. You can learn more from them on their offical website https://git-scm.com/download/linux.

apt update

Then add git apt repot to ppa

add-apt-repository ppa:git-core/ppa

apt update; apt install git


Build Tools: rollup and cross-env

When we are building an npmjs package, we usually need a lot of tools which can help to faciliate their awesomeness. We use rollup (rollupjs.org) to bundle (aka build) our javascript lib into a larger module. Use cross-env with rollup or jest, corss-env automatically set the environment variables for us, sweet, yeah!

cross-env NODE_ENV=production rollup -c

We have make a configuration file at rollup.config.js
Test Tools: jest

We use jest(https://jestjs.io/en/)

npm run 

which will run jest and divert all output to standard error.
Code beautify: prettier and eslint
File change monitor: watchjs
Working Flows

    Made some changes in the /src

    Test the codes using test cases in /test folder

    Use lint and beautify tools

    Run up the local test net

    Run the samples to check all works

Documentation

We are using esdoc (https://esdoc.org/) which is a good documentation generator for JavaScript. ESdoc comes with a awesome plugin called ESdoc standard plugin, so we would install ESdoc and this plugin.

npm install esdoc esdoc-standard-plugin --savedev

To generate the docs, we firstly configrue the esdoc configuration file .esdoc.json at the roor folder of the project, then run the command

./node_modules/.bin/esdoc 

This will generate documents to ./docs/folder.
Utilities

We came with a utility called testnet.sh which will start a local instance of bus,

the local testnet will be on localhost: