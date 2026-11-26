'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const files = [
 'agent-transfer.cjs','package.json','README.md','LICENSE','test.cjs','skills/agent-transfer/SKILL.md',
 'site/index.html','site/departure.css','site/terminal.webp','site/build.cjs','package-lock.json','site/launch.mp4','vercel.json','.gitignore','ci/github-actions.yml',
 'launch/scene.cjs','launch/gif.cjs','launch/render.cjs','launch/voice.cjs','launch/script.txt','launch/test.cjs'
];
function crc32(data) {
 let crc = -1;
 for (const byte of data) {
  crc ^= byte;
  for (let bit=0;bit<8;bit++) crc = (crc>>>1) ^ ((crc&1)?0xedb88320:0);
 }
 return (crc^-1)>>>0;
}
function zip(files) {
 const chunks=[], central=[];let offset=0;
 for (const file of files) {
  const filePath = path.join(root,file);
  // Vercel omits .gitignore when the CLI uploads a deployment.
  const data = file === '.gitignore' && !fs.existsSync(filePath)
    ? Buffer.from('node_modules/\ndist/\nlaunch/private/\n.vercel/\n.env*\n*.agentpack\n')
    : fs.readFileSync(filePath);
  const name=Buffer.from(file);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(33,12);
  header.writeUInt32LE(crc32(data),14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(0x314,4);header.copy(entry,6,4,30);
  entry.writeUInt32LE(((file==='agent-transfer.cjs'?0o100755:0o100644)*65536)>>>0,38);entry.writeUInt32LE(offset,42);
  chunks.push(header,name,data);central.push(entry,name);offset+=header.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);
 end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,directory,end]);
}
fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(path.join(root,'site/index.html'),path.join(out,'index.html'));
fs.copyFileSync(path.join(root,'site/launch.mp4'),path.join(out,'launch.mp4'));
fs.writeFileSync(path.join(out,'agent-transfer.zip'),zip(files));
execFileSync(process.execPath,[path.join(root,'launch/render.cjs')],{cwd:root,stdio:'inherit'});

for(const asset of ['departure.css','terminal.webp']) fs.copyFileSync(path.join(root,'site',asset),path.join(out,asset));
