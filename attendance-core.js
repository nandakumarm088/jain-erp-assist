/* Attendance copying rules, independent of DOM order and checkbox IDs. */
(function(root) {
  "use strict";
  const id = value => String(value || "").trim().toUpperCase();
  const regularKeys = ["program", "batch", "semester", "specialization", "course", "section"];
  const remedialKeys = ["attendanceType", "specialization", "course", "section"];
  const pageTypeFor = snapshot => ["regular", "remedial"].includes(snapshot?.pageType) ? snapshot.pageType : "table";
  const keysFor = snapshot => pageTypeFor(snapshot) === "remedial" ? remedialKeys : pageTypeFor(snapshot) === "regular" ? regularKeys : [];
  const sessionKeyFor = snapshot => pageTypeFor(snapshot) === "remedial" ? "period" : pageTypeFor(snapshot) === "regular" ? "session" : null;
  const labelFor = key => key === "period" ? "Period No" : key === "attendanceType" ? "Attendance Type" : key;
  function context(snapshot) {
    if (!snapshot?.attendancePage && !snapshot?.tablePage || snapshot.busy) throw new Error("Wait for the student table to finish loading.");
    const pageType = pageTypeFor(snapshot);
    if (pageType !== "table" && (!snapshot.account || snapshot.account === "current-lecturer")) throw new Error("Could not identify the logged-in lecturer. Nothing was changed.");
    if (pageType !== "table" && !/^\d{2}\/\d{2}\/\d{4}$/.test(snapshot.date)) throw new Error("The class date is unavailable.");
    if (pageType === "regular" && !["lab","theory"].includes(snapshot.classType)) throw new Error("The Theory/Lab selection is unavailable.");
    const fields = {};
    const sessionKey = sessionKeyFor({ pageType });
    for (const key of [...keysFor({ pageType }), ...(sessionKey ? [sessionKey] : [])]) {
      const selected = snapshot.fields?.[key]?.selected;
      if (!selected?.length) throw new Error(`Select ${labelFor(key)} on the website first.`);
      fields[key] = selected.map(option => String(option.value)).sort();
    }
    return { pageType, pagePath: snapshot.pagePath || "", origin:snapshot.origin, account:id(snapshot.account), date:snapshot.date || "", classType:pageType === "regular" ? snapshot.classType : "", fields };
  }
  function roster(snapshot) {
    if (snapshot.rosterError) throw new Error(snapshot.rosterError);
    if (!snapshot.students?.length) throw new Error("Select a session or period and load the student list first.");
    const usns = new Set(), registrations = new Set();
    return snapshot.students.map(student => {
      const usn=id(student.usn), registration=id(student.registration);
      if (!usn || !registration || usns.has(usn) || registrations.has(registration)) throw new Error("Missing or duplicate student USN/registration number. Nothing was changed.");
      usns.add(usn); registrations.add(registration);
      if (typeof student.present !== "boolean") throw new Error("A student's attendance could not be read.");
      return { usn, registration, present:student.present, disabled:Boolean(student.disabled) };
    });
  }
  function capture(snapshot) {
    const scope=context(snapshot), students=roster(snapshot);
    if (students.some(student=>student.disabled)) throw new Error("The student list is not editable. Open the session's editable attendance first.");
    const session = snapshot.fields.session || snapshot.fields.period;
    return { schemaVersion:1, scope, students:students.map(({usn,registration,present})=>({usn,registration,present})),
      sessionLabel:session?.selected?.map(option=>option.label).join(", ") || "Student table",
      sectionLabel:snapshot.fields.section?.selected?.map(option=>option.label).join(", ") || "", copiedAt:Date.now() };
  }
  function parseStudentUSNs(text, snapshot) {
    if (typeof text !== "string" || !text.trim()) throw new Error("Paste at least one Student USN.");
    const tokens = text.match(/[A-Za-z0-9]+/g) || [];
    if (!tokens.length) throw new Error("No usable Student USNs were found in the pasted text.");
    const live = roster(snapshot), byUSN = new Map(live.map(student => [student.usn, student]));
    const seen = new Set(), usns = [], unknown = [], duplicates = [];
    for (const token of tokens) {
      const usn = id(token);
      if (seen.has(usn)) { duplicates.push(usn); continue; }
      seen.add(usn);
      if (!byUSN.has(usn)) unknown.push(usn); else usns.push(usn);
    }
    if (unknown.length) throw new Error(`These pasted Student USNs were not found in the table: ${unknown.join(", ")}`);
    return { usns, duplicates };
  }
  function createStudentListCopy(usns, snapshot, present) {
    const scope = context(snapshot), students = roster(snapshot), wanted = new Set(usns.map(id));
    const missing = usns.filter(usn => !students.some(student => student.usn === id(usn)));
    if (missing.length) throw new Error(`These Student USNs are no longer in the table: ${missing.join(", ")}`);
    return { schemaVersion:1, scope, students:students.map(student => ({ usn:student.usn, registration:student.registration, present:wanted.has(student.usn) ? Boolean(present) : student.present })),
      sessionLabel:(snapshot.fields.session || snapshot.fields.period)?.selected?.map(option=>option.label).join(", ") || "Student table",
      sectionLabel:snapshot.fields.section?.selected?.map(option=>option.label).join(", ") || "", copiedAt:Date.now() };
  }
  function planStudentList(usns, snapshot, present) {
    try {
      if (!Array.isArray(usns) || !usns.length) throw new Error("Paste at least one Student USN.");
      const students = roster(snapshot), byUSN = new Map(students.map(student => [student.usn, student]));
      const missing = usns.filter(usn => !byUSN.has(id(usn)));
      if (missing.length) throw new Error(`These Student USNs are no longer in the table: ${missing.join(", ")}`);
      const row = usns.map(id).map(usn => byUSN.get(usn)).find(student => student.present !== present);
      if (!row) return { type:"done", total:usns.length, present };
      if (row.disabled) throw new Error(`Student ${row.usn} cannot be changed because its checkbox is disabled.`);
      return { type:"act", usn:row.usn, registration:row.registration, present, remaining:usns.filter(usn => byUSN.get(id(usn)).present !== present).length, total:usns.length };
    } catch (error) { return { type:"error", message:error.message }; }
  }
  function plan(copy, snapshot, target = null) {
    try {
      if (!copy?.students?.length) throw new Error("Copy attendance before applying it.");
      const scope=context(snapshot), students=roster(snapshot);
      for (const key of ["pageType","pagePath","origin","account","classType"]) {
        if (scope[key] !== copy.scope[key]) throw new Error(`Copied attendance belongs to a different ${key === "pageType" ? "attendance page" : key === "account" ? "logged-in user" : key === "classType" ? "Theory/Lab class" : key}. Nothing was changed.`);
      }
      for (const key of keysFor(scope)) if (JSON.stringify(scope.fields[key]) !== JSON.stringify(copy.scope.fields[key])) throw new Error(`The ${labelFor(key)} differs from the copied class. Nothing was changed.`);
      if (target && (["pageType","pagePath","origin","account","classType"].some(key=>scope[key]!==target[key]) || [...keysFor(scope), ...(sessionKeyFor(scope) ? [sessionKeyFor(scope)] : [])].some(key=>JSON.stringify(scope.fields[key])!==JSON.stringify(target.fields[key])))) throw new Error("The class or target session changed during copying. Stopped; review the page.");
      if (snapshot.alreadyRecorded) throw new Error("Attendance is already recorded for this session. Nothing was changed.");
      if (students.some(student=>student.disabled)) throw new Error("The student list is not editable. Nothing was changed.");
      const copied=roster({students:copy.students});
      const byUSN=new Map(copied.map(student=>[student.usn,student]));
      const missing=copied.filter(student=>!students.some(live=>live.usn===student.usn));
      const added=students.filter(student=>!byUSN.has(student.usn));
      if (missing.length || added.length) throw new Error(`Student lists differ: ${missing.length} missing, ${added.length} new. No attendance was applied; copy the correct class again.`);
      if (students.some(student=>student.registration!==byUSN.get(student.usn).registration)) throw new Error("A student's registration number does not match their USN. Nothing was changed.");
      const differences=students.filter(student=>student.present!==byUSN.get(student.usn).present);
      return differences.length ? { type:"act", usn:differences[0].usn, registration:differences[0].registration, present:byUSN.get(differences[0].usn).present, remaining:differences.length, total:students.length, scope }
        : { type:"done", total:students.length, scope };
    } catch(error) { return {type:"error",message:target ? error.message.replace(/Nothing was changed\./g,"Stopped; review selections already applied.").replace(/No attendance was applied;/g,"Stopped;") : error.message}; }
  }
  root.ClassFlowAttendance={context,roster,capture,plan,parseStudentUSNs,createStudentListCopy,planStudentList};
  if(typeof module!=="undefined") module.exports=root.ClassFlowAttendance;
})(globalThis);
