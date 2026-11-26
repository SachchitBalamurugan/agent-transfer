function gif(frames,w,h,palette,fps){
 const out=[],small=n=>[n&255,n>>8&255],ascii=s=>Array.from(s,c=>c.charCodeAt(0));out.push(...ascii('GIF89a'),...small(w),...small(h),0xf4,0,0);
 for(let j=0;j<32;j++){const c=parseInt((palette[j]||'#000000').slice(1),16);out.push(c>>16,c>>8&255,c&255);}
 out.push(33,255,11,...ascii('NETSCAPE2.0'),3,1,0,0,0);let prev;
 for(const {pixels,delay} of frames){
  let x1=0,x2=w-1,y1=0,y2=h-1;
  if(prev){x1=w;x2=0;y1=h;y2=0;for(let i=0;i<pixels.length;i++)if(prev[i]!==pixels[i]){const x=i%w,y=Math.floor(i/w);x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);}if(x1>x2){x1=x2=y1=y2=0;}}
  out.push(33,249,4,4,...small(delay||Math.round(100/fps)),0,0,44,...small(x1),...small(y1),...small(x2-x1+1),...small(y2-y1+1),0,5);
  const data=[],dict=new Map();let val=0,bits=0,width=6,next=34,prefix=-1;
  function emit(v){val|=v<<bits;bits+=width;while(bits>=8){data.push(val&255);val>>>=8;bits-=8;}}
  emit(32);
  for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){const c=pixels[y*w+x];if(prefix<0){prefix=c;continue;}const k=prefix*32+c;if(dict.has(k)){prefix=dict.get(k);continue;}emit(prefix);
   if(next>=(1<<width)&&width<12)width++;if(next<4095)dict.set(k,next++);else{emit(32);dict.clear();next=34;width=6;}prefix=c;
  }
  if(prefix>=0)emit(prefix);if(next>=(1<<width)&&width<12)width++;emit(33);if(bits)data.push(val&255);
  for(let i=0;i<data.length;i+=255){const buf=data.slice(i,i+255);out.push(buf.length,...buf);}out.push(0);prev=pixels;
 }
 out.push(59);return Uint8Array.from(out);
}
module.exports={gif};
