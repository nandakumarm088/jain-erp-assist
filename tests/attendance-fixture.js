// Synthetic students, using the supplied site's table structure and postbacks.
choices.session.push(['period2','2 - 08:40 to 09:30']);
const defaultStudents=[{usn:'TEST001',registration:'REG1',present:true},{usn:'TEST002',registration:'REG2',present:true},{usn:'TEST003',registration:'REG3',present:true},{usn:'TEST004',registration:'REG4',present:true}];
let students=JSON.parse(sessionStorage.getItem('students')||'null')||defaultStudents;
const baseRender=renderFixture;
renderFixture=function(){
 baseRender();document.getElementById('notice').innerHTML=sessionStorage.getItem('recorded')?'<div class="alert">You have Already Entered attendance for this Period.</div>':'';
 document.getElementById('Body_gdvStudents')?.remove();
 if(!fixtureState.fields.session?.length)return;
 const table=document.createElement('table');table.id='Body_gdvStudents';
 table.innerHTML='<tr><th><input type="checkbox" id="Body_gdvStudents_chkAll" checked></th><th>Program</th><th>Registration No</th><th class="hidden">StudentHeaderID</th><th>Student USN</th><th>Student Name</th></tr>'+students.map((student,index)=>'<tr onclick="sessionStorage.setItem(\'row-clicked\',\'yes\')"><td><input id="Body_gdvStudents_chckselect_'+index+'" type="checkbox" '+(student.present?'checked ':'')+(student.disabled?'disabled ':'')+' onclick="setTimeout(()=>__doPostBack(\'student:'+index+'\'),0)"></td><td>BCAN</td><td>'+student.registration+'</td><td>'+index+'</td><td>'+student.usn+'</td><td>Test Student '+index+'</td></tr>').join('');
 document.getElementById('form1').appendChild(table);
};
const basePostback=__doPostBack;
__doPostBack=function(key){
 if(!key.startsWith('student:'))return basePostback(key);
 const index=Number(key.split(':')[1]);
 if(!sessionStorage.getItem('drop-writes'))students[index].present=document.getElementById('Body_gdvStudents_chckselect_'+index).checked;
 sessionStorage.setItem('students',JSON.stringify(students));
 const writes=JSON.parse(sessionStorage.getItem('attendance-writes')||'[]');writes.push(students[index].usn);sessionStorage.setItem('attendance-writes',JSON.stringify(writes));
 commit(key);
};
renderFixture();
