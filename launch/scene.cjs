const PALETTE=['#f8f3e7','#ece6d7','#283a34','#526458','#d66d4e','#eea484','#944b39','#e9ba55','#ffdc89','#928953','#7ba893','#b8ccac','#547c6c','#80a9cc','#c8dfed','#526c92','#ac91bc','#e4d8e9','#fffdf3','#d2c8af','#353d48','#e7d7bc','#ffebd9','#d6dfcf'];
const W=288,H=512;
const letters={
A:'01110100011000111111100011000110001',B:'11110100011000111110100011000111110',C:'01111100001000010000100001000001111',D:'11110100011000110001100011000111110',E:'11111100001000011110100001000011111',F:'11111100001000011110100001000010000',G:'01111100001000010111100011000101111',H:'10001100011000111111100011000110001',I:'11111001000010000100001000010011111',J:'00111000100001000010000101001001100',K:'10001100101010011000101001001010001',L:'10000100001000010000100001000011111',M:'10001110111010110101100011000110001',N:'10001110011010110011100011000110001',O:'01110100011000110001100011000101110',P:'11110100011000111110100001000010000',Q:'01110100011000110001101011001001101',R:'11110100011000111110101001001010001',S:'01111100001000001110000010000111110',T:'11111001000010000100001000010000100',U:'10001100011000110001100011000101110',V:'10001100011000110001100010101000100',W:'10001100011000110101101011101110001',X:'10001100010101000100010101000110001',Y:'10001100010101000100001000010000100',Z:'11111000010001000100010001000011111',
' ':'00000000000000000000000000000000000',"'":'00100001000000000000000000000000000',',':'00000000000000000000000000010001000','.':'00000000000000000000000000000000100','?':'01110100010000100110001000000000100','+':'00000001000010011111001000010000000','-':'00000000000000011111000000000000000','/':'00001000100001000100010000100010000',':':'00000001000000000000001000000000000'};
const claudeMark = [
 "0000000111000000100000000000",
 "0000001111000001110000000000",
 "0000001111100001110000000000",
 "0000000111100001110000110000",
 "0000000011100001100001110000",
 "0011100011110001100011110000",
 "0011110001110011100111110000",
 "0011111001111011101111100000",
 "0000111110111011111111000000",
 "0000011111111111111110000000",
 "0000001111111111111110000000",
 "0000000011111111111100011111",
 "0000000001111111111111111111",
 "1111111111111111111111111100",
 "1111111111111111111110000000",
 "0000000000011111111111111110",
 "0000000001111111111111111111",
 "0000000111111111111100011111",
 "0000011111011111111110000000",
 "0000111100111111111111000000",
 "0001111001110110111111100000",
 "0001100001100110011101110000",
 "0000000011100110001110111000",
 "0000000111000110001110001000",
 "0000001110001110000111000000",
 "0000001100001110000011000000",
 "0000000000001110000000000000",
 "0000000000001100000000000000"
];
function frame(beat,u,t){
 const a=new Uint8Array(W*H),round=Math.round;
 function rect(x,y,w,h,c){const left=Math.max(0,round(x)),right=Math.min(W,round(x+w));if(right<=left)return;for(let j=Math.max(0,round(y));j<Math.min(H,round(y+h));j++)a.fill(c,j*W+left,j*W+right);}
 function ellipse(x,y,rx,ry,c){for(let j=-ry;j<=ry;j++){const width=rx*Math.sqrt(Math.max(0,1-j*j/(ry*ry)));rect(x-width,y+j,width*2+1,1,c);}}
 function line(x,y,xx,yy,w,c){const n=Math.ceil(Math.max(Math.abs(xx-x),Math.abs(yy-y)));for(let i=0;i<=n;i++)rect(x+(xx-x)*i/(n||1)-w/2,y+(yy-y)*i/(n||1)-w/2,w,w,c);}
 function label(s,x,y,z=1,c=2){let k=0;for(const char of s.toUpperCase().replaceAll('’',"'")){const g=letters[char]||letters[' '];for(let n=0;n<35;n++)if(g[n]==='1')rect(x+k+z*(n%5),y+z*Math.floor(n/5),z,z,c);k+=6*z;}}
 function center(s,y,z,c){label(s,(W-(s.length*6-1)*z)/2,y,z,c);}
 function pill(s,x,y,fg=2,bg=18){const w=s.length*6+12;rect(x-w/2,y,w,15,bg);label(s,x-w/2+6,y+4,1,fg);}
 function sprite(x,y,s,kind,hop,hero=false){
  const [top,body,shade]=[[5,4,6],[14,13,15],[11,10,12],[8,7,9],[17,16,15]][kind%5];
  ellipse(x,y+2,s*5.3,Math.max(1,round(s)),19);const b=y-Math.abs(Math.sin(hop))*s*1.3;
  const box=(dx,dy,w,h,c)=>rect(x+dx*s,b+dy*s,w*s,h*s,c);
  box(-4,-8,8,2,top);box(-5,-6,10,5,body);box(-4,-1,8,1,shade);
  const step=Math.sin(hop)*0.55;box(-3,-1,1.5,2+step,shade);box(1.5,-1,1.5,2-step,shade);
  box(-2.8,-5.3,.9,1.7,2);box(1.5,-5.3,.9,1.7,2);box(-5.8,-4.3,1,1.8,body);box(4.8,-4.3,1,1.8,body);
  if(hero){box(-3,-10,6,1.6,2);box(-4,-8.6,7,1.3,3);box(1,-1.7,3.5,2.5,7);box(1,-2,3.5,.65,8);line(x-2*s,b-6*s,x+1.5*s,b-2*s,Math.max(1,s*.45),9);}
 }
 // A folded-paper diorama with an elevated railway between the two terminals.
 for(let y=0;y<H;y+=5)for(let x=(y%11);x<W;x+=13)if((x*19+y*7)%17<3)rect(x,y,1,1,1);
 ellipse(-15,155,94,110,22);ellipse(302,217,110,159,14);ellipse(193,359,155,65,23);
 rect(14,22,17,3,4);rect(14,27,11,3,4);label('AGENT TRANSFER',38,23,1,2);
 const title=beat<4?['PACK YOUR','SETUP.']:beat<9?['WEEKS OF','CONTEXT.']:beat<10?['BRING IT','OVER.']:beat<12?['CHECK THE','MANIFEST.']:['PICK UP','THE THREAD.'];
 title.forEach((s,i)=>center(s,58+i*31,3,2));
 // Terminal canopies and stamps. The first mark is the Claude sunburst.
 function terminal(x,y,name,cl){ellipse(x,y+15,52,16,19);rect(x-39,y-21,78,32,18);rect(x-43,y-28,86,7,cl);rect(x-32,y-21,6,30,21);rect(x+26,y-21,6,30,21);pill(name,x,y-13);}
 terminal(62,182,'CLAUDE CODE',4);terminal(222,230,'CODEX',15);
 claudeMark.forEach((row,y)=>{ for(let x=0;x<row.length;x++)if(row[x]==='1')rect(47+x,125+y,1,1,4); });
 for(let i=0;i<31;i++){const f=i/30,x=58+170*f,y=207+44*f+12*Math.sin(f*Math.PI);rect(x-1,y-1,4,3,19);}
 for(let j=0;j<3;j++){const y=277+j*29;rect(29,y,230,24,18);rect(29,y,4,24,[4,10,13][j]);label(['SKILLS','PROJECT RULES','CHAT HISTORY'][j],42,y+9);label((beat>=10?['READY','REVIEW','SEARCH']:['.MD','GUIDE','THREAD'])[j],198,y+9,1,beat>=10&&j===1?6:3);}
 const progress=beat<2?.08+u*.06:beat===2?.14+.72*u:beat===3?.86-.72*u:beat<9?.12:beat===9?.12+.75*u:.87;
 const x=54+170*progress,y=209+48*progress+10*Math.sin(progress*Math.PI);sprite(x,y,3,0,t*5,true);
 for(let i=0;i<9;i++){const origin=i%3,row=Math.floor(i/3);const q=beat<9?0:Math.min(1,Math.max(0,(beat-9+u-i*.055)/1.5));let px=40+row*14+origin*6+(157-row*2)*q,py=242+origin*6+row*2+Math.sin(q*Math.PI)*9+q*10;sprite(px,py,1.1,i+1,t*4+i);}
 if(beat>=4&&beat<=8){
   rect(0,124,W,251,0);ellipse(154,240,122,104,beat===5?23:beat===6?17:14);
   for(let k=0;k<9;k++){const theta=k*.698+t*.12;const x=145+78*Math.cos(theta),y=230+53*Math.sin(theta);sprite(x,y,1.6,(k+1)%5,t*3.5+k);}
   sprite(143,255,5,0,t*3,true);
   pill(['IN YOUR WORKSPACE','INSTALLED SKILLS','PROJECT INSTRUCTIONS','SAVED CONVERSATIONS','DESTINATION'][beat-4],144,144);
   rect(37,298,214,64,18);rect(37,298,214,4,[7,10,16,13,4][beat-4]);label(['WORKSPACE','SKILL.MD','CLAUDE.MD','PROJECT CHAT','NEW SESSION'][beat-4],49,312,1,3);
   const msg=['YOUR SETUP','REPORT SKILL','TEST FIRST','RETRY POLICY','TRY CODEX'][beat-4];label(msg,49,334,2,2);
 }
 if(beat===9){rect(29,277,230,84,18);label('YOU',43,292,1,3);label('BRING MY',43,312,2,2);label('SETUP OVER.',43,332,2,2);}
 if(beat===11){rect(29,306,230,24,8);rect(29,306,4,24,6);label('CUSTOM HOOK',42,315,1,6);label('REVIEW',198,315,1,6);}
 if(beat>=12){rect(18,271,252,97,18);rect(18,271,252,3,10);label('SEARCH HISTORY',31,285,1,3);label('RETRY POLICY',31,306,2,2);label('FOUND IN PROJECT CHAT',31,338,1,12);rect(31,352,Math.min(219,110+u*70),3,11);}
 rect(16,388,256,1,19);let words=BEATS[beat][0].toUpperCase().split(' '),lines=[''];for(const w of words){let n=lines.length-1;if((lines[n]+' '+w).trim().length>21)lines.push(w);else lines[n]=(lines[n]+' '+w).trim();}
 lines.forEach((s,j)=>center(s,405+j*19,2,2));rect(17,479,254,3,1);rect(17,479,254*(beat+u)/BEATS.length,3,4);
 return a;
}
const BEATS=[["I just open sourced a tool",2.2],["that lets you take your setup",2],["from Claude Code to Codex,",2.1],["or the other way around.",1.9],["Say you’ve spent weeks teaching Claude how you work.",3.9],["You’ve installed skills,",1.6],["written project instructions,",1.8],["and figured things out in chats you still refer back to.",4.3],["Now you want to try Codex.",2.3],["Just ask it to bring your setup over.",3.1],["It shows you what can transfer",2.3],["and what needs a tweak.",2.1],["You can even find an old conversation",2.7],["and pick up where you left off.",3]];
module.exports={frame,PALETTE,W,H,BEATS};
