#!/usr/bin/env bash
# Print reviewed Metropolis fields; never reads deployment secrets or submits.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -m json.tool "$SCRIPT_DIR/../docs/metropolis-submission.json"
