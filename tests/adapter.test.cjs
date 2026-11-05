const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('page adapter never exposes attendance submission, edit, reset, or cancellation controls', () => {
  const source = fs.readFileSync(require.resolve('../adapter.js'), 'utf8');
  const window = {};
  const fakeDocument = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], readyState: 'complete' };
  const context = { window, document: fakeDocument, crypto: { randomUUID: () => 'doc-1' },
    location: { pathname: '/UI/Academics/Class Attendance/JVPL_Regular_Class_Attendance.aspx', origin: 'https://example.test' }, CSS: { escape: s => s } };
  vm.runInNewContext(source, context);
  assert.deepEqual(Object.keys(window.__classFlowAdapter).sort(), ['act', 'attendanceAct', 'attendanceRead', 'read', 'start', 'stop', 'version']);
  assert.throws(() => window.__classFlowAdapter.act({ field: 'save' }), /Start/);
  assert.doesNotMatch(source, /Body_btn(?:Save|Edit|Cancel|Reset)|requestSubmit\(|\.submit\(/);
});

test('native change fires once even if the legacy jQuery plugin throws', () => {
  const events = [];
  const select = { id: 'Body_ddlGraduationType', tagName: 'SELECT', disabled: false,
    options: [{ value: '5', textContent: 'BCAN', selected: false, disabled: false }],
    getAttribute: () => null, dispatchEvent: event => events.push(event.type) };
  const document = { getElementById: id => id === select.id ? select : null,
    querySelector: () => null, querySelectorAll: () => [], readyState: 'complete', addEventListener(){}, removeEventListener(){} };
  const window = { jQuery: () => { throw new Error('Stale Chosen instance'); } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../adapter.js'), 'utf8'), { window, document,
    crypto: { randomUUID: () => 'doc-1' }, location: { pathname: '/JVPL_Regular_Class_Attendance.aspx', origin: 'https://example.test' },
    CSS: { escape: s => s }, Event: class { constructor(type) { this.type = type; } } });
  window.__classFlowAdapter.start();
  window.__classFlowAdapter.act({ field: 'program', values: ['5'] });
  assert.deepEqual(events, ['input', 'change']);
  assert.equal(select.options[0].selected, true);
});

test('a capture attaches no listeners, and an active run removes every callback on stop', () => {
  const listeners = new Set(), begin = new Set(), end = new Set();
  const manager = { add_beginRequest:fn=>begin.add(fn),add_endRequest:fn=>end.add(fn),remove_beginRequest:fn=>begin.delete(fn),remove_endRequest:fn=>end.delete(fn),get_isInAsyncPostBack:()=>false };
  const window = { Sys:{WebForms:{PageRequestManager:{getInstance:()=>manager}}} };
  const document = { getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],readyState:'complete',addEventListener:(type,fn)=>listeners.add(type),removeEventListener:type=>listeners.delete(type) };
  const context = {window,document,crypto:{randomUUID:()=> 'doc'},location:{pathname:'/JVPL_Regular_Class_Attendance.aspx',origin:'https://fixture.test'},CSS:{escape:s=>s}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../adapter.js'),'utf8'),context);
  window.__classFlowAdapter.read();
  assert.equal(begin.size+end.size+listeners.size,0);
  window.__classFlowAdapter.start();window.__classFlowAdapter.start();
  assert.equal(begin.size,1);assert.equal(end.size,1);assert.equal(listeners.size,2);
  window.__classFlowAdapter.stop();
  assert.equal(begin.size+end.size+listeners.size,0);
  assert.equal(window.__classFlowAdapter,undefined);
});
