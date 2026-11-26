'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),os=require('node:os'),z=require('node:zlib');
const {spawnSync}=require('node:child_process');
const cli=path.join(__dirname,'agent-transfer.cjs');
function lab(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'agent-transfer-test-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=path.join(root,'home'),src=path.join(root,'source'),dst=path.join(root,'destination');
 for(const p of [home,src,dst])fs.mkdirSync(p);
 const env={...process.env,HOME:home,USERPROFILE:home,CODEX_HOME:path.join(home,'.codex')};
 delete env.CLAUDE_CONFIG_DIR;
 const put=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v);};
 const cmd=(...args)=>spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8'});
 const run=(...args)=>{const r=cmd(...args);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 return {home,src,dst,root,put,cmd,run};
}
for(const source of ['claude','codex'])test(source+' exports, imports, resumes and undoes',t=>{
 const {home,src,dst,root,put,cmd,run}=lab(t),cc=source==='claude',target=cc?'codex':'claude';
 const skills=a=>path.join(home,a==='claude'?'.claude':'.agents','skills','report');
 put(path.join(skills(source),'SKILL.md'),'---\nname: report\ndescription: Print a report\n---\nRun scripts/report.cjs to read the template.');
 put(path.join(skills(source),'scripts','report.cjs'),"process.stdout.write(require('node:fs').readFileSync(require('node:path').join(__dirname,'../templates/base.txt')))");
 put(path.join(skills(source),'templates/base.txt'),'fixture output');
 const guide=a=>a==='claude'?'CLAUDE.md':'AGENTS.md',srcGuide=path.join(src,'nested',guide(source)),dstGuide=path.join(dst,'nested',guide(target));
 put(srcGuide,'Original guidance');
 if(cc){
  put(path.join(src,'.claude','settings.json'),JSON.stringify({effortLevel:'high',hooks:{SessionStart:[]}}));
  put(path.join(src,'.mcp.json'),JSON.stringify({mcpServers:{demo:{type:'stdio',command:'tool'},private:{type:'http',url:'https://example.org',headers:{Authorization:'fixture-super-secret'}}}}));
  put(path.join(home,'.claude','projects','abc','thread.jsonl'),JSON.stringify({cwd:src,timestamp:'2025-09-23',type:'user',message:{role:'user',content:'Retry exactly seven times'}}));
 }else{
  put(path.join(src,'.codex','config.toml'),'model_reasoning_effort = "high"\n[mcp_servers.demo]\ncommand = "tool"\n');
  put(path.join(home,'.codex','sessions','2025','thread.jsonl'),[
   {type:'session_meta',timestamp:'2025-09-23',payload:{cwd:src}},
   {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Retry exactly seven times'}]}}
  ].map(x=>JSON.stringify(x)).join('\n'));
 }
 const bundle=path.join(root,'a.agentpack'),map=['--map','p1='+dst];
 run('export',source,bundle,'--project',src,'--history');
 assert.ok(!z.gunzipSync(fs.readFileSync(bundle)).toString().includes('fixture-super-secret'));
 const preview=()=>run('preview',target,bundle,...map), p=preview();
 assert.ok(p.items.some(i=>i.type==='skill'&&i.status==='add'));
 assert.ok(!fs.existsSync(dstGuide));
 const id=run('import',target,bundle,...map,'--revision',p.revision).transaction;
 assert.equal(fs.readFileSync(dstGuide,'utf8'),'Original guidance');
 const executed=spawnSync(process.execPath,[path.join(skills(target),'scripts','report.cjs')],{encoding:'utf8'});assert.equal(executed.stdout,'fixture output');
 assert.equal(preview().writes.length,0);
 const results=run('search','seven times','--project',dst,'--date','2025-09');
 assert.equal(results.length,1);assert.match(run('handoff',results[0].id,'--phrase','seven times').excerpts[0].text,/seven times/);
 put(dstGuide,'A later user edit');
 assert.ok(preview().items.some(i=>i.status==='conflict'));
 assert.notEqual(cmd('import',target,bundle,...map,'--revision',p.revision).status,0);
 assert.ok(run('undo',id).preserved.includes(dstGuide));assert.equal(fs.readFileSync(dstGuide,'utf8'),'A later user edit');
 assert.ok(!fs.existsSync(path.join(skills(target),'SKILL.md')));
});
test('recovery restores an interrupted import without touching edited files',t=>{
 const {home,root,put,run}=lab(t),crypto=require('node:crypto');
 const h=s=>crypto.createHash('sha256').update(s).digest('hex'),a=path.join(root,'a'),b=path.join(root,'b');
 put(a,'imported');put(b,'user edit');
 const id=crypto.randomUUID(),journal=path.join(home,'.agent-transfer','transactions',id+'.json');
 put(journal,JSON.stringify({id,status:'pending',files:[a,b].map(p=>({path:p,before:h('old'),original:Buffer.from('old').toString('base64'),after:h('imported'),mode:0o600}))}));
 run('recover');assert.equal(fs.readFileSync(a,'utf8'),'old');assert.equal(fs.readFileSync(b,'utf8'),'user edit');
 assert.equal(JSON.parse(fs.readFileSync(journal)).status,'undone');
});
