#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../contracts"
forge install --no-git foundry-rs/forge-std@bf647bd6046f2f7da30d0c2bf435e5c76a780c1b
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.4.0
