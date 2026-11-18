import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,addDoc,setDoc,deleteDoc,query,where} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const $app = document.getElementById("app"), $nav = document.getElementById("nav"), $user = document.getElementById("user");

let user=null, isAdmin=false, exams=[], attempts=[];
const imgCache={};
const S={view:"home",exam:null,answers:[],result:null,draft:null,msg:"",all:[],saving:false};

function h(tag,a={},...kids){
  const e=document.createElement(tag);
  for(const k in a){
    if(k==="class")e.className=a[k];
    else if(k.startsWith("on"))e.addEventListener(k.slice(2),a[k]);
    else if(["checked","disabled","value"].includes(k))e[k]=a[k];
    else e.setAttribute(k,a[k]);
  }
  kids.flat().forEach(c=>{if(c==null||c===false)return;e.appendChild(typeof c==="object"?c:document.createTextNode(String(c)));});
  return e;
}
const go=v=>{
  S.view=v;S.msg="";
  if(v==="home"&&location.hash)history.replaceState(null,"",location.pathname+location.search);
  render();window.scrollTo(0,0);
};
// Enlace directo: https://.../#e=ID_DE_LA_EVALUACION
function route(){
  const m=location.hash.match(/^#e=([A-Za-z0-9]+)$/);
  S.msg="";
  if(m){S.exam=exams.find(e=>e.id===m[1])||null;S.view="intro";}
  else S.view="home";
  render();window.scrollTo(0,0);
}
window.addEventListener("hashchange",()=>{if(user&&S.view!=="take")route();});
const fmt=ts=>new Date(ts).toLocaleString("es-AR");

/* ---------- Imágenes ---------- */
// Las opciones viejas eran texto simple; las nuevas son {text, img}
const norm=o=>typeof o==="string"?{text:o,img:null}:{text:o.text||"",img:o.img||null};
function collectIds(ex){
  const s=new Set();
  (ex&&ex.questions||[]).forEach(q=>{if(q.img)s.add(q.img);q.options.forEach(o=>{const n=norm(o);if(n.img)s.add(n.img);});});
  return s;
}
async function preload(ex){
  const ids=[...collectIds(ex)].filter(id=>!imgCache[id]);
  await Promise.all(ids.map(async id=>{try{const d=await getDoc(doc(db,"images",id));if(d.exists())imgCache[id]=d.data().data;}catch(e){}}));
}
function compress(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onerror=rej;
    r.onload=()=>{
      const i=new Image(); i.onerror=rej;
      i.onload=()=>{
        let max=900,q=.75,data;
        for(let k=0;k<5;k++){
          const s=Math.min(1,max/Math.max(i.width,i.height));
          const c=document.createElement("canvas");
          c.width=Math.max(1,Math.round(i.width*s)); c.height=Math.max(1,Math.round(i.height*s));
          const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(i,0,0,c.width,c.height);
          data=c.toDataURL("image/jpeg",q);
          if(data.length<350000)break;
          max*=.75; q=Math.max(.4,q-.1);
        }
        res(data);
      };
      i.src=r.result;
    };
    r.readAsDataURL(file);
  });
}
const imgSrc=img=>img?(img.data||imgCache[img.id]||""):"";
const picEl=(id,cls="pic")=>id&&imgCache[id]?h("img",{class:cls,src:imgCache[id],alt:""}):null;

/* ---------- Auth ---------- */
onAuthStateChanged(auth, async u=>{
  user=u; isAdmin=false;
  if(u){
    try{isAdmin=(await getDoc(doc(db,"admins",u.email))).exists();}catch(e){}
    await loadData();
  }
  route();
});
async function login(){
  try{await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(e){alert("No se pudo iniciar sesión: "+e.message);}
}
async function loadData(){
  const ex=await getDocs(collection(db,"exams"));
  exams=ex.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.title.localeCompare(b.title));
  await refreshAttempts();
}
async function refreshAttempts(){
  const at=await getDocs(query(collection(db,"attempts"),where("uid","==",user.uid)));
  attempts=at.docs.map(d=>d.data()).sort((a,b)=>b.ts-a.ts);
}
const used=ex=>attempts.filter(a=>a.examId===ex.id).length;
const canTake=ex=>isAdmin||!ex.maxAttempts||used(ex)<ex.maxAttempts;

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
  ({home:rHome,take:rTake,result:rResult,history:rHistory,admin:rAdmin,edit:rEdit,results:rResults,intro:rIntro})[S.view]();
}

