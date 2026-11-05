const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

function example() {
  const fields = Object.fromEntries(Core.FIELDS.map(field => [field.key, [{ value: field.key + '-1', label: field.label + ' one' }]]));
  const preset = { name: 'Cyber Security Lab', fields };
  const snapshot = { attendancePage: true, busy: false, dateMode: 'current', classType: 'lab', radios: { current: true, previous: true, theory: true, lab: true },
    origin: 'https://example.test', account: 'lecturer-1', date: '05/11/2026',
    fields: Object.fromEntries(Core.FIELDS.map(field => [field.key, { options: fields[field.key], selected: fields[field.key], disabled: false }])) };
  return { preset, snapshot };
}
test('selects section before session, with the correct live value', () => {
  const { preset, snapshot } = example();
  snapshot.fields.section.selected = [];
  snapshot.fields.session.selected = [];
  const step = Core.plan(preset, snapshot);
  assert.equal(step.field, 'section');
  assert.equal(step.type, 'act');
  assert.deepEqual(step.values, ['section-1']);
});
test('does not trust saved or cached options if they disappeared from the live page', () => {
  const { preset, snapshot } = example();
  snapshot.fields.batch.options = [{ value: 'other', label: 'Different batch' }];
  assert.equal(Core.plan(preset, snapshot).type, 'error');
  assert.equal(Core.plan(preset, snapshot).field, 'batch');
});
test('replays an upstream field reset by a postback before advancing', () => {
  const { preset, snapshot } = example();
  snapshot.fields.program.selected = [];
  snapshot.fields.session.selected = [];
  assert.equal(Core.plan(preset, snapshot).field, 'program');
});
test('a reused option ID with a different label is rejected', () => {
  assert.match(Core.resolveChoices([{ value: '1', label: 'BCA' }], [{ value: '1', label: 'MBA' }]).error, /different label/);
});
test('an ID change can resolve by one exact normalized label, never fuzzy text', () => {
  assert.deepEqual(Core.resolveChoices([{ value: 'old', label: ' Cyber  Security ' }], [{ value: 'new', label: 'CYBER SECURITY' }]), { values: ['new'] });
  assert.ok(Core.resolveChoices([{ value: 'old', label: 'Cyber Security' }], [{ value: 'a', label: 'Cyber Security' }, { value: 'b', label: 'Cyber Security' }]).error);
  assert.ok(Core.resolveChoices([{ value: 'old', label: 'Cyber Security' }], [{ value: 'new', label: 'Cyber Security Lab' }]).error);
});
test('all chosen sections must match, including removing extra sections', () => {
  const { preset, snapshot } = example();
  snapshot.fields.section.options = [...snapshot.fields.section.options, { value: 'section-2', label: 'Another section' }];
  snapshot.fields.section.selected = snapshot.fields.section.options;
  assert.equal(Core.plan(preset, snapshot).field, 'section');
  assert.deepEqual(Core.plan(preset, snapshot).values, ['section-1']);
});
test('current date stays relative while previous date requires a valid calendar date', () => {
  const { preset, snapshot } = example();
  assert.equal(Core.plan(preset, snapshot).type, 'done');
  const settings = { dateMode:'previous', classType:'lab', previousDate:'2026-02-30', attendanceType:null };
  assert.match(Core.validateSettings(settings), /valid previous date/);
  assert.equal(Core.validatePreset(preset), '');
  assert.equal(Core.validISODate('2028-02-29'), true);
  assert.equal(Core.validISODate('2026-02-29'), false);
  assert.equal(Core.toSiteDate('2026-11-04'), '04/11/2026');
});
test('does not act while the website is busy or the next dropdown is empty', () => {
  const { preset, snapshot } = example();
  snapshot.busy = true;
  assert.equal(Core.plan(preset, snapshot).type, 'wait');
  snapshot.busy = false; snapshot.fields.semester.options = [];
  assert.equal(Core.plan(preset, snapshot).field, 'semester');
  assert.equal(Core.plan(preset, snapshot).type, 'wait');
});
test('cache keys distinguish every parent, mode, date policy, and lecturer', () => {
  const { snapshot } = example();
  const original = Core.cacheKey(snapshot, 'session');
  for (const parent of Core.FIELDS.slice(0, -1)) {
    const other = structuredClone(snapshot);
    other.fields[parent.key].selected[0].value += '-other';
    assert.notEqual(Core.cacheKey(other, 'session'), original);
  }
  for (const [key, value] of [['account', 'another'], ['classType', 'theory'], ['dateMode', 'previous']]) {
    assert.notEqual(Core.cacheKey({ ...snapshot, [key]: value }, 'session'), original);
  }
  assert.equal(Core.cacheKey({ ...snapshot, date: '06/11/2026' }, 'session'), original);
});
test('incomplete presets cannot be saved or started', () => {
  const { preset } = example();
  preset.fields.course = [];
  assert.match(Core.validatePreset(preset), /course/);
});

