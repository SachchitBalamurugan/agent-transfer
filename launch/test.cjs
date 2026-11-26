'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {frame,BEATS,W,H,PALETTE}=require('./scene.cjs'),{gif}=require('./gif.cjs'),{wav}=require('./voice.cjs');
test('all narration cues render inside the indexed palette',()=>{
 for(const [i] of BEATS.entries()){const p=frame(i,0.5,5);assert.equal(p.length,W*H);assert.ok(p.every(x=>x<PALETTE.length));}
});
test('silent animation encodes a GIF89a at portrait size',()=>{
 const data=Buffer.from(gif([{pixels:frame(0,0,0)}],W,H,PALETTE,10));
 assert.equal(data.toString('ascii',0,6),'GIF89a');assert.equal(data.readUInt16LE(6),W);assert.equal(data.readUInt16LE(8),H);assert.equal(data.at(-1),59);
});
test('narration PCM has a mono 24 kHz WAV header',()=>{
 const data=wav(Buffer.alloc(48000),24000);assert.equal(data.readUInt32LE(24),24000);
 assert.equal(data.readUInt32LE(40),48000);assert.equal(data.readUInt16LE(22),1);assert.equal(data.length,48044);
});
