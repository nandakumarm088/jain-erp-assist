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
  await panel.addInitScript(tabId=>{
    window.openingTarget=tabId;window.sentTargets=[];
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=message=>{
      if(message.type==='PANEL_OPEN')return send({...message,tabId});
      window.sentTargets.push(message.tabId);return send(message);
    };
  },tabId);
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await panel.setViewportSize({width:360,height:900});
  await panel.locator('.is-connected').waitFor();
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  await panel.getByRole('button',{name:'Lab',exact:true}).click();
  const settings=await worker.evaluate(async tabId=>(await chrome.storage.session.get('classflow.settings.'+tabId))['classflow.settings.'+tabId],tabId);
  assert.equal(settings.classType,'lab','settings still target opening tab');
  assert.equal(await panel.locator('.is-connected').count(),1,'switching tabs leaves panel connected');
  const secondWindow=await worker.evaluate(()=>chrome.windows.create({url:'about:blank',focused:true}));
  await panel.getByRole('button',{name:'Previous Date',exact:true}).click();
  const state=await worker.evaluate(async tabId=>(await chrome.storage.session.get('classflow.settings.'+tabId))['classflow.settings.'+tabId],tabId);
  assert.equal(state.dateMode,'previous','switching windows does not redirect settings');
  // Route inspection proves all post-initialization actions carry the bound ID.
  assert.equal(await panel.evaluate(()=>window.sentTargets.every(id=>id===window.openingTarget)),true);
  await site.close();
  await panel.locator('.cf-connection:not(.is-connected)').waitFor();
  assert.equal(await panel.getByRole('button',{name:'Save this class',exact:true}).isDisabled(),true);
  assert.equal(await other.evaluate(()=>window.__classFlowAdapter===undefined),true);
  console.log('PASS: panel stays bound across tab/window switches and disconnects when its tab closes');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
