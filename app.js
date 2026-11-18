import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,addDoc,setDoc,deleteDoc,query,where} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const $app = document.getElementById("app"), $nav = document.getElementById("nav"), $user = document.getElementById("user");

let user=null, isAdmin=false, exams=[], attempts=[];
const S={view:"home",exam:null,answers:[],result:null,draft:null,msg:"",all:[]};

function h(tag,a={},...kids){
  const e=document.createElement(tag);
  for(const k in a){
    if(k==="class")e.className=a[k];
    else if(k.startsWith("on"))e.addEventListener(k.slice(2),a[k]);
    else if(["checked","disabled","value"].includes(k))e[k]=a[k];
    else e.setAttribute(k,a[k]);
  }
  kids.forEach(c=>{if(c==null||c===false)return;e.appendChild(typeof c==="object"?c:document.createTextNode(String(c)));});
  return e;
}
const go=v=>{S.view=v;S.msg="";render();window.scrollTo(0,0);};
const fmt=ts=>new Date(ts).toLocaleString("es-AR");

/* ---------- Auth ---------- */
onAuthStateChanged(auth, async u=>{
  user=u; isAdmin=false;
  if(u){
    try{isAdmin=(await getDoc(doc(db,"admins",u.email))).exists();}catch(e){}
    await loadData();
  }
  S.view="home"; render();
});
async function login(){
  try{await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(e){alert("No se pudo iniciar sesión: "+e.message);}
}
async function loadData(){
  const ex=await getDocs(collection(db,"exams"));
  exams=ex.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.title.localeCompare(b.title));
  const at=await getDocs(query(collection(db,"attempts"),where("uid","==",user.uid)));
  attempts=at.docs.map(d=>d.data()).sort((a,b)=>b.ts-a.ts);
}

/* ---------- Render ---------- */
function render(){
  $user.innerHTML=""; $nav.innerHTML=""; $app.innerHTML="";
  if(!user){
    $app.appendChild(h("div",{class:"card center"},h("h2",{},"Ingresá para rendir evaluaciones"),
      h("p",{class:"mut"},"Usá tu cuenta de Gmail."),h("button",{class:"pri",onclick:login},"Ingresar con Google")));
    return;
  }
  $user.appendChild(h("span",{class:"mut"},user.email+" "));
  $user.appendChild(h("button",{onclick:()=>signOut(auth)},"Salir"));
  const items=[["home","Evaluaciones"],["history","Mi historial"]];
  if(isAdmin)items.push(["admin","Administrar"],["results","Resultados"]);
  items.forEach(([v,t])=>$nav.appendChild(h("button",{class:(S.view===v||(v==="admin"&&S.view==="edit"))?"on":"",onclick:()=>go(v)},t)));
  ({home:rHome,take:rTake,result:rResult,history:rHistory,admin:rAdmin,edit:rEdit,results:rResults})[S.view]();
}

function rHome(){
  if(!exams.length){$app.appendChild(h("div",{class:"card"},h("p",{},"Todavía no hay evaluaciones."),isAdmin?h("button",{class:"pri",onclick:newExam},"Crear la primera"):null));return;}
  exams.forEach(ex=>{
    const mine=attempts.filter(a=>a.examId===ex.id);
    const best=mine.length?Math.max(...mine.map(a=>a.pct)):null;
    $app.appendChild(h("div",{class:"card"},h("div",{class:"row"},
      h("div",{},h("h2",{},ex.title),h("div",{class:"mut"},`${ex.questions.length} preguntas`+(best!==null?` · mejor resultado: ${best}%`:""))),
      h("button",{class:"pri",onclick:()=>start(ex)},"Comenzar"))));
  });
}
function start(ex){S.exam=ex;S.answers=new Array(ex.questions.length).fill(null);go("take");}