test('session is optional and omitted sessions are neither inspected nor selected', () => {
  const { preset, snapshot } = example();
  preset.fields.session = [];
  assert.equal(Core.validatePreset(preset),'');
  delete snapshot.fields.session;
  assert.equal(Core.plan(preset,snapshot).type,'done');
  delete preset.fields.session;
  assert.equal(Core.validatePreset(preset),'');
});
module.exports = { example };

test('preset migration keeps only seven saved dropdowns, never runtime modes or attendance type', () => {
  const { preset } = example();
  const clean = Core.cleanPreset({ ...preset, dateMode:'previous',classType:'lab',previousDate:'2026-11-04',
    fields:{...preset.fields,attendanceType:[{value:'regular',label:'Regular'}]} });
  assert.equal(clean.dateMode,undefined);
  assert.equal(clean.classType,undefined);
  assert.equal(clean.previousDate,undefined);
  assert.equal(clean.fields.attendanceType,undefined);
  assert.equal(Object.keys(clean.fields).length,7);
  assert.equal(Core.validatePreset(clean),'');
});

test('the same saved class uses the runtime settings selected for each application', () => {
  const { preset, snapshot } = example();
  const unchanged = structuredClone(preset);
  assert.equal(Core.plan(preset,snapshot,{dateMode:'current',classType:'lab',attendanceType:null}).type,'done');
  assert.equal(Core.plan(preset,snapshot,{dateMode:'previous',classType:'lab',previousDate:'2026-11-04',attendanceType:null}).field,'dateMode');
  assert.equal(Core.plan(preset,snapshot,{dateMode:'current',classType:'theory',attendanceType:null}).field,'classType');
  assert.deepEqual(preset,unchanged);
});

test('attendance type is never captured or enforced, including legacy settings', () => {
  const {preset,snapshot}=example();
  snapshot.fields.attendanceType={selected:[{value:'manual',label:'User choice'}],options:[]};
  const settings={dateMode:snapshot.dateMode,classType:snapshot.classType,attendanceType:{value:'old',label:'Old saved value'}};
  assert.equal(Core.runtimeFromSnapshot(snapshot).attendanceType,undefined);
  assert.equal(Core.settingsForPreset(preset,settings).attendanceType,undefined);
  assert.equal(Core.plan(preset,snapshot,settings).type,'done');
  assert.equal(Core.validateSettings({...settings,attendanceType:{invalid:true}}),'');
});

test('the preset editor can find remembered options without reading the page', () => {
  const {snapshot,preset}=example();
  const attendanceType={value:'regular',label:'Regular class attendance'};
  snapshot.fields.attendanceType={selected:[attendanceType]};
  const remembered={origin:snapshot.origin,account:snapshot.account,dateMode:snapshot.dateMode,classType:snapshot.classType,date:snapshot.date,attendanceType};
  const settings={dateMode:'current',classType:'lab',attendanceType:null};
  assert.equal(Core.cacheKey(remembered,'section',preset,settings),Core.cacheKey(snapshot,'section'));
});

