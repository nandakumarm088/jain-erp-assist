/* Attendance copying rules, independent of DOM order and checkbox IDs. */
(function(root) {
  "use strict";
  const id = value => String(value || "").trim().toUpperCase();
  const keys = ["program", "batch", "semester", "specialization", "course", "section"];
  function context(snapshot) {
    if (!snapshot?.attendancePage || snapshot.busy) throw new Error("Wait for the attendance page to finish loading.");
    if (!snapshot.account || snapshot.account === "current-lecturer") throw new Error("Could not identify the logged-in lecturer. Nothing was changed.");
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(snapshot.date) || !["lab","theory"].includes(snapshot.classType)) throw new Error("The class date or Theory/Lab selection is unavailable.");
    const fields = {};
    for (const key of [...keys, "session"]) {
      const selected = snapshot.fields?.[key]?.selected;
      if (!selected?.length) throw new Error(`Select ${key === "session" ? "Session No" : key} on the website first.`);
      fields[key] = selected.map(option => String(option.value)).sort();
    }
    return { origin:snapshot.origin, account:id(snapshot.account), date:snapshot.date, classType:snapshot.classType, fields };
  }
  function roster(snapshot) {
    if (snapshot.rosterError) throw new Error(snapshot.rosterError);
    if (!snapshot.students?.length) throw new Error("Select a session and load the student list first.");
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
    return { schemaVersion:1, scope, students:students.map(({usn,registration,present})=>({usn,registration,present})),
      sessionLabel:snapshot.fields.session.selected.map(option=>option.label).join(", "), copiedAt:Date.now() };
  }
  function plan(copy, snapshot, target = null) {
    try {
      if (!copy?.students?.length) throw new Error("Copy attendance from the first session before applying it.");
      const scope=context(snapshot), students=roster(snapshot);
      for (const key of ["origin","account","date","classType"]) {
        if (scope[key] !== copy.scope[key]) throw new Error(`Copied attendance belongs to a different ${key === "account" ? "logged-in user" : key === "classType" ? "Theory/Lab class" : key}. Nothing was changed.`);
      }
      for (const key of keys) if (JSON.stringify(scope.fields[key]) !== JSON.stringify(copy.scope.fields[key])) throw new Error(`The ${key} differs from the copied class. Nothing was changed.`);
      if (JSON.stringify(scope.fields.session) === JSON.stringify(copy.scope.fields.session)) throw new Error("Select a different session on the website, then apply the copied attendance.");
      if (target && (["origin","account","date","classType"].some(key=>scope[key]!==target[key]) || [...keys,"session"].some(key=>JSON.stringify(scope.fields[key])!==JSON.stringify(target.fields[key])))) throw new Error("The class or target session changed during copying. Stopped; review the page.");
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
  root.ClassFlowAttendance={context,roster,capture,plan};
  if(typeof module!=="undefined") module.exports=root.ClassFlowAttendance;
})(globalThis);