function rTake(){
  const ex=S.exam;
  $app.appendChild(h("h2",{},ex.title));
  ex.questions.forEach((q,i)=>{
    const c=h("div",{class:"card"},h("p",{},h("strong",{},`${i+1}. ${q.text}`)));
    q.options.forEach((o,j)=>c.appendChild(h("label",{class:"opt"},
      h("input",{type:"radio",name:"q"+i,checked:S.answers[i]===j,onchange:()=>{S.answers[i]=j;upd();}}),o)));
    $app.appendChild(c);
  });
  const btn=h("button",{class:"pri",onclick:finish},"Finalizar"), info=h("span",{class:"mut"});
  const upd=()=>{const n=S.answers.filter(a=>a!==null).length;info.textContent=`${n} de ${ex.questions.length} respondidas`;btn.disabled=n<ex.questions.length;};
  upd();
  $app.appendChild(h("div",{class:"row"},h("button",{onclick:()=>go("home")},"Cancelar"),info,btn));
}

async function finish(){
  const ex=S.exam;
  const correct=ex.questions.filter((q,i)=>S.answers[i]===q.correct).length;
  const total=ex.questions.length, pct=Math.round(correct/total*100);
  const rec={uid:user.uid,email:user.email,examId:ex.id,examTitle:ex.title,correct,total,pct,ts:Date.now()};
  S.result={...rec,saved:null}; go("result");
  try{await addDoc(collection(db,"attempts"),rec);attempts.unshift(rec);S.result.saved=true;}
  catch(e){S.result.saved=false;}
  if(S.view==="result")render();
}

function rResult(){
  const r=S.result, ex=S.exam;
  $app.appendChild(h("div",{class:"card"},h("h2",{},ex.title),
    h("div",{class:"score "+(r.pct>=60?"good":"low")},r.pct+"%"),
    h("div",{class:"bar"},h("div",{style:`width:${r.pct}%`})),
    h("p",{class:"mut center"},`${r.correct} correctas de ${r.total}`),
    r.saved===true?h("p",{class:"mut center"},"✓ Guardado en tu historial"):null,
    r.saved===false?h("p",{class:"err center"},"No se pudo guardar el intento."):null));
  ex.questions.forEach((q,i)=>{
    const c=h("div",{class:"card"},h("p",{},h("strong",{},`${i+1}. ${q.text}`)));
    q.options.forEach((o,j)=>{
      const cls=j===q.correct?" ok":(j===S.answers[i]?" bad":"");
      c.appendChild(h("label",{class:"opt"+cls},(j===q.correct?"✓ ":j===S.answers[i]?"✗ ":"")+o));
    });
    $app.appendChild(c);
  });
  $app.appendChild(h("div",{class:"row"},h("button",{onclick:()=>start(ex)},"Reintentar"),h("button",{class:"pri",onclick:()=>go("home")},"Volver")));
}

function rHistory(){
  if(!attempts.length){$app.appendChild(h("div",{class:"card mut"},"Todavía no hiciste ninguna evaluación."));return;}
  const avg=Math.round(attempts.reduce((s,a)=>s+a.pct,0)/attempts.length);
  $app.appendChild(h("div",{class:"card row"},h("span",{},"Intentos: ",h("strong",{},attempts.length)),h("span",{},"Promedio: ",h("strong",{},avg+"%"))));
  attempts.forEach(a=>$app.appendChild(h("div",{class:"card"},
    h("div",{class:"row"},h("strong",{},a.examTitle),h("span",{class:"tag"},a.pct+"%")),
    h("div",{class:"bar",style:"margin:8px 0"},h("div",{style:`width:${a.pct}%`})),
    h("div",{class:"mut"},`${a.correct}/${a.total} correctas · ${fmt(a.ts)}`))));
}

/* ---------- Administración ---------- */
const newExam=()=>{S.draft={id:null,title:"",questions:[{text:"",options:["",""],correct:0}]};go("edit");};

function rAdmin(){
  $app.appendChild(h("div",{class:"row",style:"margin-bottom:12px"},h("h2",{},"Evaluaciones"),h("button",{class:"pri",onclick:newExam},"+ Nueva evaluación")));
  exams.forEach(ex=>$app.appendChild(h("div",{class:"card row"},
    h("div",{},h("strong",{},ex.title),h("div",{class:"mut"},`${ex.questions.length} preguntas`)),
    h("div",{},h("button",{onclick:()=>{S.draft=JSON.parse(JSON.stringify(ex));go("edit");}},"Editar")," ",
      h("button",{class:"del",onclick:()=>delExam(ex)},"Eliminar")))));
}
async function delExam(ex){
  if(!confirm(`¿Eliminar “${ex.title}”?`))return;
  try{await deleteDoc(doc(db,"exams",ex.id));await loadData();render();}catch(e){alert("No se pudo eliminar.");}
}