test('optional preset type overrides only Theory/Lab and preserves other run settings', () => {
  const {preset,snapshot}=example();
  const settings={dateMode:'previous',previousDate:'2026-11-03',classType:'theory',attendanceType:{value:'extra',label:'Extra class'}};
  const unchanged=structuredClone(settings);
  preset.classTypeOverride='lab';
  assert.deepEqual(Core.settingsForPreset(preset,settings),{dateMode:settings.dateMode,previousDate:settings.previousDate,classType:'lab'});
  assert.deepEqual(settings,unchanged);
  assert.equal(Core.cleanPreset(preset).classTypeOverride,'lab');
  assert.equal(Core.validatePreset(preset),'');
  const current={dateMode:'current',classType:'theory',attendanceType:null};
  assert.equal(Core.plan(preset,snapshot,current).type,'done');
  preset.classTypeOverride='theory';
  assert.equal(Core.plan(preset,snapshot,{...current,classType:'lab'}).value,'theory');
  preset.classTypeOverride=null;
  assert.equal(Core.plan(preset,snapshot,current).value,'theory');
  preset.classTypeOverride='unknown';assert.match(Core.validatePreset(preset),/Filters only/);
});

test('website dropdown messages are shown verbatim instead of a missing preset option', () => {
  const {preset,snapshot}=example();
  snapshot.fields.course={options:[],selected:[],siteMessage:'There is No Subjects For You'};
  const result=Core.plan(preset,snapshot);
  assert.equal(result.type,'error');
  assert.equal(result.message,'Course: There is No Subjects For You');
  assert.equal(result.websiteMessage,true);
  delete snapshot.fields.course.siteMessage;
  assert.equal(Core.plan(preset,snapshot).type,'wait');
});

test('preset backups round-trip filters and overrides without dates, account, or attendance',()=>{
 const {preset}=example();preset.scope={origin:'https://erp.test',account:'private-lecturer'};
 preset.classTypeOverride='lab';preset.date='02/10/2026';preset.students=[{usn:'PRIVATE'}];
 const backup=Core.createPresetBackup([preset]);
 assert.equal(backup.format,'jain-erp-assist-presets');
 assert.equal(JSON.stringify(backup).includes('private-lecturer'),false);
 assert.equal(JSON.stringify(backup).includes('PRIVATE'),false);
 assert.equal(backup.presets[0].date,undefined);
 const [restored]=Core.parsePresetBackup(JSON.stringify(backup));
 assert.deepEqual(restored.fields,preset.fields);assert.equal(restored.classTypeOverride,'lab');
 assert.equal(Core.presetFingerprint(restored),Core.presetFingerprint(preset));
});
test('preset imports reject malformed or invalid files before merging',()=>{
 assert.throws(()=>Core.parsePresetBackup('not JSON'),/valid JSON/);
 assert.throws(()=>Core.parsePresetBackup('{"presets":[]}'),/supported/);
 const {preset}=example();const backup=Core.createPresetBackup([preset]);backup.presets.push({name:'Broken',fields:{}});
 assert.throws(()=>Core.parsePresetBackup(JSON.stringify(backup)),/Preset 2/);
 backup.presets=[{name:3,fields:{}}];assert.throws(()=>Core.parsePresetBackup(JSON.stringify(backup)),/valid name/);
 assert.throws(()=>Core.parsePresetBackup('x'.repeat(1024*1024+1)),/1 MB/);
});

test('optional categories migrate, validate, and round-trip through backups',()=>{
 const {preset,snapshot}=example();
 assert.equal(Core.cleanPreset(preset).category,'');
 preset.category='  Semester   5  ';
 assert.equal(Core.cleanPreset(preset).category,'Semester 5');
 assert.equal(Core.validatePreset(preset),'');assert.equal(Core.plan(preset,snapshot).type,'done');
 const backup=Core.createPresetBackup([preset]);assert.equal(backup.presets[0].category,'Semester 5');
 assert.equal(Core.parsePresetBackup(JSON.stringify(backup))[0].category,'Semester 5');
 delete backup.presets[0].category;assert.equal(Core.parsePresetBackup(JSON.stringify(backup))[0].category,'');
 assert.notEqual(Core.presetFingerprint({...preset,category:'Semester 3'}),Core.presetFingerprint({...preset,category:'Semester 5'}));
 preset.category='x'.repeat(51);assert.match(Core.validatePreset(preset),/category name/);
 preset.category={};assert.match(Core.validatePreset(preset),/category name/);
});
