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
  assert.equal(await panel.locator('.cf-type-badge').innerText(),'Lab');
  const original=await saved();
  for(const [id,name,classTypeOverride] of [['second','Algorithms','theory'],['third','Flexible class',null]]){
    await panel.evaluate(preset=>chrome.runtime.sendMessage({type:'SAVE_PRESET',preset}),{...original,id,name,classTypeOverride});
  }
  await panel.getByRole('button',{name:'Flexible class',exact:true}).waitFor();
  assert.equal(await panel.locator('[data-preset-id="third"] .cf-type-badge').count(),0);
  assert.equal(await panel.locator('[data-preset-id="second"] .cf-type-badge').innerText(),'Theory');
  const history=await site.evaluate(()=>sessionStorage.getItem('history'));
  await panel.locator('[data-preset-id="third"]').dragTo(panel.locator('.cf-preset').first(),{targetPosition:{x:20,y:2}});
  await panel.waitForFunction(()=>document.querySelector('.cf-preset').dataset.presetId==='third');
  assert.equal(await site.evaluate(()=>sessionStorage.getItem('history')),history,'Dragging never applies a class');
  await panel.reload();
  await panel.waitForFunction(()=>document.querySelector('.cf-preset')?.dataset.presetId==='third');
  const algorithms=panel.getByRole('button',{name:'Algorithms',exact:true});
  await algorithms.focus();await algorithms.press('Alt+ArrowUp');
  await panel.waitForFunction(()=>document.querySelectorAll('.cf-preset')[1].dataset.presetId==='second');
  await panel.getByRole('button',{name:'Previous Date',exact:true}).click();
  assert.equal(await panel.evaluate(()=>document.activeElement.id),'cf-date-daymonth');
  // The field-specific message directs users to edit the changed class.
  const message=await worker.evaluate(preset=>{
    const fields=Object.fromEntries(ClassFlowCore.FIELDS.map(field=>[field.key,{options:preset.fields[field.key],selected:preset.fields[field.key]}]));
    fields.section={options:[{value:'replacement',label:'Replacement'}],selected:[]};
    return ClassFlowCore.plan(preset,{attendancePage:true,busy:false,dateMode:'current',classType:'lab',fields},{dateMode:'current',classType:'lab'}).message;
  },original);
  assert.match(message,/Saved section:.*no longer available.*Edit this class/s);
  for(const width of [360,240,200]){
    await panel.setViewportSize({width,height:700});
    assert.equal(await panel.evaluate(()=>[...document.querySelectorAll('.cf-preset-apply,.cf-preset-edit')].every(el=>el.getBoundingClientRect().right<=innerWidth)),true);
  }
  await panel.setViewportSize({width:360,height:700});
  await panel.screenshot({path:path.join(root,'artifacts','compact-flow-improvements.png')});
  console.log('PASS: compact type badges, drag order persistence, no apply during drag, keyboard reorder, date autofocus, field-specific errors, and narrow layouts');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
