
const app=document.getElementById("app"), session=document.getElementById("session");
const state={user:null,test:null,questions:[],answers:{},index:0,endAt:null,timer:null};

function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmt(n){return Number(n).toFixed(2).replace(/\.00$/,"");}
function setSession(){session.innerHTML=state.user?`${esc(state.user.name)} <button class="ghost" onclick="logout()">Logout</button>`:"";}
function login(){
 app.innerHTML=`<div class="card" style="max-width:440px;margin:80px auto"><h1>MockTest V4</h1><p class="muted">Banking mock-test platform</p>
 <label>Email</label><input id="email" value="candidate@example.com">
 <label>Password</label><input id="password" type="password" value="candidate123">
 <div class="actions" style="margin-top:16px"><button onclick="doLogin()">Login</button><button class="secondary" onclick="adminDemo()">Admin Demo</button></div>
 <p id="err" class="bad"></p></div>`;
}
async function doLogin(){
 const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.value,password:password.value})});
 const x=await r.json(); if(!r.ok){err.textContent=x.error;return}
 state.user=x.user; setSession(); state.user.role==="admin"?admin():candidate();
}
function adminDemo(){email.value="admin@example.com";password.value="admin123";doLogin()}
function logout(){state.user=null;setSession();login()}
async function candidate(){
 const tests=await fetch("/api/tests").then(r=>r.json());
 app.innerHTML=`<div class="title"><div><h1>Mock Tests</h1><p class="muted">Choose a published banking mock.</p></div></div>
 <div class="grid">${tests.map(t=>`<div class="card"><span class="pill">${esc(t.exam)}</span><h2>${esc(t.title)}</h2><p>${t.questionCount} questions · ${t.duration} minutes</p><button onclick="startTest('${t.id}')">Start Test</button></div>`).join("")||'<div class="card">No published tests.</div>'}</div>`;
}
async function startTest(id){
 state.test=await fetch("/api/tests/"+id).then(r=>r.json());state.questions=state.test.questions;state.answers={};state.index=0;
 state.endAt=Date.now()+state.test.duration*60000; renderExam(); clearInterval(state.timer);state.timer=setInterval(tick,1000);
}
function tick(){const left=Math.max(0,state.endAt-Date.now());document.getElementById("timer").textContent=`${String(Math.floor(left/60000)).padStart(2,"0")}:${String(Math.floor(left/1000)%60).padStart(2,"0")}`;if(!left){clearInterval(state.timer);submitExam(true)}}
function renderExam(){
 const q=state.questions[state.index]; const answered=Object.keys(state.answers).length;
 app.innerHTML=`<div class="exam"><section class="card question">
 <div class="title"><div><span class="pill">${esc(q.section||"General")}</span><h2>Question ${state.index+1}</h2></div><div class="timer" id="timer"></div></div>
 ${q.directions?`<div class="card" style="background:#f8fafc"><b>Directions</b><p>${esc(q.directions)}</p></div>`:""}
 <p style="font-size:18px;line-height:1.6">${esc(q.text)}</p>
 <div>${Object.entries(q.options||{}).map(([k,v])=>`<label class="option"><input type="radio" name="opt" value="${k}" ${state.answers[q.id]===k?"checked":""} onchange="choose('${q.id}','${k}')"><b>${k}.</b> ${esc(v)}</label>`).join("")}</div>
 <div class="actions" style="margin-top:24px"><button class="secondary" onclick="prevQ()">Previous</button><button onclick="nextQ()">${state.index===state.questions.length-1?"Review":"Next"}</button></div>
 </section><aside><div class="card"><h3>Question Palette</h3><div class="palette">${state.questions.map((x,i)=>`<button class="${i===state.index?"active ":""}${state.answers[x.id]?"answered":""}" onclick="gotoQ(${i})">${i+1}</button>`).join("")}</div><hr><p>Answered: <b>${answered}</b> / ${state.questions.length}</p><button style="width:100%" onclick="submitExam(false)">Submit Test</button></div></aside></div>`;
 tick();
}
function choose(id,k){state.answers[id]=k;renderExam()}
function gotoQ(i){state.index=i;renderExam()}function prevQ(){if(state.index>0){state.index--;renderExam()}}function nextQ(){if(state.index<state.questions.length-1){state.index++;renderExam()}else review()}
function review(){const unanswered=state.questions.filter(q=>!state.answers[q.id]).length;app.innerHTML=`<div class="card"><h1>Review before submission</h1><p>${unanswered} question(s) are unanswered.</p><div class="actions"><button class="secondary" onclick="renderExam()">Back to Test</button><button onclick="submitExam(false)">Submit Now</button></div></div>`}
async function submitExam(auto){
 clearInterval(state.timer);
 const a=await fetch("/api/attempts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({testId:state.test.id,userId:state.user.id,answers:state.answers})}).then(r=>r.json());
 showResult(a.id,auto);
}
async function showResult(id,auto=false){
 const r=await fetch("/api/results/"+id).then(x=>x.json()), t=r.test;
 app.innerHTML=`<div class="title"><div><h1>${auto?"Time Up — ":""}Result</h1><p class="muted">${esc(t.title)}</p></div><button onclick="candidate()">Back to Tests</button></div>
 <div class="grid"><div class="card"><span class="muted">Your Score</span><div class="score">${fmt(r.attempt.score)}</div></div><div class="card"><span class="muted">Rank</span><div class="score">${r.rank}<small style="font-size:18px"> / ${r.totalCandidates}</small></div></div><div class="card"><span class="muted">Percentile</span><div class="score">${r.percentile}%</div></div></div>
 <div class="grid"><div class="stat"><span>Correct</span><b class="good">${r.attempt.correct}</b></div><div class="stat"><span>Wrong</span><b class="bad">${r.attempt.wrong}</b></div><div class="stat"><span>Unanswered</span><b>${r.attempt.unanswered}</b></div></div>
 <div class="card"><h2>Topper Comparison</h2><table><tr><th></th><th>You</th><th>Topper</th></tr><tr><td>Score</td><td>${fmt(r.attempt.score)}</td><td>${fmt(r.topper.score)}</td></tr><tr><td>Correct</td><td>${r.attempt.correct}</td><td>${r.topper.correct}</td></tr><tr><td>Wrong</td><td>${r.attempt.wrong}</td><td>${r.topper.wrong}</td></tr></table></div>
 <div class="card"><h2>Section Analysis</h2><table><tr><th>Section</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Accuracy</th></tr>${Object.entries(r.sectionStats).map(([k,s])=>`<tr><td>${esc(k)}</td><td>${fmt(s.score)}</td><td class="good">${s.correct}</td><td class="bad">${s.wrong}</td><td>${s.accuracy}%</td></tr>`).join("")}</table></div>
 <div class="card"><h2>Question-wise Review</h2>${r.test.questions.map((q,i)=>{const d=r.attempt.details.find(x=>x.questionId===q.id);return `<div class="qpreview"><b>Q${i+1}. ${esc(q.text)}</b><p>Your answer: <span class="${d.selected===d.answer?"good":"bad"}">${d.selected||"Not answered"}</span> · Correct: <b>${d.answer||"Not available"}</b></p><p class="muted">${esc(q.solution||"Solution not available in imported source.")}</p></div>`}).join("")}</div>`;
}
async function admin(){
 const tests=await fetch("/api/tests/all").then(r=>r.json());
 app.innerHTML=`<div class="title"><div><h1>Admin Dashboard</h1><p class="muted">Create, import, review and publish mocks.</p></div><button onclick="newTest()">+ New Test</button></div>
 <div class="grid">${tests.map(t=>`<div class="card"><span class="pill">${t.published?"Published":"Draft"}</span><h2>${esc(t.title)}</h2><p>${t.questionCount} questions · ${t.duration} min</p><div class="actions"><button onclick="manage('${t.id}')">Manage</button><button class="secondary" onclick="leaderboard('${t.id}')">Leaderboard</button></div></div>`).join("")}</div>`;
}
function newTest(){
 app.innerHTML=`<div class="card"><h1>Create Mock Test</h1><label>Test name</label><input id="title" value="SBI PO Mains Practice">
 <label>Exam</label><input id="exam" value="SBI PO / IBPS">
 <div class="grid"><div><label>Duration (minutes)</label><input id="duration" type="number" value="60"></div><div><label>Positive marks</label><input id="positive" type="number" step=".25" value="1"></div><div><label>Negative marks</label><input id="negative" type="number" step=".25" value=".25"></div></div>
 <button onclick="createTest()">Create</button></div>`;
}
async function createTest(){const t=await fetch("/api/tests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:title.value,exam:exam.value,duration:duration.value,positive:positive.value,negative:negative.value})}).then(r=>r.json());manage(t.id)}
async function manage(id){
 const t=await fetch("/api/tests/"+id).then(r=>r.json());
 app.innerHTML=`<div class="title"><div><h1>${esc(t.title)}</h1><p class="muted">${t.questions.length} questions</p></div><button onclick="admin()">Dashboard</button></div>
 <div class="card"><h2>PDF Import</h2><p class="muted">Upload a banking-exam PDF. V4 extracts sections, directions, questions, A-E options and answer/solution blocks, then lets you preview before importing.</p>
 <input id="pdf" type="file" accept=".pdf"><button style="margin-top:10px" onclick="parsePdf('${t.id}')">Parse PDF</button><div id="importArea"></div></div>
 <div class="card"><h2>Test Settings</h2><div class="grid"><div><label>Title</label><input id="mtitle" value="${esc(t.title)}"></div><div><label>Duration</label><input id="mduration" type="number" value="${t.duration}"></div><div><label>Publish</label><select id="mpub"><option value="false" ${!t.published?"selected":""}>Draft</option><option value="true" ${t.published?"selected":""}>Published</option></select></div></div><button onclick="saveSettings('${t.id}')">Save Settings</button></div>
 <div class="card"><h2>Questions (${t.questions.length})</h2>${t.questions.map(q=>`<div class="qpreview ${q.needsReview?"review":""}"><b>Q${q.number} · ${esc(q.section||"General")}</b><p>${esc(q.text)}</p><p class="muted">A: ${esc(q.options?.A||"")} · B: ${esc(q.options?.B||"")} · C: ${esc(q.options?.C||"")} · D: ${esc(q.options?.D||"")} · E: ${esc(q.options?.E||"")}</p><p>Answer: <b>${q.answer||"Not detected"}</b> ${q.needsReview?'<span class="warning"> · Review required</span>':""}</p></div>`).join("")}</div>`;
}
async function parsePdf(id){
 const f=pdf.files[0];if(!f)return alert("Choose a PDF first");
 const fd=new FormData();fd.append("pdf",f);importArea.innerHTML="<p>Parsing PDF...</p>";
 const r=await fetch("/api/import/pdf",{method:"POST",body:fd}),x=await r.json();if(!r.ok)return importArea.innerHTML=`<p class="bad">${esc(x.error)}</p>`;
 window.importedQuestions=x.questions;
 importArea.innerHTML=`<div class="preview"><h3>Import Preview — ${x.questions.length} questions / ${x.pages} pages</h3><p>${x.warnings.length} question(s) need review.</p>${x.questions.map((q,i)=>`<div class="qpreview ${q.needsReview?"review":""}"><b>Q${q.number} · ${esc(q.section)}</b><p>${esc(q.text)}</p><p>A. ${esc(q.options.A||"")}<br>B. ${esc(q.options.B||"")}<br>C. ${esc(q.options.C||"")}<br>D. ${esc(q.options.D||"")}<br>E. ${esc(q.options.E||"")}</p><p>Answer: ${q.answer||"Not detected"} ${q.needsReview?"⚠ Review": "✓"}</p></div>`).join("")}</div><button onclick="confirmImport('${id}')">Import Previewed Questions</button>`;
}
async function confirmImport(id){const r=await fetch("/api/tests/"+id+"/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({questions:window.importedQuestions})});if(r.ok)manage(id);else alert("Import failed")}
async function saveSettings(id){await fetch("/api/tests/"+id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:mtitle.value,duration:mduration.value,published:mpub.value==="true"})});manage(id)}
async function leaderboard(id){
 const rows=await fetch("/api/tests/"+id+"/leaderboard").then(r=>r.json());
 app.innerHTML=`<div class="title"><h1>Leaderboard</h1><button onclick="admin()">Back</button></div><div class="card"><table><tr><th>Rank</th><th>Candidate</th><th>Score</th><th>Correct</th><th>Wrong</th></tr>${rows.map(x=>`<tr><td>#${x.rank}</td><td>${esc(x.name)}</td><td><b>${fmt(x.score)}</b></td><td>${x.correct}</td><td>${x.wrong}</td></tr>`).join("")||"<tr><td colspan=5>No attempts yet.</td></tr>"}</table></div>`;
}
setSession(); login();
