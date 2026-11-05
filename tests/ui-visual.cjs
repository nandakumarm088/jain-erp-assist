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
  const checkOrder=async()=>{
    const bounds=await panel.evaluate(()=>Object.fromEntries(['cf-header','cf-attendance','cf-runtime','cf-library'].map(name=>{const r=document.querySelector('.'+name).getBoundingClientRect();return [name,{top:r.top,bottom:r.bottom}];})));
    assert.ok(bounds['cf-header'].bottom<=bounds['cf-attendance'].top);
    assert.ok(bounds['cf-attendance'].bottom<=bounds['cf-runtime'].top);
    assert.ok(bounds['cf-runtime'].bottom<=bounds['cf-library'].top);
  };
  await checkOrder();
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
  await checkOrder();
  await fs.mkdir(path.join(root,'artifacts'),{recursive:true});
  await panel.screenshot({path:path.join(root,'artifacts','attendance-top.png')});
  const capture=await panel.evaluate(()=>chrome.runtime.sendMessage({type:'CAPTURE'}));
  await worker.evaluate(async snapshot=>{
    const fields=Object.fromEntries(ClassFlowCore.FIELDS.map(field=>[field.key,snapshot.fields[field.key].selected]));
    await chrome.storage.local.set({'classflow.presets':[['pt','PT','theory'],['lab1','PT LAB_B-1','lab'],['lab2','PT LAB_B-2','lab']].map(([id,name,classTypeOverride])=>({id,name,classTypeOverride,fields}))});
  },capture.snapshot);
  await panel.getByRole('button',{name:'PT LAB_B-2',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Previous Date',exact:true}).click();
  const selectedBg=await panel.locator('.cf-runtime .is-selected').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(selectedBg,'rgb(255, 255, 255)');
  const savedColors=await panel.locator('.cf-preset-apply').evaluateAll(buttons=>buttons.map(el=>getComputedStyle(el).backgroundColor));
  assert.notEqual(savedColors[0],savedColors[1]);assert.equal(savedColors.includes('rgb(255, 255, 255)'),false);

  const contrast=async selectors=>panel.evaluate(selectors=>{
    const color=text=>{const values=text.match(/[\d.]+/g).map(Number);return [...values.slice(0,3),values[3]??1];};
    const background=element=>{
      if(!element)return [255,255,255];
      const top=color(getComputedStyle(element).backgroundColor),bottom=background(element.parentElement);
      return top.slice(0,3).map((v,i)=>v*top[3]+bottom[i]*(1-top[3]));
    };
    const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    return selectors.map(selector=>{const element=document.querySelector(selector);const a=luminance(color(getComputedStyle(element).color)),b=luminance(background(element));return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
  },selectors);
  const selectors=['.cf-brand','.cf-version','.cf-attendance h2','.cf-attendance-summary','.cf-attendance-hint','.cf-copy','[data-action="apply-attendance"]','.cf-runtime .is-selected','.cf-form-field>label','.cf-preset-apply','.cf-type-badge','.cf-open-attendance','.cf-capture','.cf-credit'];
  for(const item of await contrast(selectors))assert.ok(item.ratio>=4.5,JSON.stringify(item));
  for(const selector of ['.cf-copy','[data-action="apply-attendance"]','.cf-preset-apply','.cf-open-attendance']){
    await panel.locator(selector).first().hover();
    for(const item of await contrast([selector]))assert.ok(item.ratio>=4.5,JSON.stringify(item));
  }
  await panel.getByRole('textbox',{name:'Day / Month',exact:true}).focus();
  assert.equal(await panel.locator('.cf-date-control').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  for(const width of [360,240,200]){
    await panel.setViewportSize({width,height:800});
    assert.equal(await panel.evaluate(()=>[...document.querySelectorAll('button,input,select')].every(el=>{const r=el.getBoundingClientRect();return !r.width||(r.left>=0&&r.right<=innerWidth)})),true,'Fits '+width);
  }
  await panel.setViewportSize({width:360,height:800});await panel.evaluate(()=>document.querySelector('.cf-body').scrollTop=0);
  await panel.screenshot({path:path.join(root,'artifacts','modern-glass-main.png')});
  await panel.getByRole('button',{name:'Edit PT LAB_B-1',exact:true}).click();
  await panel.locator('#cf-name').waitFor();
  const mode=panel.getByRole('group',{name:'Preset class type',exact:true});
  for(const label of ['Filters only','Theory','Lab']){
    await mode.getByRole('button',{name:label,exact:true}).click();
    for(const item of await contrast(['.cf-save-mode .is-selected']))assert.ok(item.ratio>=4.5,JSON.stringify(item));
    assert.notEqual(await panel.locator('.cf-save-mode .is-selected').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  }

  for(const item of await contrast(['.cf-editor h1','.cf-editor-intro','.cf-label-row label','.cf-source','.cf-save-mode legend','.cf-save-mode p']))assert.ok(item.ratio>=4.5,JSON.stringify(item));
  await panel.screenshot({path:path.join(root,'artifacts','modern-glass-editor.png')});
  await panel.locator('.cf-save-mode').scrollIntoViewIfNeeded();
  await panel.screenshot({path:path.join(root,'artifacts','modern-glass-save.png')});
  for(const width of [360,200]){await panel.setViewportSize({width,height:800});assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await panel.getByRole('button',{name:'Save preset',exact:true}).click();
  await panel.getByRole('button',{name:'PT LAB_B-1',exact:true}).waitFor();
  console.log('PASS: readable text contrast >=4.5:1, distinct hover colors, focus outline, narrow main/editor layouts, and preset editor Save');
  await context.close();context=null;
})().catch(async error=>{console.error(error);if(context)await context.close();process.exitCode=1;});
