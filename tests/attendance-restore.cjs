// Focused checks for the Porcelain Blue layout and optional Theory/Lab override.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const url='https://jained.jgianveshana.com/UI/Academics/Class%20Attendance/JVPL_Regular_Class_Attendance.aspx';
const complete={dateMode:'current',classType:'lab',date:'05/11/2026',fields:{attendanceType:['at-lab'],program:['p1'],batch:['b1'],semester:['sem5'],specialization:['cyber'],course:['lab502'],section:['section-lab1'],session:['period1']}};
let context;
(async()=>{
  const fixture=(await fs.readFile(path.join(__dirname,'fixture.html'),'utf8')).replace('</body>','<script>'+await fs.readFile(path.join(__dirname,'attendance-fixture.js'),'utf8')+'</script></body>');
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'classflow-type-'));
  const cached=path.join(process.env.LOCALAPPDATA||'','ms-playwright','chromium-1243','chrome-win64','chrome.exe');
  const executablePath=process.env.CLASSFLOW_TEST_CHROMIUM||(await fs.access(cached).then(()=>cached).catch(()=>undefined));
  context=await chromium.launchPersistentContext(profile,{headless:true,channel:executablePath?undefined:'chromium',executablePath,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
  await context.route('https://jained.jgianveshana.com/**',route=>route.fulfill({contentType:'text/html',body:fixture}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const site=await context.newPage();await site.goto(url);
  const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(tab=>tab.url?.includes('JVPL_Regular_Class_Attendance'))?.id);
  const seed=async data=>{await site.evaluate(data=>{sessionStorage.setItem('fixture',JSON.stringify(data));sessionStorage.removeItem('history');},data);await site.reload();};
  await seed(complete);
  let panel=await context.newPage();
  await panel.addInitScript(tabId=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=message=>send({...message,tabId});},tabId);
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await panel.setViewportSize({width:360,height:900});
  const source=Array.from({length:10},(_,i)=>({usn:'STUDENT'+String(i+1).padStart(2,'0'),registration:'REG'+i,present:i>=5}));
  const setup=async(students,session)=>{
    await site.evaluate(({students,session,complete})=>{
      sessionStorage.setItem('students',JSON.stringify(students));
      sessionStorage.setItem('fixture',JSON.stringify({...complete,fields:{...complete.fields,session:[session]}}));
      for(const key of ['attendance-writes','attendance-posted-forms','attendance-button-clicked','row-clicked'])sessionStorage.removeItem(key);
    },{students,session,complete});
    await site.reload();
  };
  await setup(source,'period1');
  await panel.getByRole('button',{name:'Copy attendance',exact:true}).click();
  await panel.getByText(/5 present.*5 absent/).waitFor();
  const copy=await worker.evaluate(async()=>(await chrome.storage.local.get('classflow.attendanceCopy'))['classflow.attendanceCopy']);
  assert.equal(copy.students.filter(student=>student.present).length,5);
  await setup(source.map(student=>({...student,present:true})).reverse(),'period2');
  // These extra absences exist only in the live form, like unsaved accidental unticks.
  await site.evaluate(()=>{
    const rows=[...document.querySelectorAll('#Body_gdvStudents tr')].filter(row=>!row.querySelector('th'));
    for(const row of rows)if(['STUDENT06','STUDENT08','STUDENT10'].includes(row.cells[4].textContent))row.querySelector('input').checked=false;
  });
  await panel.getByRole('button',{name:'Apply to this session',exact:true}).click();
  let done=false;
  for(let i=0;i<250;i++){
    const job=await worker.evaluate(async id=>(await chrome.storage.session.get('classflow.job.'+id))['classflow.job.'+id],tabId);
    if(job?.status==='error')throw new Error(job.message);
    if(job?.status==='done'){done=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(done,true);
  const expected=new Map(source.map(student=>[student.usn,student.present]));
  const actual=await site.evaluate(()=>JSON.parse(sessionStorage.getItem('students')));
  for(const student of actual)assert.equal(student.present,expected.get(student.usn),student.usn);
  // Even if the server honors only the clicked checkbox, EVERY submitted form
  // carries the complete copied checked/unchecked pattern, then all rows are verified.
  const forms=await site.evaluate(()=>JSON.parse(sessionStorage.getItem('attendance-posted-forms')));
  assert.ok(forms.length>0);
  for(const form of forms)for(const student of form)assert.equal(student.present,expected.get(student.usn),student.usn);
  assert.equal(actual.filter(student=>!student.present).length,5);
  assert.equal(await site.evaluate(()=>sessionStorage.getItem('attendance-button-clicked')),null);
  assert.equal(await site.evaluate(()=>sessionStorage.getItem('row-clicked')),null);
  assert.equal(await site.evaluate(()=>typeof window.__classFlowAdapter),'undefined');
  console.log('PASS: five copied absences preserved, three accidental unchecked students restored to present, every postback carries the full copied pattern, and Save is never clicked');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
