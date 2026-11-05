/* Isolated headless extension tests. Every ERP request is fulfilled from local fixtures. */
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const url = 'https://jained.jgianveshana.com/UI/Academics/Class%20Attendance/JVPL_Regular_Class_Attendance.aspx';
const complete = {dateMode:'current',classType:'lab',date:'05/11/2026',fields:{attendanceType:['at-lab'],program:['p1'],batch:['b1'],semester:['sem5'],specialization:['cyber'],course:['lab502'],section:['section-lab1'],session:['period1']}};
let context,worker,page,panel,tabId,extensionId,lastFinishedJobId;
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const storedJob = () => worker.evaluate(async id=>(await chrome.storage.session.get(`classflow.job.${id}`))[`classflow.job.${id}`],tabId);
async function waitJob(status){
  const until=Date.now()+60000;
  while(Date.now()<until){
    const job=await storedJob();
    if(job?.id!==lastFinishedJobId){
      if(job?.status===status){lastFinishedJobId=job.id;return job;}
      if(job?.status==='error'&&status!=='error')throw new Error(job.message);
    }
    await delay(120);
  }
  throw new Error(`Timed out waiting for ${status}: ${JSON.stringify(await storedJob())}`);
}
async function seed(data,query='',missing=false){
  await page.goto(url+query);
  await page.evaluate(({data,missing})=>{sessionStorage.setItem('fixture',JSON.stringify(data));sessionStorage.removeItem('history');if(missing)sessionStorage.setItem('missing-session','yes');else sessionStorage.removeItem('missing-session');},{data,missing});
  await page.reload();
  await page.locator('#Body_ddlGraduationType').waitFor({state:'attached'});
}
async function openPanel(){
  panel=await context.newPage();
  await panel.addInitScript(tabId=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=message=>send({...message,tabId});},tabId);
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({width:320,height:760});
  await panel.getByText('Attendance page ready',{exact:true}).waitFor();
  return panel;
}
async function detached(){
  const state=await page.evaluate(()=>({adapter:typeof window.__classFlowAdapter,agent:typeof window.__classFlowAgent,begin:beginCallbacks.length,end:endCallbacks.length}));
  assert.deepEqual(state,{adapter:'undefined',agent:'undefined',begin:0,end:0});
  assert.equal((await worker.evaluate(()=>chrome.alarms.getAll())).filter(alarm=>alarm.name.startsWith('classflow.run.')).length,0);
}
async function settings({dateMode='current',classType='lab',date='',attendance='' }={}){
  await panel.getByRole('button',{name:dateMode==='current'?'Current Date':'Previous Date',exact:true}).click();
  if(dateMode==='previous'){await panel.locator('#cf-run-date').fill(date);await panel.locator('#cf-run-date').press('Tab');}
  await panel.getByRole('button',{name:classType==='lab'?'Lab':'Theory',exact:true}).click();
  await panel.locator('#cf-run-attendance').selectOption(attendance);
}
async function capture(name){
  await panel.getByRole('button',{name:'Save this class',exact:true}).click();
  await panel.locator('#cf-form').waitFor();
  assert.equal(await panel.locator('.cf-runtime').count(),0);
  await detached();
  await panel.locator('#cf-name').fill(name);
  await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  await panel.getByRole('button',{name,exact:true}).waitFor();
}
async function apply(name){
  await panel.getByRole('button',{name,exact:true}).click();
  // A barrier behind APPLY prevents observing the previous job's terminal status.
  await panel.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}));
}
async function checkWidth(width){
  await panel.setViewportSize({width,height:760});
  const outside=await panel.evaluate(()=>[...document.querySelectorAll('button,input,select')].filter(element=>{
    const r=element.getBoundingClientRect();return r.width&&(r.left< -1||r.right>innerWidth+1);
  }).map(element=>element.textContent.trim()));
  assert.deepEqual(outside,[],`Controls fit ${width}px`);
}
(async()=>{
  await fs.mkdir(path.join(root,'artifacts'),{recursive:true});
  const fixture=await fs.readFile(path.join(__dirname,'fixture.html'),'utf8');
  const controls=await fs.readFile(path.join(__dirname,'site-controls.html'),'utf8');
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'classflow-test-'));
  const cached=path.join(process.env.LOCALAPPDATA||'','ms-playwright','chromium-1243','chrome-win64','chrome.exe');
  const executablePath=process.env.CLASSFLOW_TEST_CHROMIUM||(await fs.access(cached).then(()=>cached).catch(()=>undefined));
  context=await chromium.launchPersistentContext(profile,{headless:true,channel:executablePath?undefined:'chromium',executablePath,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1440,height:900}});
  await context.route('https://jained.jgianveshana.com/**',route=>{
    const body=new URL(route.request().url()).searchParams.has('markup')?fixture.replace(/<form id="form1">[\s\S]*?<\/form>/,'<form id="form1">'+controls+'</form>'):fixture;
    return route.fulfill({contentType:'text/html',body});
  });
  worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(tab=>tab.url?.includes('JVPL_Regular_Class_Attendance'))?.id);
  extensionId=new URL(worker.url()).host;
  const config=await worker.evaluate(async()=>({manifest:chrome.runtime.getManifest(),panel:await chrome.sidePanel.getOptions({}),behavior:await chrome.sidePanel.getPanelBehavior()}));
  assert.equal(config.manifest.content_scripts,undefined);
  assert.equal(config.manifest.action.default_popup,undefined);
  assert.equal(config.panel.path,'sidepanel.html');assert.equal(config.behavior.openPanelOnActionClick,true);
  await openPanel();await detached();
  await panel.screenshot({path:path.join(root,'artifacts','empty-library.png')});
  console.log('PASS: opening the native side panel injects no scripts, observers or postback callbacks');

  await seed(complete);await capture('Cyber Security · Lab 1');
  const saved=await worker.evaluate(async()=>(await chrome.storage.local.get('classflow.presets'))['classflow.presets'][0]);
  assert.equal(saved.dateMode,undefined);assert.equal(saved.classType,undefined);assert.equal(saved.fields.attendanceType,undefined);
  const pos=await panel.evaluate(()=>({button:document.querySelector('.cf-preset-apply').getBoundingClientRect().bottom,settings:document.querySelector('.cf-runtime').getBoundingClientRect().top}));
  assert.ok(pos.settings<pos.button,'Attendance settings precede named preset buttons');
  for(const width of [320,240,200])await checkWidth(width);
  await panel.screenshot({path:path.join(root,'artifacts','narrow-panel.png')});
  await checkWidth(320);await panel.screenshot({path:path.join(root,'artifacts','saved-class.png')});
  console.log('PASS: explicit capture immediately removes its helper; compact name buttons apply directly at the top');

  await seed({dateMode:'current',classType:'theory',date:'05/11/2026',fields:{}});
  await settings();await apply('Cyber Security · Lab 1');await panel.close();
  const done=await waitJob('done');assert.match(done.message,/already recorded/);
  assert.deepEqual((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture')))).fields,complete.fields);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('history'))),['classType','program','batch','semester','specialization','course','section','session']);
  await detached();assert.equal(await page.evaluate(()=>sessionStorage.getItem('attendance-button-clicked')),null);
  console.log('PASS: ordered full reloads continue with the panel closed and leave no hooks after success');

  await openPanel();await seed({dateMode:'current',classType:'theory',date:'05/11/2026',fields:{}});
  await settings({dateMode:'previous',date:'2026-11-03',attendance:'at-extra'});await apply('Cyber Security · Lab 1');await waitJob('done');
  const different=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture')));
  assert.equal(different.date,'03/11/2026');assert.deepEqual(different.fields,{...complete.fields,attendanceType:['at-extra']});
  assert.deepEqual(await worker.evaluate(async()=>(await chrome.storage.local.get('classflow.presets'))['classflow.presets'][0]),saved);
  await detached();console.log('PASS: per-use date and attendance type do not rewrite the saved class');

  await seed({...structuredClone(complete),fields:{...complete.fields,session:[]}},'',true);
  await settings();await apply('Cyber Security · Lab 1');
  const missing=await waitJob('error');assert.equal(missing.field,'session');assert.match(missing.message,/no longer available/);
  await detached();console.log('PASS: missing live option stops the job and removes all page hooks');

  const both={...structuredClone(complete),dateMode:'previous',date:'04/11/2026'};both.fields.section=['section-lab1','section-lab2'];
  await seed(both,'?checkboxes=1');await capture('Both lab sections');
  await seed({dateMode:'current',classType:'theory',date:'05/11/2026',fields:{}},'?checkboxes=1');
  await settings({dateMode:'previous',date:'2026-11-04'});await apply('Both lab sections');await waitJob('done');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture'))),both);
  await detached();console.log('PASS: Previous Date and individual section postbacks, followed by complete cleanup');

  await seed({dateMode:'current',classType:'theory',date:'05/11/2026',fields:{}},'?async=1');
  await settings();await apply('Cyber Security · Lab 1');await waitJob('done');
  assert.deepEqual((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture')))).fields,complete.fields);
  await detached();console.log('PASS: partial ASP.NET postbacks are tracked only during Apply');

  await seed({dateMode:'current',classType:'theory',date:'05/11/2026',fields:{}},'?async=1');
  await apply('Cyber Security · Lab 1');await panel.getByRole('button',{name:'Stop',exact:true}).click();await waitJob('stopped');
  await delay(600);const stopped=await page.evaluate(()=>sessionStorage.getItem('history'));await delay(500);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('history')),stopped);await detached();
  console.log('PASS: explicit Stop cancels further changes and detaches the helper');

  await seed({dateMode:'current',classType:'lab',date:'05/11/2026',fields:{}},'?async=1');
  await apply('Cyber Security · Lab 1');
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('history')||'[]').includes('program'));
  await page.locator('#Body_ddlAcademicBatch').press('ArrowDown');
  const manual=await waitJob('stopped');assert.match(manual.message,/selecting filters on the website/);await delay(550);await detached();
  console.log('PASS: manual filter input stops an active run without cancelling the input');

  await seed({...structuredClone(complete),fields:{...complete.fields,session:[]}});await capture('Class without session');
  await seed({dateMode:'current',classType:'lab',date:'05/11/2026',fields:{}});await apply('Class without session');
  assert.match((await waitJob('done')).message,/Choose Session No/);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('history'))),['program','batch','semester','specialization','course','section']);
  await detached();console.log('PASS: optional Session No is left untouched');

  await seed(complete); // Editor uses the last explicit capture/cache, not another page read.
  await panel.getByRole('button',{name:'Edit Cyber Security · Lab 1',exact:true}).click();
  assert.equal(await panel.locator('.cf-runtime').count(),0);
  await panel.locator('#cf-name').fill('Afternoon lab');
  await panel.locator('input[data-field="section"][value="section-lab2"]').check();
  await panel.locator('input[data-field="section"][value="section-lab1"]').uncheck();
  for(const width of [320,240,200])await checkWidth(width);
  await panel.screenshot({path:path.join(root,'artifacts','narrow-editor.png')});
  await checkWidth(320);await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  await panel.getByRole('button',{name:'Afternoon lab',exact:true}).waitFor();
  const edited=await worker.evaluate(async()=>(await chrome.storage.local.get('classflow.presets'))['classflow.presets'].find(p=>p.name==='Afternoon lab'));
  assert.deepEqual(edited.fields.section.map(o=>o.value),['section-lab2']);assert.deepEqual(edited.fields.session,[]);
  await panel.getByRole('button',{name:'Edit Afternoon lab',exact:true}).click();
  await panel.getByRole('button',{name:'Delete this preset',exact:true}).click();
  await panel.getByRole('button',{name:'Undo',exact:true}).click();await panel.getByRole('button',{name:'Afternoon lab',exact:true}).waitFor();await detached();
  console.log('PASS: small edit button changes saved dropdowns, supports delete/undo, and never injects page scripts');

  await seed({dateMode:'current',classType:'theory',date:'05/11/2026',fields:{}},'?markup=1&async=1');
  await worker.evaluate(()=>{globalThis.testScriptCalls=0;const execute=chrome.scripting.executeScript.bind(chrome.scripting);chrome.scripting.executeScript=(...args)=>{globalThis.testScriptCalls++;return execute(...args);};});
  await panel.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}));await delay(1000);
  assert.equal(await worker.evaluate(()=>globalThis.testScriptCalls),0);
  const started=Date.now();await page.locator('#Body_ddlGraduationType').selectOption('5',{force:true});
  await page.waitForFunction(()=>document.getElementById('Body_ddlAcademicBatch').options.length>1);
  assert.ok(Date.now()-started<1400);
  await delay(500);assert.equal(await worker.evaluate(()=>globalThis.testScriptCalls),0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('history'))),['program']);await detached();
  await panel.getByRole('button',{name:'Save this class',exact:true}).click();
  await panel.locator('#cf-form').waitFor();
  assert.ok(await worker.evaluate(()=>globalThis.testScriptCalls)>0);await detached();
  assert.equal(await panel.locator('#cf-program option[value="5"]').textContent(),'BCAN:BACHELOR OF COMPUTER APPLICATIONS (HONOURS)');
  console.log('PASS: manual website changes and idle panel refreshes execute ZERO page scripts; explicit Capture is one-shot');
  assert.deepEqual(errors,[]);await context.close();context=null;
  console.log('All browser checks passed. No real ERP or user Chrome profile was accessed.');
})().catch(async error=>{
  console.error(error);
  if(context){if(panel&&!panel.isClosed())console.error('Panel at failure:',(await panel.locator('body').innerText().catch(()=>'' )).slice(0,2000));await context.close();}
  process.exitCode=1;
});
