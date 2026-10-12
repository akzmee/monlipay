#!/usr/bin/env python3
"""Render the recorded, real-testnet demo. Requires ffmpeg with libass/libx264.
Raw Playwright captures live in ignored output/playwright; no wallet keys are used.
Usage: python3 scripts/render-demo.py /path/to/ffmpeg
"""
import concurrent.futures, hashlib, json, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
FFMPEG = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
RAW = ROOT / "output/playwright"
OUT = ROOT / "web/public/demo"
WORK = RAW / "render"
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
SCENES = [
 ("00-home.webm", 6, "Send tokens with a link.", "Real Monad testnet demo. Wallet confirmations are automated."),
 ("01-payment.webm", 14, "Choose a token. Set the amount. Fund the link.", "12.34 DEMOUSD: a six-decimal test token with no monetary value."),
 ("02-claim.webm", 11, "Open the link and claim the payment.", "The transaction receipt confirms the token transfer."),
 ("03-contacts.webm", 8, "Save the wallets you send to.", "Contacts are private. Unlock them with a wallet signature."),
 ("04-lucky.webm", 12, "Sharing with a group? Choose Lucky Link.", "Set the pool, recipient slots, and eligible wallets."),
 ("05-draw.webm", 10, "One random share per eligible wallet.", "Pyth Entropy settles the draw. Fees and gas are paid in MON."),
 ("06-collect.webm", 6, "Reveal the amount. Collect your share.", "This is a real testnet withdrawal. Confirmation waits are shortened."),
 ("07-history.webm", 8, "Every link, in one place.", "Track Payment and Lucky Links. Refund available funds after expiry."),
 ("00-home.webm", 5, "Create a link. Send it in a chat.", "Try MonliPay at monlipay.xyz"),
]
def call(args):
 result = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, text=True)
 if result.returncode: raise RuntimeError(result.stderr[-2000:])
def duration(path):
 result = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True)
 hours, minutes, seconds = re.search(r"Duration: (\d+):(\d+):([\d.]+)", result.stderr).groups()
 return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
def render(item):
 index, (source, seconds, heading, detail) = item
 src = RAW / source
 length = duration(src)
 ass = WORK / f"{index:02}.ass"
 ass.write_text(f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1440
PlayResY: 900
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Go,28,&H00FAF2F4,&H00FAF2F4,&H00161111,&H00161111,-1,0,0,0,100,100,0,0,1,0,0,2,24,24,56,1
Style: Detail,Go,20,&H00C4B0B6,&H00C4B0B6,&H00161111,&H00161111,0,0,0,0,100,100,0,0,1,0,0,2,24,24,21,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:10:00.00,Title,,0,0,0,,{heading}
Dialogue: 0,0:00:00.00,0:10:00.00,Detail,,0,0,0,,{detail}
""")
 # Fit the full browser frame above the caption strip; never cover a control.
 vf = f"setpts={seconds / length}*PTS,fps=25,scale=1264:790:flags=lanczos,pad=1440:900:88:0:color=0x111116,subtitles={ass}:fontsdir=/usr/share/fonts/fonts-go"
 dest = WORK / f"{index:02}.mp4"
 call(["-i", str(src), "-vf", vf, "-t", str(seconds), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-threads", "2", str(dest)])
 return {"source": source, "duration": seconds, "caption": heading + " " + detail, "sourceSha256": hashlib.sha256(src.read_bytes()).hexdigest(), "render": str(dest)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 scenes = list(pool.map(render, enumerate(SCENES)))
concat = WORK / "concat.txt"
concat.write_text("".join(f"file '{scene['render']}'\n" for scene in scenes))
call(["-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(OUT / "monlipay-demo.mp4")])
call(["-ss", "2", "-i", str(RAW / "00-home.webm"), "-frames:v", "1", "-q:v", "3", str(OUT / "monlipay-poster.jpg")])
def stamp(seconds): return f"00:{int(seconds // 60):02}:{int(seconds % 60):02}.000"
time = 0
vtt = "WEBVTT\n\n"
for scene in scenes:
 vtt += f"{stamp(time)} --> {stamp(time + scene['duration'])}\n{scene['caption']}\n\n"
 time += scene['duration']
 del scene['render']
(OUT / "monlipay-en.vtt").write_text(vtt)
manifest = {"durationSeconds": time, "resolution": "1440x900", "fps": 25, "audio": "none", "captions": "English, burned in; optional VTT", "origin": "Real browser capture of a local MonliPay build connected to Monad testnet; automated dedicated demo wallet; confirmation waits shortened.", "scenes": scenes, "videoSha256": hashlib.sha256((OUT / 'monlipay-demo.mp4').read_bytes()).hexdigest()}
(ROOT / "docs/demo-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"durationSeconds": time, "bytes": (OUT / 'monlipay-demo.mp4').stat().st_size, "sha256": manifest['videoSha256']}))
