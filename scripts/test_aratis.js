"use strict";
process.env.VEYRA_DATA_ROOT = process.env.VEYRA_DATA_ROOT || require("path").join(__dirname, "..", ".test-data");
const { integrationPlan, check } = require("../core/aratis");

const tests = [
  ["Hi", {model:"neo",effort:"overdrive"}, p=>p.outcomeBudget===0],
  ["What is 25% of 80?", {model:"cipher",effort:"medium"}, p=>p.task==="math"],
  ["Fix this JavaScript game without breaking saves", {model:"zenith",effort:"overdrive"}, p=>p.outcomeBudget>=10 && p.selectedMinds.includes("brainstem")],
  ["Plan a production business system", {model:"vanta",effort:"high"}, p=>p.stages.antiRegret]
];

let passed=0;
for(const [prompt,opts,assert] of tests){
  const plan=integrationPlan(prompt,opts);
  const c=check(prompt,"A complete answer.",plan);
  const ok=assert(plan)&&Number.isFinite(c.regretRisk);
  console.log(ok?"PASS":"FAIL",prompt,plan.task,plan.effortName,plan.outcomeBudget);
  if(ok)passed++;
}
console.log(`${passed}/${tests.length} ARATIS tests passed`);
process.exit(passed===tests.length?0:1);
