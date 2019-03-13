#!/usr/bin/env bash
set -e

# This script will start an local instance of bitconch chain 
# Three port number should be exposed using cotainer image
# 8864 for RPC http endpoint
# 8865 for RPC PubSub WebSocket Endpoint
# 8866 for Token-Bot Service

channel=$(
  cd "$(dirname "$0")";
  node -p '
    let p = [
      "../lib/node_modules/@bitconch/web3j/package.json",
      "../@bitconch/web3j/package.json",
      "../package.json"
    ].find(require("fs").existsSync);
    if (!p) throw new Error("Unable to locate bitconch-web3j directory");
    require(p)["testnetDefaultChannel"]
  '
)

# a message function print out useful informations
print_msg() {
  exitcode=0
  if [[ -n "$1" ]]; then
    exitcode=1
    echo "Error: $*"
  fi
  cat <<EOF
How to: $0 [update|up|down|logs|deploy] [command-specific options]

Start an local testnet

 pull   - Pull(update) the image from dockerhub.com
 start    - Start the network
 stop     - Stop the network
 logs     - Display network logging
 deploy   - Deploy a smart contract to the local testnet.


 logs-specific options:
   -f     - Follow log output

 update-specific options:
   nightly   - Update the imagge tagged by "nightly" 
   beta   - Update the imagge tagged by "beta" 

 up-specific options:
   nightly   - Start the docker image tagged by "nightly" 
   beta   - Start the docker image tagged by "beta" 
   -n     - Optional Docker network to join

   Default channel: $channel

 down-specific options:
   none

 deploy-specific options:
   contract - The smart contract to deploy.

   Note that deployments are discarded on network stop

EOF
  exit $exitcode
}

[[ -n $1 ]] || print_msg
cmd="$1"
shift

docker --version || print_msg "Can't find Docker version, maybe it is not installed"
case $cmd in
pull)
  if [[ -n $1 ]]; then
    channel="$1"
  fi
  [[ $channel = nightly || $channel = beta ]] || print_msg "Invalid channel: $channel"

  (
    set -x
    docker pull bitconch/bus:"$channel"
  )
  ;;
start)
  while [[ -n $1 ]]; do
    if [[ $1 = -n ]]; then
      [[ -n $2 ]] || print_msg "Invalid $1 argument"
      network="$2"
      shift 2
    elif [[ $1 = nightly ]]; then
      channel=nightly
      shift 1
    elif [[ $1 = beta ]]; then
      channel=beta
      shift 1
    else
      print_msg "Unknown argument: $1"
    fi
  done

  (
    set -x
    RUST_LOG=${RUST_LOG:-bus=warn,bitconch_bpf=info,bitconch_jsonrpc=info,bus::rpc=info,bitconch_fullnode=info,bus::drone=info,bus::bank=info,bus::banking_stage=info,bus::system_program=info}

    ARGS=(
      --detach
      --name bus-testnet
      --network "$network"
      --rm
      --publish 8899:8899
      --publish 8900:8900
      --publish 9900:9900
      --tty
      --env "RUST_LOG=$RUST_LOG"
    )

    docker run "${ARGS[@]}" bitconch/bus:"$channel"

    for _ in 1 2 3 4 5; do
      if curl \
          -X POST \
          -H "Content-Type: application/json" \
          -d '{"jsonrpc":"2.0","id":1, "method":"getTransactionCount"}' \
          http://localhost:8899; then
        break;
      fi
      sleep 1
    done
  )
  ;;
down)
  (
    set -x
    if [[ -n "$(docker ps --filter "name=^bus-testnet$" -q)" ]]; then
      docker stop --time 0 bus-testnet
    fi
  )
  ;;
logs)
  follow=false
  if [[ -n $1 ]]; then
    if [[ $1 = "-f" ]]; then
      follow=true
    else
      print_msg "Unknown argument: $1"
    fi
  fi

  while $follow; do
    if [[ -n $(docker ps -q -f name=bus-testnet) ]]; then
      (
        set -x
        docker logs bus-testnet -f
      ) || true
    fi
    sleep 1
  done

  (
    set -x
    docker logs bus-testnet
  )
  ;;
deploy)
  program=$1
  [[ -n $program ]] || print_msg
  [[ -f $program ]] || print_msg "file does not exist: $program"

  basename=$(basename "$program")
  if docker exec bus-testnet test -f /usr/bin/"$basename"; then
    echo "Error: $basename has already been deployed"
    exit 1
  fi

  (
    set -x
    docker cp "$program" bus-testnet:/usr/bin/
  )
  docker exec bus-testnet ls -l /usr/bin/"$basename"
  echo "$basename deployed successfully"
  ;;
*)
  print_msg "Unknown command: $cmd"
esac

exit 0
