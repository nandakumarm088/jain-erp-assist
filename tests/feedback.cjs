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
  const fixture=await fs.readFile(path.join(__dirname,'fixture.html'),'utf8');
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
  const panel=await context.newPage();
  await panel.addInitScript(tabId=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=message=>send({...message,tabId});},tabId);
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await panel.setViewportSize({width:360,height:900});
  const feedback=section=>panel.locator(`[data-feedback-for="${section}"]`);
  const below=async(section,selector)=>assert.equal(await feedback(section).evaluate((el,selector)=>el.previousElementSibling?.matches(selector),selector),true,section+' feedback directly follows its card');
  // Copy's preflight error belongs to Attendance, even before a background job starts.
  await panel.getByRole('button',{name:'Copy attendance',exact:true}).click();
  await feedback('attendance').getByRole('alert').waitFor();await below('attendance','.cf-attendance');
  await panel.getByRole('button',{name:'New preset',exact:true}).click();await panel.locator('#cf-name').fill('Test');
  await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  await feedback('editor').getByRole('alert').waitFor();await below('editor','.cf-editor');
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await worker.evaluate(()=>{globalThis.originalDispatch=dispatch;dispatch=async(message,sender)=>{if(message.type==='SET_SETTINGS')throw new Error('Settings test error');if(message.type==='CAPTURE')throw new Error('Capture test error');return globalThis.originalDispatch(message,sender);};});
  await panel.getByRole('button',{name:'Lab',exact:true}).click();
  await feedback('runtime').getByRole('alert').filter({hasText:'Settings test error'}).waitFor();await below('runtime','.cf-runtime');
  await panel.getByRole('button',{name:'Save this class',exact:true}).click();
  await feedback('capture').getByRole('alert').filter({hasText:'Capture test error'}).waitFor();
  assert.equal(await feedback('capture').evaluate(el=>el.parentElement.classList.contains('cf-capture-zone')),true);
  await worker.evaluate(()=>{dispatch=globalThis.originalDispatch;});
  await panel.getByRole('button',{name:'New preset',exact:true}).click();await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  const publish=async(kind,status,message)=>worker.evaluate(async({tabId,kind,status,message})=>{
    await chrome.storage.session.set({['classflow.job.'+tabId]:{id:kind+'-'+status,kind,status,message,preset:{id:'test',name:'Test class'},updatedAt:Date.now()}});
    await chrome.runtime.sendMessage({type:'classflow:view-changed',tabId});
  },{tabId,kind,status,message});
  await publish('attendance','done','Attendance applied.');
  await feedback('attendance').getByText('Attendance applied',{exact:true}).waitFor();await below('attendance','.cf-attendance');
  assert.equal(await feedback('library').count(),0);
  await feedback('attendance').waitFor({state:'detached',timeout:3500});
  await publish('attendance','error','Attendance test error');
  await feedback('attendance').getByText('Attendance test error',{exact:true}).waitFor();await below('attendance','.cf-attendance');
  await new Promise(resolve=>setTimeout(resolve,2100));assert.equal(await feedback('attendance').count(),1);
  await publish('filter','done','Filters applied.');
  await feedback('library').getByText('Filters applied',{exact:true}).waitFor();await below('library','.cf-library');
  await feedback('library').waitFor({state:'detached',timeout:3500});
  // Force feedback below the fold, then verify new messages reveal themselves.
  await panel.addStyleTag({content:'.cf-library { min-height: 950px; }'});
  await panel.locator('.cf-body').evaluate(el=>el.scrollTop=0);
  await publish('filter','error','Filter test error');
  await feedback('library').getByText('Filter test error',{exact:true}).waitFor();await below('library','.cf-library');
  const fullyVisible=async section=>feedback(section).evaluate(el=>{
    const bounds=el.getBoundingClientRect(),viewport=el.closest('.cf-body').getBoundingClientRect();
    return bounds.top>=viewport.top-1 && bounds.bottom<=viewport.bottom+1;
  });
  assert.equal(await fullyVisible('library'),true,'hidden error automatically scrolls into view');
  await panel.locator('.cf-body').evaluate(el=>el.scrollTop=0);
  await worker.evaluate(tabId=>chrome.runtime.sendMessage({type:'classflow:view-changed',tabId}),tabId);
  await panel.waitForTimeout(250);
  assert.equal(await panel.locator('.cf-body').evaluate(el=>el.scrollTop),0,'unchanged feedback respects manual scroll');
  await publish('filter','error','A different filter error');
  await feedback('library').getByText('A different filter error',{exact:true}).waitFor();
  assert.equal(await fullyVisible('library'),true,'changed error is revealed too');
  // Attendance feedback scrolls upward when the user is at the bottom.
  await publish('attendance','error','New attendance error');
  await feedback('attendance').getByText('New attendance error',{exact:true}).waitFor();
  assert.equal(await fullyVisible('attendance'),true,'attendance error scrolls into view above');
  // Backup validation also stays below Saved classes, rather than the page header.
  const choose=panel.waitForEvent('filechooser');await panel.getByRole('button',{name:'Import presets',exact:true}).click();
  await (await choose).setFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('bad JSON')});
  await feedback('library').getByRole('alert').filter({hasText:'not valid JSON'}).waitFor();await below('library','.cf-library');
  for(const width of [360,200]){await panel.setViewportSize({width,height:800});assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  console.log('PASS: attendance, filter, settings, editor, capture, and backup messages follow their own sections; successes expire after 2 seconds and errors persist');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
