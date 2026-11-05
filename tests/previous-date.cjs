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
  await panel.getByRole('button',{name:'Save this class',exact:true}).click();await panel.locator('#cf-form').waitFor();
  assert.equal(await panel.locator('#cf-run-attendance').count(),0);
  const captured=await panel.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}));
  assert.equal(captured.snapshot.fields.attendanceType,undefined);
  assert.equal(captured.settings.attendanceType,undefined);
  assert.equal(JSON.stringify(await worker.evaluate(()=>chrome.storage.local.get(null))).includes('"attendanceType"'),false);
  const mode=()=>panel.getByRole('group',{name:'Preset class type',exact:true});
  assert.equal(await mode().getByRole('button',{name:'Filters only',exact:true}).getAttribute('aria-pressed'),'true');
  await panel.locator('#cf-name').fill('Cyber Security Lab');
  await mode().getByRole('button',{name:'Lab',exact:true}).click();
  assert.match(await panel.locator('#cf-save-summary').innerText(),/Saving as Lab.*overrides/s);
  await panel.locator('.cf-save-mode').scrollIntoViewIfNeeded();
  await fs.mkdir(path.join(root,'artifacts'),{recursive:true});await panel.screenshot({path:path.join(root,'artifacts','porcelain-save-options.png')});
  await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  await panel.getByRole('button',{name:'Cyber Security Lab',exact:true}).waitFor();
  const saved=()=>worker.evaluate(async()=>(await chrome.storage.local.get('classflow.presets'))['classflow.presets'][0]);
  assert.equal((await saved()).classTypeOverride,'lab');
  const order=await panel.evaluate(()=>({settings:document.querySelector('.cf-runtime').getBoundingClientRect().bottom,classes:document.querySelector('.cf-library').getBoundingClientRect().top}));
  assert.ok(order.settings<=order.classes,'Attendance settings precede saved classes');
  await panel.screenshot({path:path.join(root,'artifacts','porcelain-panel.png')});
  await panel.getByRole('button',{name:'Previous Date',exact:true}).click();
  const localYear=await worker.evaluate(()=>new Date().getFullYear());
  assert.equal(await panel.getByRole('textbox',{name:'Year',exact:true}).inputValue(),String(localYear));
  const enter=async(name,value)=>{
    const input=panel.getByRole('textbox',{name,exact:true});await input.fill('');await input.pressSequentially(value);
  };
  await enter('Day / Month','2902');
  assert.equal(await panel.getByRole('textbox',{name:'Day / Month',exact:true}).inputValue(),'29/02');
  await enter('Year','2023');
  assert.equal(await panel.getByRole('textbox',{name:'Year',exact:true}).inputValue(),'2023');
  await panel.getByRole('button',{name:'Cyber Security Lab',exact:true}).click();
  await panel.getByText('Choose a valid previous date before applying a class.',{exact:true}).waitFor();
  await enter('Year','2024');
  await panel.getByRole('textbox',{name:'Year',exact:true}).press('Tab');
  for(let i=0;i<50;i++){
    if((await worker.evaluate(()=>chrome.storage.local.get('classflow.previousYear')))['classflow.previousYear']===2024)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  await panel.reload();
  await panel.getByRole('button',{name:'Previous Date',exact:true}).click();
  assert.equal(await panel.getByRole('textbox',{name:'Year',exact:true}).inputValue(),'2024');
  assert.equal(await panel.getByRole('textbox',{name:'Day / Month',exact:true}).inputValue(),'29/02');
  await enter('Day / Month','3104');
  assert.equal(await panel.getByRole('textbox',{name:'Day / Month',exact:true}).getAttribute('aria-invalid'),'true');
  await enter('Day / Month','2902');
  await panel.getByRole('button',{name:'Cyber Security Lab',exact:true}).click();
  let done=false;
  for(let i=0;i<250;i++){
    const job=await worker.evaluate(async id=>(await chrome.storage.session.get(`classflow.job.${id}`))[`classflow.job.${id}`],tabId);
    if(job?.status==='error')throw new Error(job.message);
    if(job?.status==='done'){assert.equal(job.settings.previousDate,'2024-02-29');done=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(done,true);
  assert.equal(await site.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture')).date),'29/02/2024');
  const local=await worker.evaluate(()=>chrome.storage.local.get(null));
  assert.equal(local['classflow.previousYear'],2024);
  assert.equal(local['classflow.presets'][0].previousDate,undefined);
  await worker.evaluate(async id=>chrome.storage.session.remove(`classflow.settings.${id}`),tabId);
  await panel.reload();
  await panel.getByRole('button',{name:'Previous Date',exact:true}).click();
  assert.equal(await panel.getByRole('textbox',{name:'Year',exact:true}).inputValue(),'2024');
  for(const width of [360,240,200]){
    await panel.setViewportSize({width,height:700});
    assert.equal(await panel.evaluate(()=>[...document.querySelectorAll('.cf-date-parts input')].every(input=>input.getBoundingClientRect().right<=innerWidth)),true);
  }
  await panel.setViewportSize({width:360,height:700});
  await panel.screenshot({path:path.join(root,'artifacts','previous-date.png')});
  console.log('PASS: four-digit DD/MM typing, year replacement, remembered year, invalid dates, immediate Apply click, correct website date, and narrow layout');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
