
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "data.json");
const UPLOADS = path.join(ROOT, "uploads");
fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

app.use(express.json({limit:"5mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(ROOT,"public")));

const upload = multer({
  dest: UPLOADS,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    cb(null, file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf"))
});

function db(){
  if(!fs.existsSync(DATA)) return {users:[],tests:[],attempts:[]};
  try { return JSON.parse(fs.readFileSync(DATA,"utf8")); }
  catch { return {users:[],tests:[],attempts:[]}; }
}
function save(x){
  fs.mkdirSync(path.dirname(DATA), { recursive:true });
  fs.writeFileSync(DATA, JSON.stringify(x,null,2));
}
function id(prefix="id"){ return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8); }
function seed(){
  const d=db();
  if(!d.users.length){
    d.users=[
      {id:"u_admin",name:"Administrator",email:"admin@example.com",password:"admin123",role:"admin"},
      {id:"u_demo",name:"Demo Candidate",email:"candidate@example.com",password:"candidate123",role:"candidate"}
    ];
    save(d);
  }
}
seed();

function cleanText(s){
  return (s||"").replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
}
function normalizeLine(s){ return s.replace(/\u00ad/g,"").replace(/\s+$/,"").trim(); }

function parseOptions(lines, i){
  const options = {};
  let j=i;
  while(j<lines.length){
    const m=lines[j].match(/^\s*([A-E])[\.\):]\s*(.*)$/i);
    if(!m) break;
    options[m[1].toUpperCase()]=m[2].trim();
    j++;
  }
  return {options,j};
}

/*
  Parser is intentionally conservative. It detects numbered questions,
  A-E options, section headings, directions/caselets, and answer/solution
  blocks. Uncertain questions are flagged for Admin Preview instead of
  silently published.
*/
function parseBankingPdf(text){
  const raw=(text||"").replace(/\r/g,"").replace(/\u00ad/g,"");
  const lines=raw.split("\n").map(x=>x.trim()).filter(Boolean);

  // PRIMARY FORMAT:
  // Question Number: 1
  // Question: ...
  // Option A: ...
  // Option B: ...
  // Option C: ...
  // Option D: ...
  // Option E: ...
  // Right Option: B
  // Solution: ...
  const labelled=[];
  let current=null;
  let field=null;

  function finish(){
    if(!current) return;
    current.text=(current.text||"").trim();
    current.solution=(current.solution||"").trim();
    current.needsReview=!(
      current.text &&
      current.options.A && current.options.B && current.options.C &&
      current.options.D && current.options.E &&
      current.answer && current.solution
    );
    labelled.push(current);
    current=null; field=null;
  }

  for(let i=0;i<lines.length;i++){
    const line=lines[i];

    let m=line.match(/^Question\s*Number\s*[:\-]\s*(\d+)\s*$/i);
    if(m){
      finish();
      current={
        id:"q_"+m[1]+"_"+labelled.length,
        number:Number(m[1]),
        section:"General",
        directions:"",
        text:"",
        options:{},
        answer:null,
        solution:"",
        sourcePage:null,
        needsReview:false
      };
      field=null;
      continue;
    }
    if(!current) continue;

    m=line.match(/^Question\s*[:\-]\s*(.*)$/i);
    if(m){ current.text=m[1].trim(); field="text"; continue; }

    m=line.match(/^Option\s*([A-E])\s*[:\-]\s*(.*)$/i);
    if(m){ current.options[m[1].toUpperCase()]=m[2].trim(); field="option"; continue; }

    m=line.match(/^(?:Right\s*Option|Correct\s*Option|Answer)\s*[:\-]\s*([A-E])\s*$/i);
    if(m){ current.answer=m[1].toUpperCase(); field=null; continue; }

    m=line.match(/^Solution\s*[:\-]\s*(.*)$/i);
    if(m){ current.solution=m[1].trim(); field="solution"; continue; }

    // Allow wrapped/multi-line question and solution text.
    if(field==="text") current.text+=" "+line;
    else if(field==="solution") current.solution+=" "+line;
    else if(field==="option"){
      // A continuation line belongs to the most recently opened option.
      const keys=Object.keys(current.options);
      if(keys.length) current.options[keys[keys.length-1]]+=" "+line;
    }
  }
  finish();

  // If at least one labelled block was found, use it exclusively.
  if(labelled.length) return labelled;

  // Fallback for older numbered banking PDFs.
  return parseLegacyBankingPdf(raw);
}

function parseLegacyBankingPdf(raw){
  const lines=raw.split("\n").map(x=>x.trim()).filter(Boolean);
  const questions=[];
  let section="General", directions="", current=null;

  const sectionRe=/^(Reasoning(?: Ability)?|Quantitative Aptitude|Quantitative Ability|English Language|General Awareness|Computer Aptitude|Data Analysis|Banking Awareness|General Intelligence|Professional Knowledge)\s*$/i;
  const qRe=/^(?:Q(?:uestion)?\s*)?(\d{1,3})[\.\)]\s*(.*)$/i;
  const answerRe=/^(?:Answer|Ans\.?)\s*[:\-]\s*([A-E])\b/i;

  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(sectionRe.test(line)){section=line;directions="";continue;}

    const repeated=line.match(/^\s*(\d{1,3})[\.\)]\s*(?:Answer|Ans\.?)\s*[:\-]\s*([A-E])\b/i);
    if(repeated){
      const target=questions.find(q=>q.number===Number(repeated[1]));
      if(target) target.answer=repeated[2].toUpperCase();
      continue;
    }

    const qm=line.match(qRe);
    if(qm){
      if(current) questions.push(current);
      current={id:"q_"+qm[1]+"_"+questions.length,number:Number(qm[1]),section,directions,text:qm[2],options:{},answer:null,solution:"",needsReview:false};
      let j=i+1;
      while(j<lines.length){
        const om=lines[j].match(/^\s*([A-E])[\.\):]\s*(.*)$/i);
        if(!om) break;
        current.options[om[1].toUpperCase()]=om[2].trim(); j++;
      }
      i=j-1; continue;
    }
    if(current){
      const am=line.match(answerRe);
      if(am){current.answer=am[1].toUpperCase();continue;}
      if(current.answer) current.solution+=(current.solution?" ":"")+line;
      else if(!Object.keys(current.options).length) current.text+=" "+line;
    }
  }
  if(current) questions.push(current);
  for(const q of questions) q.needsReview=!(q.text && Object.keys(q.options).length>=5 && q.answer);
  return questions;
}

