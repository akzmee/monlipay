#!/usr/bin/env python3
"""Consistent, private snapshots of MonliPay's two network data volumes.

Run on the deployment host as the Docker operator. Does not read .env files,
export wallet keys, stop containers, delete old snapshots, or send data off-host.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, required=True)
    options = parser.parse_args()
    os.umask(0o077)
    folder = options.destination.resolve()
    folder.mkdir(parents=True, exist_ok=False, mode=0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    files = []
    for network in ("mainnet", "testnet"):
        container = f"monlipay-{network}"
        for name in ("contacts", "link-backups"):
            source = f"/app/data/{name}.sqlite"
            temporary = f"/app/data/.snapshot-{name}-{stamp}.sqlite"
            code = """
import {DatabaseSync, backup} from 'node:sqlite';
import {existsSync, chmodSync} from 'node:fs';
const [source, target] = process.argv.slice(1);
if (!existsSync(source)) { console.log('absent'); process.exit(0); }
const db = new DatabaseSync(source, {readOnly:true});
await backup(db, target); db.close(); chmodSync(target, 0o600);
const copy = new DatabaseSync(target, {readOnly:true});
const result = copy.prepare('PRAGMA integrity_check').all(); copy.close();
if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('Snapshot integrity check failed');
console.log('ok');
"""
            try:
                status = run("docker", "exec", container, "node", "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", code, source, temporary)
                if status == "absent":
                    files.append({"network": network, "database": name, "status": "not-created-yet"})
                    continue
                if status != "ok":
                    raise RuntimeError("Unexpected snapshot result")
                target = folder / f"{network}-{name}.sqlite"
                subprocess.run(["docker", "cp", f"{container}:{temporary}", str(target)], check=True)
                target.chmod(0o600)
                files.append({"network": network, "database": name, "file": target.name, "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "integrity": "ok"})
            finally:
                run("docker", "exec", container, "node", "-e", "require('node:fs').rmSync(process.argv[1],{force:true})", temporary)
    (folder / "manifest.json").write_text(json.dumps({"createdAt": stamp, "files": files}, indent=2) + "\n")
    print(json.dumps({"destination": str(folder), "files": files}, indent=2))


if __name__ == "__main__":
    main()