function rEdit(){
  const d=S.draft;
  $app.appendChild(h("div",{class:"card"},h("strong",{},"Título de la evaluación"),
    h("input",{type:"text",value:d.title,placeholder:"Ej.: Matemática – Unidad 1",oninput:e=>d.title=e.target.value})));
  d.questions.forEach((q,qi)=>{
    const c=h("div",{class:"card"},h("div",{class:"row"},h("strong",{},"Pregunta "+(qi+1)),
      d.questions.length>1?h("button",{class:"del",onclick:()=>{d.questions.splice(qi,1);render();}},"Quitar"):null));
    c.appendChild(h("textarea",{rows:"2",placeholder:"Texto de la pregunta",oninput:e=>q.text=e.target.value},q.text));
    c.appendChild(h("p",{class:"mut"},"Escribí las opciones y marcá la correcta:"));
    q.options.forEach((o,oi)=>c.appendChild(h("div",{class:"opts"},
      h("input",{type:"radio",name:"c"+qi,checked:q.correct===oi,onchange:()=>q.correct=oi}),
      h("input",{type:"text",value:o,placeholder:"Opción "+(oi+1),oninput:e=>q.options[oi]=e.target.value}),
      q.options.length>2?h("button",{class:"del",onclick:()=>{q.options.splice(oi,1);if(q.correct>=q.options.length)q.correct=0;else if(q.correct>oi)q.correct--;render();}},"✕"):null)));
    if(q.options.length<6)c.appendChild(h("button",{onclick:()=>{q.options.push("");render();}},"+ Opción"));
    $app.appendChild(c);
  });
  $app.appendChild(h("div",{class:"row"},
    h("button",{onclick:()=>{d.questions.push({text:"",options:["",""],correct:0});render();}},"+ Pregunta"),
    h("span",{class:"err"},S.msg),
    h("div",{},h("button",{onclick:()=>go("admin")},"Cancelar")," ",h("button",{class:"pri",onclick:saveExam},"Guardar"))));
}
async function saveExam(){
  const d=S.draft; let err="";
  if(!d.title.trim())err="Falta el título.";
  d.questions.forEach((q,i)=>{if(err)return;
    if(!q.text.trim())err=`La pregunta ${i+1} está vacía.`;
    else if(q.options.some(o=>!o.trim()))err=`Completá todas las opciones de la pregunta ${i+1}.`;});
  if(err){S.msg=err;render();return;}
  const data={title:d.title.trim(),updated:Date.now(),
    questions:d.questions.map(q=>({text:q.text.trim(),options:q.options.map(o=>o.trim()),correct:q.correct}))};
  try{
    if(d.id)await setDoc(doc(db,"exams",d.id),data);else await addDoc(collection(db,"exams"),data);
    await loadData();go("admin");
  }catch(e){S.msg="No se pudo guardar (¿sos administrador?).";render();}
}

async function rResults(){
  $app.appendChild(h("p",{class:"mut"},"Cargando…"));
  try{
    const s=await getDocs(collection(db,"attempts"));
    S.all=s.docs.map(d=>d.data()).sort((a,b)=>b.ts-a.ts);
  }catch(e){S.all=[];}
  if(S.view!=="results")return;
  $app.innerHTML="";
  if(!S.all.length){$app.appendChild(h("div",{class:"card mut"},"Sin resultados todavía."));return;}
  const t=h("table",{},h("tr",{},h("th",{},"Usuario"),h("th",{},"Evaluación"),h("th",{},"%"),h("th",{},"Fecha")));
  S.all.forEach(a=>t.appendChild(h("tr",{},h("td",{},a.email),h("td",{},a.examTitle),h("td",{},a.pct+"%"),h("td",{},fmt(a.ts)))));
  $app.appendChild(h("div",{class:"card wrap"},t));
}

render();