app.post("/api/login",(req,res)=>{
  const {email,password}=req.body;
  const user=db().users.find(u=>u.email===email && u.password===password);
  if(!user) return res.status(401).json({error:"Invalid email or password"});
  res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role}});
});

app.get("/api/tests",(req,res)=>{
  const d=db();
  res.json(d.tests.filter(t=>t.published).map(t=>({...t,questionCount:t.questions.length})));
});

app.get("/api/tests/all",(req,res)=>{
  const d=db();
  res.json(d.tests.map(t=>({...t,questionCount:t.questions.length})));
});

app.get("/api/tests/:id",(req,res)=>{
  const t=db().tests.find(x=>x.id===req.params.id);
  if(!t) return res.status(404).json({error:"Test not found"});
  res.json(t);
});

app.post("/api/tests",(req,res)=>{
  const d=db();
  const t={
    id:id("test"),
    title:req.body.title||"Untitled Mock Test",
    exam:req.body.exam||"Banking Mock Test",
    duration:Number(req.body.duration)||60,
    positive:Number(req.body.positive)||1,
    negative:Number(req.body.negative)||0,
    published:false,
    createdAt:new Date().toISOString(),
    questions:[]
  };
  d.tests.push(t); save(d); res.json(t);
});

app.put("/api/tests/:id",(req,res)=>{
  const d=db(), t=d.tests.find(x=>x.id===req.params.id);
  if(!t) return res.status(404).json({error:"Test not found"});
  Object.assign(t,{
    title:req.body.title ?? t.title,
    exam:req.body.exam ?? t.exam,
    duration:Number(req.body.duration)||t.duration,
    positive:Number(req.body.positive) >= 0 ? Number(req.body.positive) : t.positive,
    negative:Number(req.body.negative) >= 0 ? Number(req.body.negative) : t.negative,
    published:typeof req.body.published==="boolean"?req.body.published:t.published
  });
  save(d); res.json(t);
});

app.post("/api/tests/:id/questions",(req,res)=>{
  const d=db(), t=d.tests.find(x=>x.id===req.params.id);
  if(!t) return res.status(404).json({error:"Test not found"});
  const q={...req.body,id:req.body.id||id("q"),number:t.questions.length+1};
  t.questions.push(q); save(d); res.json(q);
});

