#!/usr/bin/env python3
"""Create a public source archive from tracked files, excluding runtime data."""
import hashlib,json,pathlib,subprocess,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'output/submission';out.mkdir(parents=True,exist_ok=True)
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
names=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
archive=out/'monlipay-metropolis-source.zip';included=[]
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for name in sorted(set(names)):
  if not name:continue
  p=root/name
  if not p.is_file() or p.is_symlink():continue
  parts=pathlib.PurePosixPath(name).parts
  if any(x.startswith('.env') and not x.endswith('.example') for x in parts):continue
  if any(x in {'node_modules','.next','data','public-artifacts','.git'} for x in parts):continue
  if name.startswith(('output/','.impeccable/review/')):continue
  z.write(p,'monlipay/'+name);included.append(name)
 z.writestr('monlipay/SOURCE_REVISION.txt',f'MonliPay Metropolis source snapshot\nLocal commit: {revision}\nBaseline: 5544bf76143e404bbdf4c3b91db7454c3a14ac78\nRuntime environments, wallet keys, databases and private journals are excluded.\nSee docs/metropolis-submission.json and docs/private-payment-release.json.\n')
manifest={'file':archive.name,'revision':revision,'files':len(included),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
(out/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest))