function examCard(ex){
  const mine=attempts.filter(a=>a.examId===ex.id);
  const best=mine.length?Math.max(...mine.map(a=>a.pct)):null;
  const meta=[`${ex.questions.length} preguntas`,
    ex.maxAttempts?`Intentos: ${mine.length} de ${ex.maxAttempts}`:null,
    best!==null?`mejor resultado: ${best}%`:null].filter(Boolean).join(" · ");
  const ok=canTake(ex);
  return h("div",{class:"card"},h("div",{class:"row"},
    h("div",{},h("h2",{},ex.title," ",ex.unlisted&&isAdmin?h("span",{class:"tag"},"Solo por enlace"):null),
      h("div",{class:"mut"},meta),
      isAdmin&&ex.maxAttempts?h("div",{class:"mut"},"Como administrador no tenés límite de intentos."):null,
      ok?null:h("div",{class:"err"},"Ya usaste todos tus intentos.")),
    h("button",{class:"pri",disabled:!ok,onclick:()=>start(ex)},"Comenzar")));
}
function rHome(){
  const list=exams.filter(ex=>!ex.unlisted||isAdmin);
  if(!list.length){$app.appendChild(h("div",{class:"card"},h("p",{},"Todavía no hay evaluaciones."),isAdmin?h("button",{class:"pri",onclick:newExam},"Crear la primera"):null));return;}
  list.forEach(ex=>$app.appendChild(examCard(ex)));
}
function rIntro(){
  const ex=S.exam;
  if(!ex){$app.appendChild(h("div",{class:"card center"},h("p",{},"No se encontró esa evaluación. Puede que haya sido eliminada."),h("button",{class:"pri",onclick:()=>go("home")},"Ver todas las evaluaciones")));return;}
  $app.appendChild(examCard(ex));
  $app.appendChild(h("p",{class:"center"},h("button",{onclick:()=>go("home")},"Ver todas las evaluaciones")));
}
async function start(ex){
  $app.innerHTML="";$app.appendChild(h("p",{class:"mut"},"Cargando…"));
  try{await refreshAttempts();}catch(e){}
  if(!canTake(ex)){alert("Ya usaste todos los intentos de esta evaluación.");render();return;}
  S.exam=ex;S.answers=new Array(ex.questions.length).fill(null);
  await preload(ex); go("take");
}

function optBlock(q,i,mode){
  const pics=q.options.some(o=>norm(o).img);
  const box=h("div",{class:"optgrid"+(pics?" pics":"")});
  q.options.forEach((o,j)=>{
    const n=norm(o);
    if(mode==="take"){
      box.appendChild(h("label",{class:"opt"},
        h("input",{type:"radio",name:"q"+i,checked:S.answers[i]===j,onchange:()=>{S.answers[i]=j;S.upd();}}),
        picEl(n.img),n.text?h("span",{},n.text):null));
    }else{
      const cls=j===q.correct?" ok":(j===S.answers[i]?" bad":"");
      box.appendChild(h("label",{class:"opt"+cls},
        (j===q.correct?"✓ ":j===S.answers[i]?"✗ ":null),picEl(n.img),n.text?h("span",{},n.text):null));
    }
  });
  return box;
}
function qHead(q,i){return [h("p",{},h("strong",{},`${i+1}. ${q.text||""}`)),picEl(q.img,"pic qpic")];}