app.post("/api/import/pdf",upload.single("pdf"),async(req,res)=>{
  if(!req.file) return res.status(400).json({error:"PDF file required"});
  try{
    const buf=fs.readFileSync(req.file.path);
    const parsed=await pdfParse(buf);
    const questions=parseBankingPdf(parsed.text);
    fs.unlinkSync(req.file.path);
    res.json({
      filename:req.file.originalname,
      pages:parsed.numpages,
      questions,
      warnings:questions.filter(q=>q.needsReview).map(q=>`Q${q.number}: review extraction`)
    });
  }catch(e){
    try{fs.unlinkSync(req.file.path)}catch{}
    res.status(500).json({error:"Could not parse PDF",detail:e.message});
  }
});

app.post("/api/tests/:id/import",(req,res)=>{
  const d=db(), t=d.tests.find(x=>x.id===req.params.id);
  if(!t) return res.status(404).json({error:"Test not found"});
  const incoming=Array.isArray(req.body.questions)?req.body.questions:[];
  const base=t.questions.length;
  incoming.forEach((q,i)=>t.questions.push({
    ...q,id:q.id||id("q"),number:base+i+1
  }));
  save(d);
  res.json({test:t,imported:incoming.length});
});

app.post("/api/attempts",(req,res)=>{
  const d=db(), t=d.tests.find(x=>x.id===req.body.testId);
  if(!t || !t.published) return res.status(404).json({error:"Published test not found"});
  const user=d.users.find(u=>u.id===req.body.userId);
  if(!user) return res.status(401).json({error:"Candidate not found"});

  const answers=req.body.answers||{};
  let correct=0, wrong=0, unanswered=0, score=0;
  const details=t.questions.map(q=>{
    const selected=answers[q.id] ?? null;
    const ok=selected && q.answer && selected.toUpperCase()===q.answer.toUpperCase();
    if(!selected) unanswered++;
    else if(ok){correct++;score+=t.positive;}
    else {wrong++;score-=t.negative;}
    return {questionId:q.id,selected,correct:!!ok,answer:q.answer};
  });
  const attempt={
    id:id("attempt"),testId:t.id,userId:user.id,submittedAt:new Date().toISOString(),
    score,correct,wrong,unanswered,total:t.questions.length,answers,details
  };
  d.attempts.push(attempt); save(d);
  res.json(attempt);
});

app.get("/api/results/:attemptId",(req,res)=>{
  const d=db(), a=d.attempts.find(x=>x.id===req.params.attemptId);
  if(!a) return res.status(404).json({error:"Result not found"});
  const t=d.tests.find(x=>x.id===a.testId);
  const same=d.attempts.filter(x=>x.testId===a.testId).sort((x,y)=>y.score-x.score || new Date(x.submittedAt)-new Date(y.submittedAt));
  const rank=same.findIndex(x=>x.id===a.id)+1;
  const topper=same[0]||a;
  const percentile=same.length<=1?100:((same.length-rank)/same.length)*100;
  const sectionStats={};
  for(const q of t.questions){
    const sec=q.section||"General";
    sectionStats[sec] ||= {total:0,correct:0,wrong:0,unanswered:0,score:0};
    const s=sectionStats[sec]; s.total++;
    const drow=a.details.find(x=>x.questionId===q.id);
    if(!drow || !drow.selected) s.unanswered++;
    else if(drow.correct){s.correct++;s.score+=t.positive;}
    else {s.wrong++;s.score-=t.negative;}
  }
  for(const s of Object.values(sectionStats)){
    s.accuracy=s.correct+s.wrong ? +(s.correct/(s.correct+s.wrong)*100).toFixed(2) : 0;
  }
  res.json({
    attempt:a,test:t,rank,totalCandidates:same.length,
    percentile:+percentile.toFixed(2),
    topper:{score:topper.score,correct:topper.correct,wrong:topper.wrong,unanswered:topper.unanswered},
    sectionStats
  });
});

app.get("/api/tests/:id/leaderboard",(req,res)=>{
  const d=db(), t=d.tests.find(x=>x.id===req.params.id);
  if(!t) return res.status(404).json({error:"Test not found"});
  const users=Object.fromEntries(d.users.map(u=>[u.id,u.name]));
  const rows=d.attempts.filter(a=>a.testId===t.id).sort((a,b)=>b.score-a.score).map((a,i)=>({
    rank:i+1,name:users[a.userId]||"Candidate",score:a.score,correct:a.correct,wrong:a.wrong
  }));
  res.json(rows);
});

app.use((req,res)=>{
  res.sendFile(path.join(ROOT,"public","index.html"));
});

app.listen(PORT, "0.0.0.0", () => console.log(`Mock Test Platform V4 running on port ${PORT}`));
