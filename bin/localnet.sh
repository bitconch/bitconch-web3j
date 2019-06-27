#!/usr/bin/env bash
set -e

channel=$(
  cd "$(dirname "$0")";
  node -p '
    let p = [
      "../lib/node_modules/@bitconch/web3.js/package.json",
      "../@bitconch/web3.js/package.json",
      "../package.json"
    ].find(require("fs").existsSync);
    if (!p) throw new Error("Unable to locate  directory");
    require(p)["testnetDefaultChannel"]
  '
)

usage() {
  exitcode=0
  if [[ -n "$1" ]]; then
    exitcode=1
    echo "Error: $*"
  fi
  cat <<EOF
usage: $0 [update|up|down|logs|deploy] [command-specific options]

Operate a local testnet

 update   - Update the image from dockerhub.com
 up       - Start the cluster
 down     - Stop the cluster
 logs     - Display cluster logging
 deploy   - Deploy a native program.


 logs-specific options:
   -f     - Follow log output

 update-specific options:
   edge   - Update the "edge" channel image
   beta   - Update the "beta" channel imae

 up-specific options:
   edge   - Start the "edge" channel image
   beta   - Start the "beta" channel image
   -n     - Optional Docker network to join

   Default channel: $channel

 down-specific options:
   none

 deploy-specific options:
   program - The program to deploy.

   Note that deployments are discarded on cluster stop

EOF
  exit $exitcode
}

[[ -n $1 ]] || usage
cmd="$1"
shift

docker --version || usage "It appears that docker is not installed"
case $cmd in
update)
  if [[ -n $1 ]]; then
    channel="$1"
  fi
  [[ $channel = edge || $channel = beta ]] || usage "Invalid channel: $channel"

  (
    set -x
    docker pull bitconch/bus:"$channel"
  )
  ;;
up)
  while [[ -n $1 ]]; do
    if [[ $1 = -n ]]; then
      [[ -n $2 ]] || usage "Invalid $1 argument"
      network="$2"
      shift 2
    elif [[ $1 = edge ]]; then
      channel=edge
      shift 1
    elif [[ $1 = beta ]]; then
      channel=beta
      shift 1
    else
      usage "Unknown argument: $1"
    fi
  done

  (
    set -x
    RUST_LOG=${RUST_LOG:-bitconch=info}
    ARGS=(
      --detach
      --name bitconch-localnet
      --network "$network"
      --rm
      # --publish 8899:8899
      # --publish 8900:8900
      # --publish 9900:9900
      --publish 10099:10099
      --publish 10100:10100
      --publish 11100:11100
      --tty
      --env "RUST_LOG=$RUST_LOG"
    )

    docker run "${ARGS[@]}" bitocnch/bus:"$channel"

    for _ in 1 2 3 4 5; do
      if curl \
          -X POST \
          -H "Content-Type: application/json" \
          -d '{"jsonrpc":"2.0","id":1, "method":"getTransactionCount"}' \
          # http://localhost:8899; then
          http://localhost:10099; then
        break;
      fi
      sleep 1
    done
  )
  ;;
down)
  (
    set -x
    if [[ -n "$(docker ps --filter "name=^bitconch-localnet$" -q)" ]]; then
      docker stop --time 0 bitconch-localnet
    fi
  )
  ;;
logs)
  follow=false
  if [[ -n $1 ]]; then
    if [[ $1 = "-f" ]]; then
      follow=true
    else
      usage "Unknown argument: $1"
    fi
  fi

  while $follow; do
    if [[ -n $(docker ps -q -f name=bitconch-localnet) ]]; then
      (
        set -x
        docker logs bitconch-localnet -f
      ) || true
    fi
    sleep 1
  done

  (
    set -x
    docker logs bitconch-localnet
  )
  ;;
deploy)
  program=$1
  [[ -n $program ]] || usage
  [[ -f $program ]] || usage "file does not exist: $program"

  basename=$(basename "$program")
  if docker exec bitconch-localnet test -f /usr/bin/"$basename"; then
    echo "Error: $basename has already been deployed"
    exit 1
  fi

  (
    set -x
    docker cp "$program" bitconch-localnet:/usr/bin/
  )
  docker exec bitconch-localnet ls -l /usr/bin/"$basename"
  echo "$basename deployed successfully"
  ;;
*)
  usage "Unknown command: $cmd"
esac

exit 0
