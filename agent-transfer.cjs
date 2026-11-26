#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), z = require('node:zlib');
const YAML = require('yaml'), TOML = require('smol-toml');
const {join, resolve, relative, dirname, basename} = path;
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const stable = x => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const digest = x => hash(stable(x));
function fail(m) { throw new Error(m); }
const home = os.homedir(), state = join(home,'.agent-transfer');
const claude = resolve(process.env.CLAUDE_CONFIG_DIR || join(home,'.claude'));
const codex = resolve(process.env.CODEX_HOME || join(home,'.codex'));
const globalClaude = process.env.CLAUDE_CONFIG_DIR ? join(claude,'.claude.json') : join(home,'.claude.json');
const skillHome = a => a==='claude' ? join(claude,'skills') : join(home,'.agents','skills');
const agent = x => ['claude','codex'].includes(x) ? x : fail('Choose claude or codex');
const slash = p => p.split(path.sep).join('/');
const safeName = s => typeof s==='string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);
function parts(s) {
 if(typeof s!=='string'||!s||s.split('/').some(k=>!k||k==='.'||k==='..'||/[\\:\x00-\x1f<>|"?*]/.test(k)||/[. ]$/.test(k)||/^(con|nul|prn|aux|com[1-9]|lpt[1-9])(\.|$)/i.test(k))) fail('Unsafe archive path');
 return s.split('/');
}
function plain(p) {
 for(let q=resolve(p);;q=dirname(q)){
  const st=fs.lstatSync(q,{throwIfNoEntry:false});
  if(st && st.isSymbolicLink()) fail('Linked path requires manual review: '+q);
  if(q===dirname(q)) break;
 }
 return p;
}
const stat = p => fs.lstatSync(plain(p),{throwIfNoEntry:false});
const exists = p => !!stat(p);
const read = p => fs.readFileSync(plain(p));
const text = p => read(p).toString('utf8');
function put(p,b) {
 plain(p); fs.mkdirSync(dirname(p),{recursive:true,mode:0o700});
 const tmp=join(dirname(p),'.transfer-'+crypto.randomUUID());
 try {fs.writeFileSync(tmp,b,{flag:'wx',mode:0o600});fs.renameSync(tmp,p);}
 finally {fs.rmSync(tmp,{force:true});}
}
const json = p => JSON.parse(text(p));
const encoded = b => Buffer.from(b).toString('base64');
const decoded = s => Buffer.from(s,'base64');
const asText = s => decoded(s).toString('utf8');
function scrubObject(v){
 if(Array.isArray(v))return v.map(scrubObject);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,s])=>[k,/token|password|secret|credential|api.?key|header|^env$/i.test(k)?'[RECONNECT '+k+']':scrubObject(s)]));
 return typeof v==='string'?clean(v):v;
}
const privateFile = p => /(^|\/)(\.env($|\.)|\.credentials(?:\.json)?$|auth\.json$|credentials\.json$|id_(rsa|dsa|ed25519)$)|\.(pem|p12|key|pfx)$/i.test(p);
function clean(s) {
 return s.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]')
 .replace(/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{14,}|AKIA[A-Z0-9]{16})\b/g,'[REDACTED TOKEN]')
 .replace(/(\bBearer\s+)[A-Za-z0-9_.~+/=-]{8,}/gi,'$1[REDACTED]')
 .replace(/((?:"?[\w-]*(?:token|password|passwd|secret|api[_-]?key)"?)\s*[:=]\s*["']?)(?!\$\{?)([^\s,;"'{}]{4,})/gi,'$1[REDACTED]');
}
function files(dir, report, skip=new Set()){
 const result=[];
 function visit(p,rel) {
  try {
   for(const e of fs.readdirSync(plain(p),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const n=rel?rel+'/'+e.name:e.name, f=join(p,e.name);
    if(skip.has(e.name)) continue;
    if(e.isSymbolicLink()||privateFile(n)){report(n,'linked or private file excluded');continue;}
    if(e.isDirectory()) visit(f,n); else if(e.isFile()) result.push([n,f]);
   }
  } catch(e){if(e.code!=='ENOENT') report(rel||p,e.message);}
 }
 visit(dir,'');return result;
}
const skip = new Set(['.git','node_modules','.venv','.cache','dist','build','__pycache__']);
const noReport = ()=>{};
function portableSkill(item) {
 const main=item.files['SKILL.md']; if(!main)return 'Missing SKILL.md';
 const s=asText(main), m=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(s);
 if(!m)return 'Missing skill metadata';
 let meta;try{meta=YAML.parse(m[1]);}catch{return 'Invalid skill metadata';}
 if(!meta || meta.name!==item.key || !safeName(meta.name)||typeof meta.description!=='string'||!meta.description.trim())return 'Invalid skill name or description';
 if(Object.keys(meta).some(k=>!['name','description','license','metadata','compatibility'].includes(k)))return 'Host-specific skill metadata';
 if(/!\x60|\$\{?(?:CLAUDE_|CODEX_)|\$ARGUMENTS\b|\.claude\/|\.codex\/|\bmcp__|\b(?:TaskCreate|AgentTool|AskUserQuestion)\b/.test(s))return 'Host-specific skill instructions';
 return '';
}
function transcript(lines,source,scopeFor){
 let cwd='',date='',title='';const messages=[];
 for(const line of lines.split('\n')){
  if(!line.trim())continue;const r=JSON.parse(line);
  if(source==='claude'){cwd ||= r.cwd||''; if(r.isSidechain||r.isMeta||!['assistant','user'].includes(r.type))continue;}
  else {if(r.type==='session_meta'){cwd=r.payload?.cwd||cwd;date=r.timestamp||'';}if(r.type!=='response_item'||r.payload?.type!=='message')continue;}
  const m=source==='claude'?r.message:r.payload;if(!m||!['user','assistant'].includes(m.role))continue;
  const body=typeof m.content==='string'?m.content:(Array.isArray(m.content)?m.content:[]).filter(x=>['text','input_text','output_text'].includes(x?.type)).map(x=>x.text||'').join('\n');
  if(!body.trim())continue;date ||= r.timestamp||''; const value=clean(body); if(!title&&m.role==='user')title=value.slice(0,100);
  messages.push({role:m.role,text:value});
 }
 const scope=scopeFor(cwd);return scope&&messages.length?{scope,date,title,messages}:null;
}
function collect(source, projects, history){
 const items=[],notes=[];
 const note=(name,reason)=>notes.push({name,reason});
 const add=(scope,type,key,fields)=>items.push({scope,type,key,...fields});
 const roots=projects.map((p,i)=>({id:'p'+(i+1),path:fs.realpathSync(plain(resolve(p)))}));
 if(new Set(roots.map(x=>x.path)).size!==roots.length)fail('Duplicate project');
 const containing=cwd=>cwd && roots.filter(x=>{let r=relative(x.path,resolve(cwd));return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));}).sort((a,b)=>b.path.length-a.path.length)[0]?.id;
 function payload(p){const b=read(p);if(b.length>32*1024*1024)fail('File exceeds 32 MiB');const s=b.toString('utf8');return encoded(Buffer.from(s).equals(b)&&!s.includes('\0')?clean(s):b);}
 function tree(scope,kind,key,dir){
  const data=Object.create(null),executable=[];let incomplete=false;
  for(const [n,p] of files(dir,(f,m)=>{incomplete=true;note(join(dir,f),m);},skip)){
   try{parts(n);data[n]=payload(p);if(stat(p).mode&0o111)executable.push(n);}catch(e){incomplete=true;note(p,e.message);}
  }if(Object.keys(data).length)add(scope,kind,key,{files:data,incomplete,executable});
 }
 function skills(scope,dir,options={}){
  if(!exists(dir))return;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   if(e.isDirectory()){
    const length=items.length;tree(scope,'skill',e.name,join(dir,e.name));
    if(items.length>length)Object.assign(items.at(-1),options);
   }else note(join(dir,e.name),'Review linked or non-directory skill entry');
  }
 }
 function single(scope,type,key,p){try{if(exists(p))add(scope,type,key,{origin:slash(relative(home,p)),files:{content:payload(p)}});}catch(e){note(p,e.message);}}
 function servers(scope,obj){for(const [k,v] of Object.entries(obj||{})){
  const env=v?.env||{}, reconnect=[];
  const safe=Object.create(null);
  for(const [prop,value] of Object.entries(v||{})){
   if(prop==='env'){for(const n of Object.keys(env)) reconnect.push('environment '+n);continue;}
   if(/header|token|secret|password/i.test(prop)){reconnect.push(prop);continue;}
   safe[prop]=scrubObject(value);
  }
  if(Array.isArray(safe.args)&&safe.args.some(s=>/token|secret|password|api[-_]?key/i.test(s))){delete safe.args;reconnect.push('arguments');}
  if(typeof safe.url==='string'){try{const u=new URL(safe.url);if(u.username||u.password||u.search){safe.url=u.origin+u.pathname;reconnect.push('URL credentials or parameters');}}catch{reconnect.push('invalid URL');}}
  add(scope,'server',k,{origin:digest(safe),definition:safe,reconnect});
 }}
 function config(scope,p,isToml){
  if(!exists(p))return;try{
   const obj=isToml?TOML.parse(text(p)):json(p);
   const serverKey=isToml?'mcp_servers':'mcpServers';servers(scope,obj[serverKey]);
   for(const [k,v] of Object.entries(obj)){if(k===serverKey)continue;
    if(/auth|token|password|secret|credential|env|api.?key/i.test(k)){note(p+'#'+k,'Private setting omitted');continue;}
    add(scope,'setting',basename(p)+'#'+k,{files:{content:encoded(JSON.stringify(scrubObject(v),null,2))}});
   }
  }catch(e){note(p,'Could not read configuration: '+e.message);}
 }
 const base=source==='claude'?claude:codex;
 skills('user',skillHome(source));if(source==='codex'&&resolve(skillHome(source))!==resolve(join(base,'skills')))skills('user',join(base,'skills'));
 const guide=source==='claude'?'CLAUDE.md':'AGENTS.md';
 single('user','guide',guide,join(base,guide));
 function extras(scope,dir){
  for(const category of ['commands','agents','hooks','rules','memories']){
   for(const [n,p] of files(join(dir,category),note,skip))single(scope,category==='commands'?'command':'reference',category+'/'+n,p);
  }
 }
 extras('user',base);if(source==='codex')single('user','reference','AGENTS.override.md',join(base,'AGENTS.override.md'));
 if(source==='claude'){
  if(exists(globalClaude))servers('user',json(globalClaude).mcpServers);
  config('user',join(base,'settings.json'),false);
 }else config('user',join(base,'config.toml'),true);
 for(const {id,path:root} of roots){
  const d=join(root,source==='claude'?'.claude':'.codex');
  skills(id,join(root,source==='claude'?'.claude':'.agents','skills'));extras(id,d);
  for(const [n,p] of files(root,note,new Set([...skip,'.claude','.codex','.agents']))){
   if(basename(n)===guide)single(id,'guide',n,p);else if(['CLAUDE.local.md','AGENTS.override.md'].includes(basename(n)))single(id,'reference',n,p);
  }
  if(source==='claude'){
   single(id,'guide','CLAUDE.md',join(d,'CLAUDE.md'));
   config(id,join(d,'settings.json'),false);config(id,join(d,'settings.local.json'),false);
   config(id,join(root,'.mcp.json'),false);
   if(exists(globalClaude)){const local=json(globalClaude).projects?.[root]?.mcpServers;if(local)for(const key of Object.keys(local))note(key,'Private project MCP server; reconnect in destination scope');}
   const dir=join(claude,'projects',root.replace(/[^A-Za-z0-9]/g,'-'),'memory');
   tree(id,'memory','auto-memory',dir);
  }else config(id,join(d,'config.toml'),true);
 }
 if(history){
  const dirs=source==='claude'?['projects']:['sessions','archived_sessions'];
  for(const dir of dirs)for(const [n,p] of files(join(base,dir),note,skip)){
   if(!n.endsWith('.jsonl'))continue;
   try{const raw=text(p),t=transcript(raw,source,containing);if(t)add(t.scope,'thread',hash(n).slice(0,24),{date:t.date,title:t.title,messages:t.messages,transcript:raw.split('\n').filter(s=>s.trim()).map(s=>scrubObject(JSON.parse(s)))});}
   catch{note(n,'Unreadable conversation');}
  }
 }
 const pluginDir=join(base,'plugins');
 if(source==='claude'&&exists(join(pluginDir,'installed_plugins.json'))){
  try{
   const installed=json(join(pluginDir,'installed_plugins.json')).plugins||{};
   for(const [name,records] of Object.entries(installed))for(const r of Array.isArray(records)?records:[]){
    const project=roots.find(x=>r.projectPath&&relative(x.path,resolve(r.projectPath))==='');
    if(r.scope!=='user'&&!project)continue;
    if(typeof r.installPath!=='string')continue;
    const d=resolve(r.installPath),rel=relative(pluginDir,d);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)){note(name,'External installation path; review manually');continue;}
    const info={plugin:name,version:String(r.version||''),origin:name+'@'+String(r.version||'')};
    const settings=join(claude,'settings.json'),enabled=exists(settings)?json(settings).enabledPlugins?.[name]:undefined;
    if(enabled!==true||r.scope!=='user')info.review='Verify plugin enablement and scope';
    skills(project?.id||'user',join(d,'skills'),info);
    for(const cat of ['commands','agents','hooks'])for(const [n,f] of files(join(d,cat),note,skip))single(project?.id||'user','reference','plugins/'+name+'/'+cat+'/'+n,f);
   }
  }catch(e){note('installed plugins',e.message);}
 }
 if(exists(pluginDir))for(const [n,p] of files(pluginDir,note,skip)){
  if(/(?:^|\/)(installed_plugins\.json|plugin\.json|marketplace\.json)$/.test(n))single('user','reference','plugins/'+n,p);
 }
 return {version:1,source,projects:roots,items,notes};
}
function loadBundle(file){
 const bytes=z.gunzipSync(read(file),{maxOutputLength:512*1024*1024});
 const wrapper=JSON.parse(bytes);const b=wrapper.bundle;
 if(b?.version!==1||wrapper.sha256!==digest(b))fail('Bundle version or integrity check failed');
 agent(b.source);if(!Array.isArray(b.items)||!Array.isArray(b.projects))fail('Invalid manifest');
 return b;
}
const guideName = a => a==='claude'?'CLAUDE.md':'AGENTS.md';
function translatedServer(s,src){
 const v=s.definition;if(!v||s.reconnect?.length)return null;
 if(s.key==='__proto__'||s.key==='constructor'||!/^[-\w.]+$/.test(s.key))return null;
 const keys=Object.keys(v);if(keys.some(k=>!['type','command','args','url'].includes(k)))return null;
 if(clean(JSON.stringify(v)).includes('[REDACTED')||/\$\{|%[A-Za-z_]+%/.test(JSON.stringify(v)))return null;
 if(typeof v.command==='string'&&v.command.trim()&&!v.url&&(!v.type||v.type==='stdio')&&(!v.args||Array.isArray(v.args)&&v.args.every(x=>typeof x==='string'))){
  return {...(src==='codex'?{type:'stdio'}:{}),command:v.command,...(v.args?{args:v.args}:{})};
 }
 if(typeof v.url==='string'&&/^https?:\/\//.test(v.url)&&!v.command&&(src==='codex'?!v.type:v.type==='http')){
  return {...(src==='codex'?{type:'http'}:{}),url:v.url};
 }
 return null;
}
function commandSkill(i){
 const raw=asText(i.files.content);const name=i.key.replace(/^commands\//,'').replace(/\.md$/,'').replace(/\//g,'-');
 if(!i.key.endsWith('.md')||!safeName(name)||/^---|\$ARGUMENTS|\$\d|!\x60/.test(raw))return null;
 const body='---\nname: '+name+'\ndescription: '+JSON.stringify('Run the imported '+name+' procedure.')+'\n---\n\n'+raw;
 return {...i,key:name,files:{'SKILL.md':encoded(body)}};
}
function indexed(b,i,scope){
 return join(state,'library',b.source,scope==='user'?'user':hash(scope).slice(0,24),i.type,digest([i.key,i.origin||'']).slice(0,24)+'.json');
}
const bytesAt=p=>{const s=stat(p);return s?(s.isFile()?read(p):fail('Expected a regular file: '+p)):null;};
const fingerprint=b=>b===null?null:hash(b);
function grams(s){
 const bits=new Array(64).fill(0),v=s.toLowerCase();
 for(let i=2;i<v.length;i++){const h=(v.charCodeAt(i-2)*961+v.charCodeAt(i-1)*31+v.charCodeAt(i))&2047;bits[h>>>5]|=1<<(h&31);}
 return bits;
}
const catalogFile=join(state,'search-index.json');
function plan(b,target,mapping){
 if(agent(target)===b.source)fail('Choose the other agent as destination');
 const rows=[], contexts=new Map(), names=new Set();
 for(const p of b.projects){if(!/^p[1-9]\d*$/.test(p.id)||names.has(p.id))fail('Invalid project ID');names.add(p.id);}
 for(const id of Object.keys(mapping))if(!names.has(id))fail('Unknown project '+id);
 const roots=new Map(b.projects.map(p=>{const r=mapping[p.id]||p.path;if(!path.isAbsolute(r))fail('Map '+p.id+' to an absolute destination');const dest=fs.realpathSync(plain(r));if(!stat(dest).isDirectory())fail('Expected project directory');return [p.id,dest];}));
 if(new Set(roots.values()).size!==roots.size)fail('Two projects map to the same folder');
 const stamps=exists(join(state,'ownership.json'))?json(join(state,'ownership.json')):{};
 const catalog=exists(catalogFile)?json(catalogFile):{};let catalogChanged=false;
 const observed=new Map(),writes=new Map(),candidates=new Map();
 function before(p){if(!observed.has(p))observed.set(p,bytesAt(p));return observed.get(p);}
 function eligible(p,data){
  const old=before(p);if(old?.equals(data))return 'unchanged';
  return old===null?'add':stamps[p]===hash(old)?'update':'conflict';
 }
 function queue(p,data,owner=true,mode){writes.set(p,{p,data,owner,mode});}
 function archive(i,scope){
  const p=indexed(b,i,scope),data=Buffer.from(JSON.stringify({...i,project:scope,source:b.source}));
  const status=eligible(p,data);if(status==='add'||status==='update')queue(p,data);
  if(status!=='conflict'){
   const rel=slash(relative(join(state,'library'),p)),id=hash(rel).slice(0,24);
   const entry={relative:rel,project:scope,date:i.date||'',title:i.title||i.key,bits:grams([i.title||i.key,...passages(i).map(m=>m.text)].join('\n'))};
   if(stable(catalog[id])!==stable(entry)){catalog[id]=entry;catalogChanged=true;}
  }
  return status;
 }
 function consider(root,i,payload,destKey){
  parts(destKey);const dir=join(root,...parts(destKey));
  const pairs=Object.entries(payload).map(([name,data])=>[name?join(dir,...parts(name)):dir,decoded(data)]);
  return pairs.map(([p,data])=>({p,data,mode:i.executable?.includes(slash(relative(dir,p)))?0o700:undefined}));
 }
 for(const i of b.items){
  if(!i||typeof i.key!=='string'||!['skill','guide','reference','command','memory','thread','server','setting'].includes(i.type))fail('Invalid bundle entry');
  const user=i.scope==='user',scope=user?'user':roots.get(i.scope);if(!scope)fail('Unknown scope');
  const row={scope:i.scope,type:i.type,name:i.key,status:'archive'};rows.push(row);
  if(i.type==='thread'){if(!Array.isArray(i.messages))fail('Invalid transcript');row.status=archive(i,scope);continue;}
  let prepared=i, entries=null;
  const skills=user?skillHome(target):join(scope,target==='claude'?'.claude':'.agents','skills');
  if(i.type==='command')prepared=commandSkill(i);
  if(i.type==='skill'||i.type==='command'){
   row.reason=i.review||(!prepared?'Command uses host-specific syntax':prepared.incomplete?'Skill has excluded files':portableSkill(prepared));
   if(i.plugin)row.plugin=i.plugin;if(!row.reason&&safeName(prepared.key)){row.requirements=Object.keys(prepared.files).filter(n=>/^(scripts\/)|requirements\.txt$|package\.json$/.test(n));
    const d=join(skills,prepared.key);
    entries=consider(skills,i,prepared.files,prepared.key);
    if(exists(d)){
     const expected=new Set(entries.map(x=>x.p));let blocked=false;
     for(const [,f] of files(d,()=>{blocked=true;}))if(!expected.has(f))blocked=true;
     if(blocked){row.reason='Destination skill contains additional files';row.status='conflict';entries=null;}
    }
   }
  }else if(i.type==='guide'){
   if(basename(i.key)!==guideName(b.source))fail('Invalid guide');const segments=parts(i.key);segments.pop();
   if(user&&segments.length)fail('User guidance must be top-level');const root=user?(target==='claude'?claude:codex):scope;
   entries=[{p:join(root,...segments,guideName(target)),data:decoded(i.files.content)}];
   if(/(^|\s)@[\w.~/-]/m.test(asText(i.files.content))){entries=null;row.reason='Guide imports another file';}
   }else if(i.type==='setting'&&!user&&((target==='codex'&&i.key==='settings.json#effortLevel')||(target==='claude'&&i.key==='config.toml#model_reasoning_effort'))){
   const v=JSON.parse(asText(i.files.content));if(['low','medium','high','xhigh'].includes(v)){
    const p=target==='codex'?join(scope,'.codex','config.toml'):join(scope,'.claude','settings.json');
    const raw=before(p)?.toString('utf8')||'',obj=raw.trim()?(target==='codex'?TOML.parse(raw):JSON.parse(raw)):{};
    const c=contexts.get(p)||{obj,raw,key:target==='codex'?'mcp_servers':'mcpServers',added:Object.create(null)};
    const key=target==='codex'?'model_reasoning_effort':'effortLevel';
    if(obj[key]!==undefined)row.status=obj[key]===v?'unchanged':'conflict';
    else {row.status='add';c.scalar={key,v};contexts.set(p,c);}
    row.reason='Project model effort preference';row.value=v;
   }else row.reason='Model-specific effort setting';
  }else if(i.type==='server'){
   const model=translatedServer(i,b.source);
   if(model&&b.items.filter(other=>other.type==='server'&&other.scope===i.scope&&other.key===i.key).length>1){row.status='conflict';row.reason='Multiple source definitions';}else if(model){
    const p=target==='claude'?(user?globalClaude:join(scope,'.mcp.json')):join(user?codex:join(scope,'.codex'),'config.toml');
    const raw=before(p)?.toString('utf8')||'';
    if(!contexts.has(p)){
     const obj=raw.trim()?(target==='claude'?JSON.parse(raw):TOML.parse(raw)):{};
     const key=target==='claude'?'mcpServers':'mcp_servers';
     contexts.set(p,{obj,key,raw,added:Object.create(null)});
    }
    const c=contexts.get(p),prior=c.obj[c.key]?.[i.key]??c.added[i.key];
    if(prior){row.status=stable(prior)===stable(model)?'unchanged':'conflict';}
    else{row.status='add';c.added[i.key]=model;}row.reason='Review server command or endpoint before activation';row.definition=model;
   }else row.reason=i.reconnect?.length?'Reconnect '+i.reconnect.join(', '):'Server transport or options require review';
  }else row.reason=i.type==='memory'?'Available for local search':'Preserved for reference';
  if(entries){
   const statuses=entries.map(e=>eligible(e.p,e.data));
   row.status=statuses.includes('conflict')?'conflict':statuses.includes('update')?'update':statuses.includes('add')?'add':'unchanged';
   if(row.status==='conflict')row.differences=entries.filter((e,n)=>statuses[n]==='conflict').map(e=>{
    const src=e.data.toString('utf8'),dst=before(e.p).toString('utf8');
    const lines=src.split('\n'),old=dst.split('\n'),n=Array.from({length:Math.max(lines.length,old.length)},(_,i)=>i).find(i=>lines[i]!==old[i]);
    return {path:e.p,sourceHash:hash(e.data),destinationHash:hash(before(e.p)),...(!src.includes('\0')&&!dst.includes('\0')?{line:n+1,incoming:clean(lines[n]||'').slice(0,160),existing:clean(old[n]||'').slice(0,160)}:{})};
   });else candidates.set(row,entries);
  }
  if(row.status==='archive'||row.status==='conflict')archive(i,scope);
 }
 const claims=new Map();
 for(const [r,es] of candidates)for(const e of es){
  const k=process.platform==='win32'?e.p.toLowerCase():e.p;
  if(!claims.has(k))claims.set(k,[]);claims.get(k).push([r,e]);
 }
 for(const group of claims.values())if(new Set(group.map(([,e])=>hash(e.data))).size>1){
  for(const [r] of group){r.status='conflict';r.reason='Multiple source entries target this file';}
 }
 for(const [r,es] of candidates){
  if(r.status==='conflict'){const i=b.items[rows.indexOf(r)];archive(i,i.scope==='user'?'user':roots.get(i.scope));continue;}
  for(const e of es)if(!before(e.p)?.equals(e.data))queue(e.p,e.data,true,e.mode);
 }
 for(const [p,c] of contexts){
  const hasServers=!!Object.keys(c.added).length;if(!hasServers&&!c.scalar)continue;let out;
  if(target==='claude'){if(hasServers)c.obj[c.key]={...c.obj[c.key],...c.added};if(c.scalar)c.obj[c.scalar.key]=c.scalar.v;out=JSON.stringify(c.obj,null,2)+'\n';}
  else {out=(c.scalar?TOML.stringify({[c.scalar.key]:c.scalar.v})+'\n':'')+c.raw+(hasServers?'\n'+TOML.stringify({[c.key]:c.added}):'');TOML.parse(out);}
  queue(p,Buffer.from(out),false);
 }
 if(catalogChanged){before(catalogFile);queue(catalogFile,Buffer.from(JSON.stringify(catalog)),false);}
 const changes=[...writes.values()].sort((a,b)=>a.p.localeCompare(b.p));
 const revision=digest([digest(b),target,[...roots],rows,[...observed].map(([p,v])=>[p,fingerprint(v)]),changes.map(e=>[e.p,hash(e.data)])]);
 return {rows,changes,revision,observed,stamps};
}
const transactions=join(state,'transactions');
function journals(){return exists(transactions)?fs.readdirSync(transactions).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n)).map(n=>[join(transactions,n),json(join(transactions,n))]):[];}
function mode(p){return stat(p)?.mode&0o777;}
function restore(file,j){
 const kept=[];
 for(const f of [...j.files].reverse()){
  const now=bytesAt(f.path),h=fingerprint(now);
  if(h===f.before)continue;
  if(h!==f.after){kept.push(f.path);continue;}
  if(f.original===null)fs.unlinkSync(plain(f.path));else{put(f.path,decoded(f.original));fs.chmodSync(f.path,f.mode);}
 }
 j.status='undone';j.preserved=kept;put(file,JSON.stringify(j));return kept;
}
function recover(){for(const [file,j] of journals())if(j.status==='pending'){const kept=restore(file,j);console.error('Recovered',j.id,'preserved later edits:',JSON.stringify(kept));}}
function apply(pl,token){
 if(pl.revision!==token)fail('Preview changed. Review a fresh preview.');
 if(!pl.changes.length)return {changed:0};
 const changes=[...pl.changes],stamps={...pl.stamps};
 for(const e of changes)if(e.owner)stamps[e.p]=hash(e.data);
 const ledger=join(state,'ownership.json');
 pl.observed.set(ledger,bytesAt(ledger));
 changes.push({p:ledger,data:Buffer.from(JSON.stringify(stamps))});
 const id=crypto.randomUUID(),file=join(transactions,id+'.json');
 const j={id,status:'pending',time:Date.now(),files:changes.map(e=>{
  const original=pl.observed.get(e.p);return {path:e.p,original:original===null?null:encoded(original),before:fingerprint(original),after:hash(e.data),mode:mode(e.p)};
 })};
 put(file,JSON.stringify(j));
 try{
  changes.forEach((e,i)=>{
   if(fingerprint(bytesAt(e.p))!==j.files[i].before)fail('Destination changed: '+e.p);
   put(e.p,e.data);if(e.mode||j.files[i].mode)fs.chmodSync(e.p,e.mode||j.files[i].mode);
  });
  j.status='committed';put(file,JSON.stringify(j));
 }catch(e){restore(file,j);throw e;}
 return {transaction:id,changed:pl.changes.length};
}
async function locked(fn){
 const srv=require('node:net').createServer(s=>s.destroy());
 await new Promise((ok,no)=>srv.once('error',no).listen(32000+parseInt(hash(state).slice(0,4),16)%20000,'127.0.0.1',ok));
 try{recover();return fn();}finally{await new Promise(ok=>srv.close(ok));}
}
function library(phrase='',project,date,id){
 const ix=exists(catalogFile)?json(catalogFile):{},bits=grams(phrase);
 return Object.entries(ix).filter(([k,e])=>(!id||k===id)&&(!project||e.project===resolve(project))&&(!date||e.date.startsWith(date))&&bits.every((m,i)=>(e.bits[i]&m)===m)).map(([k,e])=>{
  const file=join(state,'library',...parts(e.relative));return {id:k,file,item:json(file)};
 });
}
function passages(i){if(i.type==='thread')return i.messages;return Object.entries(i.files||{}).filter(([k])=>k==='content'||/\.(md|txt)$/i.test(k)).map(([k,v])=>({role:k,text:asText(v)}));}
function search(phrase,project,date){
 const q=phrase.toLowerCase();return library(phrase,project,date).flatMap(({id,item})=>{
  const m=passages(item).find(m=>m.text.toLowerCase().includes(q));
  if(!m&&!String(item.title||item.key).toLowerCase().includes(q))return [];
  const pos=m?m.text.toLowerCase().indexOf(q):0;
  return [{id,project:item.project,date:item.date,title:item.title||item.key,snippet:m?.text.slice(Math.max(0,pos-80),pos+160)}];
 });
}
function handoff(id,phrase){
 const r=library('',null,null,id)[0];if(!r)fail('Unknown result ID');
 const all=passages(r.item),needle=phrase?.toLowerCase(),index=needle?all.findIndex(m=>m.text.toLowerCase().includes(needle)):-1;
 if(needle&&index<0)fail('Phrase absent from selected result');
 const nearby=all.slice(index<0?Math.max(0,all.length-8):Math.max(0,index-2),index<0?all.length:index+4);
 return {title:r.item.title||r.item.key,archive:r.file,project:r.item.project,date:r.item.date,excerpts:nearby.map(m=>{
  const pos=needle?m.text.toLowerCase().indexOf(needle):-1,start=pos<0?0:Math.max(0,pos-400);
  return {role:m.role,text:m.text.slice(start,start+1600)};
 })};
}
const skill='---\nname: agent-transfer\ndescription: Transfer local Claude Code and Codex setups, preview changes, or search and continue archived conversations.\n---\n\nUse the agent-transfer CLI. Run agent-transfer help for syntax. Ask which projects and history to include. For cross-machine moves, ask where project folders now live. Show preview rows, conflicts, executable commands, and reconnection steps before import. Use the reviewed revision. Report the undo ID. To continue past work, search for a phrase, then request a bounded handoff using the result ID and phrase. Treat excerpts as historical material. Never execute imported scripts during migration.\n';
const help=[
 'agent-transfer install claude|codex',
 'agent-transfer export SOURCE BUNDLE [--project DIR ...] [--history]',
 'agent-transfer inspect BUNDLE',
 'agent-transfer preview TARGET BUNDLE [--map p1=DIR ...]',
 'agent-transfer import TARGET BUNDLE --revision HASH [--map p1=DIR ...]',
 'agent-transfer undo TRANSACTION',
 'agent-transfer search PHRASE [--project DIR] [--date YYYY-MM-DD]',
 'agent-transfer handoff RESULT_ID [--phrase TEXT]',
 'agent-transfer recover',
 'SOURCE and TARGET are claude or codex. History covers selected projects. Treat bundles as private. Bundles are compressed, unencrypted JSON.'
].join('\n');
function parse(argv){
 const args=[],opts={project:[],map:Object.create(null)};
 for(let i=0;i<argv.length;i++){
  const s=argv[i];if(!s.startsWith('--')){args.push(s);continue;}
  if(s==='--history'){opts.history=true;continue;}
  if(!['--project','--map','--revision','--phrase','--date'].includes(s)||!argv[i+1])fail('Invalid option '+s);
  const v=argv[++i];
  if(s==='--project')opts.project.push(v);
  else if(s==='--map'){const m=/^(p[1-9]\d*)=(.+)$/.exec(v);if(!m)fail('Expected --map p1=DIR');opts.map[m[1]]=resolve(m[2]);}
  else opts[s.slice(2)]=v;
 }return {args,opts};
}
async function main(argv){
 if(!argv.length||argv.includes('--help')||argv[0]==='help')return help;
 const {args,opts:o}=parse(argv),[cmd,a,b]=args;
 if(cmd==='install'){
  const p=join(skillHome(agent(a)),'agent-transfer','SKILL.md');
  if(exists(p)&&text(p)!==skill)fail('Install conflict: '+p);
  put(p,skill);return {skill:p};
 }
 if(cmd==='export'){
  if(o.history&&!o.project.length)fail('Choose at least one --project for history');
  const bundle=collect(agent(a),o.project,o.history),output=resolve(b);
  const packed=Buffer.from(JSON.stringify({bundle,sha256:digest(bundle)}));if(packed.length>512*1024*1024)fail('Bundle too large; export fewer projects');
  fs.writeFileSync(plain(output),z.gzipSync(packed),{flag:'wx',mode:0o600});
  return {bundle:output,projects:bundle.projects,items:bundle.items.length,notes:bundle.notes};
 }
 if(cmd==='inspect'){const v=loadBundle(a);return {source:v.source,projects:v.projects,notes:v.notes,items:v.items.map(({type,key,scope,title,date,files})=>({type,key,scope,title,date,files:Object.keys(files||{})}))};}
 if(cmd==='preview'||cmd==='import'){
  const v=loadBundle(b);if(cmd==='preview'){
   const p=plan(v,agent(a),o.map);
   return {projects:v.projects,notes:v.notes,items:p.rows,revision:p.revision,writes:p.changes.map(e=>e.p)};
  }
  return locked(()=>apply(plan(v,agent(a),o.map),o.revision));
 }
 if(cmd==='undo')return locked(()=>{
  const recent=journals().filter(([,j])=>j.status==='committed').sort((x,y)=>y[1].time-x[1].time)[0];
  if(!recent||recent[1].id!==a)fail('Undo requires the most recent committed transaction: '+(recent?.[1].id||'none'));
  return {preserved:restore(...recent)};
 });
 if(cmd==='recover')return locked(()=>({status:'ready'}));
 if(cmd==='search'&&a)return search(a,o.project[0],o.date);
 if(cmd==='handoff'&&a)return handoff(a,o.phrase);
 fail(help);
}
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(typeof r==='string'?r:JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={collect,plan,apply,recover,restore,transcript,translatedServer,portableSkill,commandSkill,parts,clean,main,search,handoff,loadBundle,stable,digest};
