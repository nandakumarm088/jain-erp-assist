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
  assert.equal(await panel.locator('.cf-category').count(),0,'Legacy presets retain flat layout');
  await panel.getByRole('button',{name:'Edit Cyber Security Lab',exact:true}).click();
  await panel.locator('#cf-category').fill('Semester 5');await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  const group=name=>panel.locator(`[data-category-key="category:${name.toLowerCase()}"]`);
  await group('Semester 5').waitFor();
  const original=await saved();assert.equal(original.category,'Semester 5');
  for(const [id,name,category] of [['5b','Sem 5 B','Semester 5'],['5c','Sem 5 C','Semester 5'],['3a','Sem 3 A','Semester 3'],['3b','Sem 3 B','Semester 3'],['4a','Sem 4 A','Semester 4'],['4b','Sem 4 B','Semester 4'],['4c','Sem 4 C','Semester 4'],['free','Unassigned','']]){
    await panel.evaluate(preset=>chrome.runtime.sendMessage({type:'SAVE_PRESET',preset}),{...original,id,name,category});
  }
  await panel.getByRole('button',{name:'Unassigned',exact:true}).waitFor();
  assert.equal(await group('Semester 5').locator('.cf-preset').count(),3);
  assert.equal(await group('Semester 3').locator('.cf-preset').count(),2);
  assert.equal(await group('Semester 4').locator('.cf-preset').count(),3);
  const uncategorized=panel.locator('[data-category-key="uncategorized"]');assert.equal(await uncategorized.locator('.cf-preset').count(),1);
  await group('Semester 5').locator('.cf-category-toggle').click();
  await panel.waitForFunction(()=>document.querySelector('[data-category-key="category:semester 5"] button').getAttribute('aria-expanded')==='false');
  assert.equal(await panel.getByRole('button',{name:'Cyber Security Lab',exact:true}).isVisible(),false);
  await panel.reload();await group('Semester 5').waitFor();
  assert.equal(await group('Semester 5').locator('.cf-category-toggle').getAttribute('aria-expanded'),'false');
  await panel.getByRole('textbox',{name:'Find a saved class',exact:true}).fill('semester 5');
  assert.equal(await panel.getByRole('button',{name:'Cyber Security Lab',exact:true}).isVisible(),true);
  assert.equal(await group('Semester 3').count(),0);
  await panel.getByRole('textbox',{name:'Find a saved class',exact:true}).fill('');
  assert.equal(await group('Semester 5').locator('.cf-category-toggle').getAttribute('aria-expanded'),'false');
  await group('Semester 5').locator('.cf-category-toggle').click();
  await panel.getByRole('button',{name:'Cyber Security Lab',exact:true}).waitFor();
  // Keyboard and drag ordering stay within a category.
  await panel.getByRole('button',{name:'Cyber Security Lab',exact:true}).press('Alt+ArrowDown');
  await panel.waitForFunction(()=>document.querySelector('[data-category-key="category:semester 5"] .cf-preset').dataset.presetId==='5b');
  await group('Semester 5').locator('[data-preset-id="5c"]').dragTo(group('Semester 5').locator('.cf-preset').first(),{targetPosition:{x:15,y:2}});
  await panel.waitForFunction(()=>document.querySelector('[data-category-key="category:semester 5"] .cf-preset').dataset.presetId==='5c');
  const ids=()=>worker.evaluate(async()=>(await chrome.storage.local.get('classflow.presets'))['classflow.presets'].map(p=>p.id));
  const before=await ids();await group('Semester 5').locator('[data-preset-id="5c"]').dragTo(group('Semester 3').locator('.cf-preset').first(),{targetPosition:{x:15,y:2}});assert.deepEqual(await ids(),before);
  await panel.getByRole('button',{name:'Edit Sem 5 B',exact:true}).click();
  assert.ok(await panel.locator('#cf-categories option[value="Semester 4"]').count());
  await panel.locator('#cf-category').fill('Semester 4');await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  await group('Semester 4').getByRole('button',{name:'Sem 5 B',exact:true}).waitFor();assert.equal(await group('Semester 4').locator('.cf-preset').count(),4);
  await panel.getByRole('button',{name:'Edit Sem 5 B',exact:true}).click();await panel.locator('#cf-category').fill('');await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  await uncategorized.getByRole('button',{name:'Sem 5 B',exact:true}).waitFor();
  const exported=await panel.evaluate(()=>chrome.runtime.sendMessage({type:'EXPORT_PRESETS'}));
  assert.equal(exported.backup.presets.filter(p=>p.category==='Semester 5').length,2);
  const imported=await panel.evaluate(text=>chrome.runtime.sendMessage({type:'IMPORT_PRESETS',text}),JSON.stringify(exported.backup));assert.equal(imported.added,0);assert.equal(imported.skipped,9);
  // Category metadata must not affect applying the existing class filters.
  await group('Semester 5').getByRole('button',{name:'Cyber Security Lab',exact:true}).click();
  for(let i=0;i<80;i++){
    const job=await worker.evaluate(async id=>(await chrome.storage.session.get('classflow.job.'+id))['classflow.job.'+id],tabId);
    if(job?.status==='error')throw new Error(job.message);
    if(job?.status==='done')break;
    await new Promise(resolve=>setTimeout(resolve,100));if(i===79)throw new Error('Categorized preset did not complete');
  }
  for(const width of [360,240,200]){
    await panel.setViewportSize({width,height:800});
    assert.equal(await panel.evaluate(()=>[...document.querySelectorAll('button,input,select')].every(el=>{const r=el.getBoundingClientRect();return !r.width||r.right<=innerWidth;})),true);
  }
  await panel.setViewportSize({width:360,height:900});await panel.evaluate(()=>document.querySelector('.cf-body').scrollTop=0);
  await panel.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const footer=await panel.locator('.cf-capture-zone').boundingBox();assert.ok(footer.y>=0&&footer.y+footer.height<=900,JSON.stringify(footer));
  await panel.screenshot({path:path.join(root,'artifacts','categories-v1.3.png')});
  console.log('PASS: custom categories, legacy flat list, counts, remembered collapse, category search, within-group reorder, moving/clearing category, backup deduplication, preset application, and narrow layout');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
