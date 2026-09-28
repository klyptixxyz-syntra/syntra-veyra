"use strict";
const fs=require("fs"),path=require("path"),cp=require("child_process");
const root=path.join(__dirname,"..");
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()&&!["node_modules","dist"].includes(e.name))walk(f);else if(e.isFile()&&f.endsWith(".js"))files.push(f)}}
walk(root);
let bad=0;
for(const f of files){
  const r=cp.spawnSync(process.execPath,["--check",f],{encoding:"utf8"});
  if(r.status!==0){bad++;console.error("FAIL",path.relative(root,f),r.stderr)}
}
console.log(`${files.length-bad}/${files.length} JavaScript files passed syntax check`);
process.exit(bad?1:0);