function rTake(){
  const ex=S.exam;
  $app.appendChild(h("h2",{},ex.title));
  ex.questions.forEach((q,i)=>$app.appendChild(h("div",{class:"card"},...qHead(q,i),optBlock(q,i,"take"))));
  const btn=h("button",{class:"pri",onclick:finish},"Finalizar"), info=h("span",{class:"mut"});
  S.upd=()=>{const n=S.answers.filter(a=>a!==null).length;info.textContent=`${n} de ${ex.questions.length} respondidas`;btn.disabled=n<ex.questions.length;};
  S.upd();
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
  ex.questions.forEach((q,i)=>$app.appendChild(h("div",{class:"card"},...qHead(q,i),optBlock(q,i,"result"))));
  $app.appendChild(h("div",{class:"row"},h("button",{disabled:!canTake(ex),onclick:()=>start(ex)},canTake(ex)?"Reintentar":"Sin intentos disponibles"),h("button",{class:"pri",onclick:()=>go("home")},"Volver")));
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
const blankQ=()=>({text:"",img:null,options:[{text:"",img:null},{text:"",img:null}],correct:0});
const newExam=()=>{S.draft={id:null,title:"",max:"",unlisted:false,questions:[blankQ()]};go("edit");};
const toDraft=ex=>({id:ex.id,title:ex.title,max:ex.maxAttempts?String(ex.maxAttempts):"",unlisted:!!ex.unlisted,questions:ex.questions.map(q=>({
  text:q.text||"",img:q.img?{id:q.img}:null,correct:q.correct,
  options:q.options.map(o=>{const n=norm(o);return{text:n.text,img:n.img?{id:n.img}:null};})}))});

function rAdmin(){
  $app.appendChild(h("div",{class:"row",style:"margin-bottom:12px"},h("h2",{},"Evaluaciones"),h("button",{class:"pri",onclick:newExam},"+ Nueva evaluación")));
  exams.forEach(ex=>{
    const cb=h("button",{onclick:()=>copyLink(ex,cb)},"🔗 Copiar enlace");
    const info=[`${ex.questions.length} preguntas`,ex.maxAttempts?`${ex.maxAttempts} intento(s) por persona`:"intentos ilimitados",ex.unlisted?"solo por enlace":null].filter(Boolean).join(" · ");
    $app.appendChild(h("div",{class:"card"},h("div",{class:"row"},
      h("div",{},h("strong",{},ex.title),h("div",{class:"mut"},info)),
      h("div",{},cb," ",
        h("button",{onclick:async()=>{await preload(ex);S.draft=toDraft(ex);go("edit");}},"Editar")," ",
        h("button",{class:"del",onclick:()=>delExam(ex)},"Eliminar")))));
  });
}
async function copyLink(ex,btn){
  const url=location.origin+location.pathname+"#e="+ex.id;
  try{await navigator.clipboard.writeText(url);btn.textContent="¡Copiado!";setTimeout(()=>btn.textContent="🔗 Copiar enlace",1800);}
  catch(e){prompt("Copiá este enlace:",url);}
}
async function delExam(ex){
  if(!confirm(`¿Eliminar “${ex.title}”?`))return;
  try{
    await deleteDoc(doc(db,"exams",ex.id));
    for(const id of collectIds(ex)){try{await deleteDoc(doc(db,"images",id));}catch(e){}}
    await loadData();render();
  }catch(e){alert("No se pudo eliminar.");}
}

// Botón de imagen + vista previa para una pregunta u opción ("holder" tiene .img)
function imgControls(holder,label){
  const fi=h("input",{type:"file",accept:"image/*",style:"display:none",onchange:async e=>{
    const f=e.target.files[0]; if(!f)return;
    try{holder.img={data:await compress(f)};render();}catch(x){alert("No se pudo leer la imagen.");}
  }});
  const src=imgSrc(holder.img);
  const btn=h("button",{type:"button",title:"Imagen",onclick:()=>fi.click()},src?"🖼 Cambiar":label,fi);
  const prev=src?h("div",{class:"prev"},h("img",{class:"thumb",src,alt:""}),
    h("button",{type:"button",class:"del",onclick:()=>{holder.img=null;render();}},"Quitar imagen")):null;
  return [btn,prev];
}

function rEdit(){
  const d=S.draft;
  $app.appendChild(h("div",{class:"card"},h("strong",{},"Título de la evaluación"),
    h("input",{type:"text",value:d.title,placeholder:"Ej.: Matemática – Unidad 1",oninput:e=>d.title=e.target.value})));
  $app.appendChild(h("div",{class:"card"},h("strong",{},"Configuración"),
    h("p",{class:"mut",style:"margin:6px 0"},"Intentos permitidos por persona (vacío = ilimitados):"),
    h("input",{type:"text",inputmode:"numeric",value:d.max,placeholder:"Ilimitados",style:"max-width:160px",oninput:e=>{e.target.value=e.target.value.replace(/\D/g,"");d.max=e.target.value;}}),
    h("label",{style:"display:flex;gap:10px;align-items:center;margin-top:12px;cursor:pointer"},
      h("input",{type:"checkbox",checked:d.unlisted,onchange:e=>d.unlisted=e.target.checked}),"Solo por enlace (no aparece en la lista)")));
  d.questions.forEach((q,qi)=>{
    const c=h("div",{class:"card"},h("div",{class:"row"},h("strong",{},"Pregunta "+(qi+1)),
      d.questions.length>1?h("button",{class:"del",onclick:()=>{d.questions.splice(qi,1);render();}},"Quitar"):null));
    c.appendChild(h("textarea",{rows:"2",placeholder:"Texto de la pregunta (opcional si ponés una imagen)",oninput:e=>q.text=e.target.value},q.text));
    const [qb,qp]=imgControls(q,"📷 Imagen de la pregunta");
    c.appendChild(h("div",{style:"margin:8px 0"},qb)); if(qp)c.appendChild(qp);
    c.appendChild(h("p",{class:"mut"},"Opciones (texto, imagen o ambos). Marcá la correcta:"));
    q.options.forEach((o,oi)=>{
      const [ob,op]=imgControls(o,"📷");
      c.appendChild(h("div",{class:"optedit"},
        h("div",{class:"opts"},
          h("input",{type:"radio",name:"c"+qi,checked:q.correct===oi,onchange:()=>q.correct=oi}),
          h("input",{type:"text",value:o.text,placeholder:"Opción "+(oi+1),oninput:e=>o.text=e.target.value}),
          ob,
          q.options.length>2?h("button",{class:"del",onclick:()=>{q.options.splice(oi,1);if(q.correct>=q.options.length)q.correct=0;else if(q.correct>oi)q.correct--;render();}},"✕"):null),
        op));
    });
    if(q.options.length<6)c.appendChild(h("button",{onclick:()=>{q.options.push({text:"",img:null});render();}},"+ Opción"));
    $app.appendChild(c);
  });
  $app.appendChild(h("div",{class:"row"},
    h("button",{onclick:()=>{d.questions.push(blankQ());render();}},"+ Pregunta"),
    h("span",{class:S.saving?"mut":"err"},S.msg),
    h("div",{},h("button",{disabled:S.saving,onclick:()=>go("admin")},"Cancelar")," ",h("button",{class:"pri",disabled:S.saving,onclick:saveExam},"Guardar"))));
}

async function saveExam(){
  const d=S.draft; let err="";
  if(!d.title.trim())err="Falta el título.";
  d.questions.forEach((q,i)=>{if(err)return;
    if(!q.text.trim()&&!q.img)err=`La pregunta ${i+1} necesita texto o imagen.`;
    else if(q.options.some(o=>!o.text.trim()&&!o.img))err=`Cada opción de la pregunta ${i+1} necesita texto o imagen.`;});
  if(err){S.msg=err;render();return;}
  S.saving=true;S.msg="Guardando…";render();
  const old=d.id?collectIds(exams.find(e=>e.id===d.id)):new Set();
  try{
    const up=async img=>{
      if(!img)return null; if(img.id)return img.id;
      const r=await addDoc(collection(db,"images"),{data:img.data,ts:Date.now()});
      imgCache[r.id]=img.data; return r.id;
    };
    const questions=[];
    for(const q of d.questions){
      const options=[];
      for(const o of q.options)options.push({text:o.text.trim(),img:await up(o.img)});
      questions.push({text:q.text.trim(),img:await up(q.img),options,correct:q.correct});
    }
    const data={title:d.title.trim(),updated:Date.now(),maxAttempts:parseInt(d.max,10)||0,unlisted:!!d.unlisted,questions};
    if(d.id)await setDoc(doc(db,"exams",d.id),data);else await addDoc(collection(db,"exams"),data);
    const keep=collectIds(data);
    for(const id of old)if(!keep.has(id)){try{await deleteDoc(doc(db,"images",id));}catch(e){}}
    await loadData();S.saving=false;go("admin");
  }catch(e){S.saving=false;S.msg="No se pudo guardar (¿sos administrador? ¿actualizaste las reglas?).";render();}
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
