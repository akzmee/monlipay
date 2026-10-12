#!/usr/bin/env python3
"""Append a labelled privacy interface walkthrough to the real testnet demo.
Usage: python3 scripts/append-privacy-demo.py /path/to/ffmpeg
Reads reviewed screenshots; does not simulate a funded browser transaction.
"""
import pathlib, subprocess, sys, json, hashlib
root=pathlib.Path(__file__).resolve().parents[1]
ffmpeg=sys.argv[1]
work=root/'output/playwright/privacy-render';work.mkdir(parents=True,exist_ok=True)
out=root/'web/public/demo'
base=work/'testnet-base.mp4'
if not base.exists():base.write_bytes((out/'monlipay-demo.mp4').read_bytes())
scenes=[
 ('private-create-desktop',8,'Private Payment is an option.','Interface walkthrough: protect saved payment records with your passkey.'),
 ('private-fund-desktop',8,'Add funds, then create a private link.','MON wraps to WMON. Deposits and withdrawals are public; the proving service sees details.'),
 ('private-claim-desktop',8,'The mainnet pilot passed.','1 MON: deposit, private transfer, claim and recovery. Verified separately, not in this recording.')]
rendered=[]
for i,(name,seconds,title,detail) in enumerate(scenes):
 image=root/'.impeccable/review'/f'{name}.png'
 ass=work/f'{i}.ass'
 ass.write_text(f'''[Script Info]
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
Dialogue: 0,0:00:00.00,0:10:00.00,Title,,0,0,0,,{title}
Dialogue: 0,0:00:00.00,0:10:00.00,Detail,,0,0,0,,{detail}
''')
 target=work/f'{i}.mp4'
 vf=f'scale=1400:790:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:0:color=0x111116,subtitles={ass}:fontsdir=/usr/share/fonts/fonts-go'
 subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-loop','1','-i',str(image),'-vf',vf,'-t',str(seconds),'-r','25','-an','-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-threads','2',str(target)],check=True)
 rendered.append(target)
concat=work/'concat.txt';concat.write_text(''.join(f"file '{x}'\n" for x in [base,*rendered]))
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(out/'monlipay-demo.mp4')],check=True)
vttbase=work/'testnet-base.vtt'
if not vttbase.exists():vttbase.write_bytes((out/'monlipay-en.vtt').read_bytes())
s=vttbase.read_text();time=80
for _,seconds,title,detail in scenes:
 def stamp(t):return f'00:{t//60:02}:{t%60:02}.000'
 s+=f'\n{stamp(time)} --> {stamp(time+seconds)}\n{title} {detail}\n';time+=seconds
(out/'monlipay-en.vtt').write_text(s)
manifest={'durationSeconds':time,'priorTestnetSeconds':80,'privacyInterfaceSeconds':24,'fundedBrowserRecording':False,'privacyEvidence':'docs/anoma-private-payment-readiness.json','videoSha256':hashlib.sha256((out/'monlipay-demo.mp4').read_bytes()).hexdigest(),'scenes':[{'source':n+'.png','duration':t,'title':h,'caption':d}for n,t,h,d in scenes]}
(root/'docs/privacy-demo-addendum.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
