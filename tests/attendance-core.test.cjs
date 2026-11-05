const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../attendance-core.js');
const sample=()=>({attendancePage:true,busy:false,origin:'https://erp.test',account:'TEACHER',date:'05/11/2026',classType:'lab',
 fields:Object.fromEntries(['program','batch','semester','specialization','course','section','session'].map(key=>[key,{selected:[{value:key+'1',label:key+'1'}]}])),
 students:[{usn:'U1',registration:'R1',present:false},{usn:'U2',registration:'R2',present:true},{usn:'U3',registration:'R3',present:false}]});
const target=()=>{const s=sample();s.fields.session.selected=[{value:'session2',label:'Session 2'}];return s;};
test('matches by USN after row reorder and restores both absent and present states',()=>{
 const copy=A.capture(sample()),s=target();s.students.reverse();s.students.forEach(student=>student.present=true);
 assert.equal(A.plan(copy,s).usn,'U3');s.students.find(s=>s.usn==='U3').present=false;
 assert.equal(A.plan(copy,s).usn,'U1');s.students.find(s=>s.usn==='U1').present=false;
 s.students.find(s=>s.usn==='U2').present=false;assert.equal(A.plan(copy,s).present,true);
 s.students.find(s=>s.usn==='U2').present=true;assert.equal(A.plan(copy,s).type,'done');
});
test('rejects context, roster, and identity mismatches before writing',()=>{
 const copy=A.capture(sample());
 for(const key of ['date','account','origin','classType']){const s=target();s[key]='different';assert.equal(A.plan(copy,s).type,'error');}
 for(const key of ['program','batch','semester','specialization','course','section']){const s=target();s.fields[key].selected=[{value:'other'}];assert.equal(A.plan(copy,s).type,'error');}
 for(const change of [s=>s.students.pop(),s=>s.students.push({usn:'U4',registration:'R4',present:true}),s=>s.students[0].registration='wrong',s=>s.students[0].usn=s.students[1].usn,s=>s.students[0].disabled=true]){const s=target();change(s);assert.equal(A.plan(copy,s).type,'error');}
 assert.equal(A.plan(copy,sample()).type,'done');
});
test('rejects incomplete or paginated copies and locks the target session',()=>{
 for(const change of [s=>s.rosterError='Paginated',s=>s.students=[],s=>s.students[0].usn='',s=>s.account='current-lecturer',s=>s.fields.session.selected=[]]){const s=sample();change(s);assert.throws(()=>A.capture(s));}
 const copy=A.capture(sample()),s=target(),locked=A.context(s);s.fields.session.selected=[{value:'session3'}];assert.match(A.plan(copy,s,locked).message,/target session changed/);
 const recorded=target();recorded.alreadyRecorded='Already entered attendance';assert.match(A.plan(copy,recorded).message,/already recorded/);
});

test('same-session restore repairs checked and unchecked states, keeping recorded/session-change guards',()=>{
 const s=sample(),copy=A.capture(s);s.students[0].present=true;s.students[1].present=false;
 assert.equal(A.plan(copy,s).present,false);s.students[0].present=false;
 assert.equal(A.plan(copy,s).present,true);s.students[1].present=true;
 assert.equal(A.plan(copy,s).type,'done');
 s.alreadyRecorded='Already entered';assert.match(A.plan(copy,s).message,/already recorded/);
});
