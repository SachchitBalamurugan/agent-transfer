'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {frame,PALETTE,W,H,BEATS}=require('./scene.cjs');
const {gif}=require('./gif.cjs');
const timeline=process.argv.includes('--voice')?JSON.parse(fs.readFileSync(path.join(__dirname,'private','timing.json'),'utf8')):BEATS.map(b=>b[1]);
if(timeline.length!==BEATS.length || timeline.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Invalid narration timings');
const palette=PALETTE.map(s=>Buffer.from(s.slice(1),'hex'));
const output=path.join(__dirname,'..','dist');
fs.mkdirSync(output,{recursive:true});
function* frames(fps){
 let end=0,index=0;
 for(let b=0;b<BEATS.length;b++){
  const start=end;end+=timeline[b];const stop=Math.round(end*fps);
  while(index<stop){const t=index++/fps;yield {pixels:frame(b,Math.max(0,(t-start)/timeline[b]),t),delay:100/fps};}
 }
}
async function main(){
 if(!process.argv.includes('--mp4')){
  fs.writeFileSync(path.join(output,'launch.gif'),gif(frames(10),W,H,PALETTE,10));return;
 }
 const voiced=process.argv.includes('--voice'),final=path.join(output,voiced?'launch-voiced.mp4':'launch.mp4');
 const args=['-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',W+'x'+H,'-framerate','30','-i','pipe:0'];
 if(voiced)args.push('-i',path.join(__dirname,'private','narration.wav'),'-c:a','aac','-b:a','160k');
 args.push('-vf','scale=1080:1920:flags=neighbor','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',final);
 const ff=spawn('ffmpeg',args,{stdio:['pipe','inherit','inherit']});
 const done=once(ff,'close');done.catch(()=>{});ff.stdin.on('error',()=>{});
 const data=Buffer.alloc(W*H*3);for(const {pixels} of frames(30)){
  for(let i=0;i<pixels.length;i++){const c=palette[pixels[i]];data[i*3]=c[0];data[i*3+1]=c[1];data[i*3+2]=c[2];}
  await new Promise((ok,no)=>ff.stdin.write(data,e=>e?no(e):ok()));
 }
 ff.stdin.end();const [code]=await done;if(code!==0)throw new Error('FFmpeg exited '+code);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
