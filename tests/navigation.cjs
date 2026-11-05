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
  await site.goto('https://jained.jgianveshana.com/');await panel.reload();
  await worker.evaluate(()=>{
    globalThis.navigationCalls=[];
    const update=chrome.tabs.update.bind(chrome.tabs);
    chrome.tabs.update=async(id,options)=>{globalThis.navigationCalls.push({type:'update',id,...options});return update(id,options);};
    // Inspect new-tab creation without allowing the new target's first request to escape the local fixture.
    chrome.tabs.create=async options=>{globalThis.navigationCalls.push({type:'create',...options});return{id:999,url:options.url};};
  });
  const calls=()=>worker.evaluate(()=>globalThis.navigationCalls);
  await panel.getByRole('button',{name:'Open attendance',exact:true}).click();
  await site.waitForURL(url);assert.deepEqual(await calls(),[{type:'update',id:tabId,url}]);
  await site.goto('https://jained.jgianveshana.com/');await panel.reload();
  await panel.getByRole('button',{name:'Open attendance',exact:true}).click({modifiers:['Control']});
  for(let i=0;i<30;i++){if((await calls()).length===2)break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.deepEqual((await calls())[1],{type:'create',url,active:false});
  assert.equal(site.url(),'https://jained.jgianveshana.com/');
  // The disconnected header shortcut follows the same navigation convention.
  await panel.getByRole('button',{name:'Open page',exact:true}).click();await site.waitForURL(url);
  assert.deepEqual((await calls())[2],{type:'update',id:tabId,url});
  console.log('PASS: normal click navigates the current tab; Ctrl-click creates a background tab and leaves current tab unchanged; header shortcut also works');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
