'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {BEATS}=require('./scene.cjs');
const api='http://127.0.0.1:3900/elevenlabs/v1';
const headers=process.env.OMNIVOICE_API_KEY?{'xi-api-key':process.env.OMNIVOICE_API_KEY}:{};
function wav(pcm,rate){
 const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);
 return Buffer.concat([h,pcm]);
}
async function main(){
 const res=await fetch(api+'/voices',{headers,redirect:'error'});if(!res.ok)throw Error('VoiceStudio returned '+res.status);
 const {voices}=await res.json(),id=process.argv[2];if(!id){console.table(voices.map(x=>({name:x.name,id:x.voice_id})));return;}
 if(!voices.some(x=>x.voice_id===id)||id==='default')throw Error('Select your saved VoiceStudio voice profile');
 const audio=[],timing=[],rate=24000;
 for(const [text] of BEATS){
  const r=await fetch(api+'/text-to-speech/'+encodeURIComponent(id)+'?output_format=pcm_24000',{method:'POST',redirect:'error',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({text,language_code:'en'})});
  if(!r.ok)throw Error('VoiceStudio synthesis returned '+r.status);
  const pcm=Buffer.from(await r.arrayBuffer());if(!pcm.length||pcm.length%2||r.headers.get('content-type')?.includes('json'))throw Error('Invalid PCM audio');
  const pause=Buffer.alloc(rate*.16*2);audio.push(pcm,pause);timing.push((pcm.length+pause.length)/(rate*2));
 }
 const dir=path.join(__dirname,'private');await fs.mkdir(dir,{recursive:true,mode:0o700});
 await fs.writeFile(path.join(dir,'narration.wav'),wav(Buffer.concat(audio),rate),{mode:0o600});
 await fs.writeFile(path.join(dir,'timing.json'),JSON.stringify(timing),{mode:0o600});
 console.log('Narration ready. Run npm run film:voice.');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={wav};
