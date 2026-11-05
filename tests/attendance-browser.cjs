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
  const source=[{usn:'TEST001',registration:'REG1',present:false},{usn:'TEST002',registration:'REG2',present:true},{usn:'TEST003',registration:'REG3',present:true},{usn:'TEST004',registration:'REG4',present:false}];
  const setup=async(students,session='period1',query='')=>{
    await site.evaluate(({students,session,complete})=>{
      sessionStorage.setItem('students',JSON.stringify(students));
      sessionStorage.setItem('fixture',JSON.stringify({...complete,fields:{...complete.fields,session:[session]}}));
      for(const key of ['history','attendance-writes','recorded','drop-writes','attendance-button-clicked','row-clicked'])sessionStorage.removeItem(key);
    },{students,session,complete});
    await site.goto(url+query);
  };
  const detached=async()=>assert.deepEqual(await site.evaluate(()=>({adapter:typeof window.__classFlowAdapter,rules:typeof window.ClassFlowAttendance,begin:beginCallbacks.length,end:endCallbacks.length})),{adapter:'undefined',rules:'undefined',begin:0,end:0});
  const job=()=>worker.evaluate(async id=>(await chrome.storage.session.get(`classflow.job.${id}`))[`classflow.job.${id}`],tabId);
  let observedJob=null;
  const waitDone=async(expected='done')=>{
    for(let i=0;i<250;i++){
      const current=await job();
      if(current?.id!==observedJob && current?.status===expected){observedJob=current.id;await detached();return current;}
      if(current?.id!==observedJob && current?.status==='error'&&expected!=='error')throw new Error(current.message);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Attendance did not finish');
  };
  await setup(source);
  await panel.getByRole('button',{name:'Copy attendance',exact:true}).click();
  await panel.getByText(/2 present.*2 absent/).waitFor();await detached();
  await panel.reload();await panel.getByRole('button',{name:'Apply to this session',exact:true}).waitFor();
  const target=source.map(student=>({...student,present:true})).reverse();target.find(student=>student.usn==='TEST002').present=false;
  await setup(target,'period2');
  await panel.getByRole('button',{name:'Apply to this session',exact:true}).click();
  await waitDone();
  const stored=await site.evaluate(()=>JSON.parse(sessionStorage.getItem('students')));
  for(const student of stored)assert.equal(student.present,source.find(original=>original.usn===student.usn).present);
  assert.equal(await site.evaluate(()=>sessionStorage.getItem('row-clicked')),null);
  assert.equal(await site.evaluate(()=>sessionStorage.getItem('attendance-button-clicked')),null);
  assert.equal(await site.evaluate(()=>JSON.parse(sessionStorage.getItem('attendance-writes')).length),3);
  console.log('PASS: copied attendance survives reopening; full postbacks restore absent AND present by USN after reordered rows; no row-selection or Save clicks');
  // Roster mismatch must be rejected without a single write.
  await setup(target.slice(1),'period2');
  await panel.getByRole('button',{name:'Apply to this session',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'Student lists differ'}).waitFor();
  assert.equal(await site.evaluate(()=>sessionStorage.getItem('attendance-writes')),null);await detached();
  // Same roster but wrong secondary identifier also must not write.
  const changed=structuredClone(target);changed[0].registration='OTHER';await setup(changed,'period2');
  await panel.getByRole('button',{name:'Apply to this session',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'registration number does not match'}).waitFor();await detached();
  console.log('PASS: roster and secondary-ID mismatches block all writes');
  // Partial updates work, even with the panel closed while the operation runs.
  await setup(target,'period2','?async=1');
  await panel.getByRole('button',{name:'Apply to this session',exact:true}).click();
  await panel.close();await waitDone();
  assert.equal(await site.evaluate(()=>JSON.parse(sessionStorage.getItem('students')).filter(student=>!student.present).length),2);
  panel=await context.newPage();
  await panel.addInitScript(tabId=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=message=>send({...message,tabId});},tabId);
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await panel.setViewportSize({width:360,height:800});
  console.log('PASS: partial postbacks complete and clean up with panel closed');
  await setup(target,'period2','?async=1');
  await panel.getByRole('button',{name:'Apply to this session',exact:true}).click();
  await site.waitForFunction(()=>Boolean(sessionStorage.getItem('attendance-writes')));
  await panel.getByRole('button',{name:'Stop',exact:true}).click();await waitDone('stopped');
  await new Promise(resolve=>setTimeout(resolve,600));
  const writes=await site.evaluate(()=>sessionStorage.getItem('attendance-writes'));
  await new Promise(resolve=>setTimeout(resolve,500));assert.equal(await site.evaluate(()=>sessionStorage.getItem('attendance-writes')),writes);await detached();
  console.log('PASS: Stop prevents further checkbox changes and removes hooks');
  await setup(target,'period2');
  await site.evaluate(()=>sessionStorage.setItem('drop-writes','yes'));
  await panel.getByRole('button',{name:'Apply to this session',exact:true}).click();
  const failed=await waitDone('error');assert.match(failed.message,/did not stay selected/);
  console.log('PASS: failed server updates stop after bounded retries');
  for(const width of [360,240,200]){
    await panel.setViewportSize({width,height:800});
    assert.equal(await panel.evaluate(()=>[...document.querySelectorAll('.cf-attendance button')].every(el=>el.getBoundingClientRect().right<=innerWidth)),true);
  }
  await panel.setViewportSize({width:360,height:800});
  await fs.mkdir(path.join(root,'artifacts'),{recursive:true});await panel.screenshot({path:path.join(root,'artifacts','attendance-v1.1.png')});
  const before=await site.evaluate(()=>sessionStorage.getItem('students'));
  await panel.getByRole('button',{name:'Clear copied attendance',exact:true}).click();
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('classflow.attendanceCopy')))['classflow.attendanceCopy'],undefined);
  assert.equal(await site.evaluate(()=>sessionStorage.getItem('students')),before);
  console.log('PASS: compact layout and Clear removes the copy without changing website attendance');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
