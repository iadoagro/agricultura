/* Organograma — desenho, edição (modo Admin), versões e exportação.
   Carregado por pages/organograma.html depois que os dados chegam do banco (ORG_DADOS). */
function getPDFPath(holder){
  const m=String(holder||"").match(/Portaria\s+N\S{0,2}\s*0*(\d+)\s*\/\s*(\d{4})/i);
  if(!m)return null;
  return PORTARIA_PDF_N[m[1]+"/"+m[2]]||null;
}

const SW=9144000,SH=5143500,RW=2400,RH=1350;
function xPx(v){return v/SW*RW}
function yPx(v){return v/SH*RH}

// Setores, responsáveis, portarias e histórico vêm do banco (tabelas organograma_setores,
// organograma_portarias e organograma_historico — database/organograma-dados.sql); o carregador
// em pages/organograma.html entrega tudo pronto em ORG_DADOS antes deste arquivo rodar.
const PORTARIA_PDF=ORG_DADOS.portarias;          // "216/2026" -> caminho do PDF
const MATRICULAS=ORG_DADOS.matriculas;           // id -> matrícula
const HISTORICO=ORG_DADOS.historico;             // id -> [{nome,portaria,ano}] (mais recente primeiro)
// Chaves do banco ("04/2023", "216/2026") e números nos textos ("Portaria Nº 04/2023") podem
// diferir no zero à esquerda; as duas pontas são normalizadas antes de comparar.
const PORTARIA_PDF_N={};
Object.keys(PORTARIA_PDF).forEach(k=>{
  const m=/^\s*0*(\d+)\s*\/\s*(\d{4})\s*$/.exec(k);
  if(m)PORTARIA_PDF_N[m[1]+"/"+m[2]]=PORTARIA_PDF[k];
});
// [id,parent,kind,color,title,holder,x,y,w,hh,bh]
const RAW=ORG_DADOS.setores;

// ===== Estrutura personalizada: nomes, siglas, cores, tipos, hierarquia, caixas novas e removidas =====
// Fica na tabela organograma_ajustes. O desenho é calculado de uma vez só, então a estrutura
// vem do cache da última visita (localStorage); quando o banco devolve algo diferente,
// a página recarrega uma vez com a estrutura nova.
const ORG_CACHE_KEY='seagri_org_estrutura_v1';
function orgLerCache(){try{const v=JSON.parse(localStorage.getItem(ORG_CACHE_KEY)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function orgGuardarCache(linhas){try{localStorage.setItem(ORG_CACHE_KEY,JSON.stringify(linhas));}catch(e){}}
const ORG_LINHAS=orgLerCache();
function orgAssinatura(linhas){
  return JSON.stringify((linhas||[])
    .filter(l=>l.removido||l.novo||l.parent_id||l.titulo||l.sigla||l.cor||l.tipo||l.cor_titulo||l.cor_texto)
    .map(l=>[l.id,l.parent_id||'',l.titulo||'',l.sigla||'',l.cor||'',l.tipo||'',!!l.removido,!!l.novo,l.cor_titulo||'',l.cor_texto||''])
    .sort((a,b)=>a[0]<b[0]?-1:1));
}
const ORG_ASSINATURA_BUILD=orgAssinatura(ORG_LINHAS);

/** Aplica a estrutura salva sobre o desenho original (RAW) e posiciona as caixas
    novas ou movidas logo abaixo do novo pai; o restante do desenho (ajuste de
    sobreposição, centralização, espaçamento) segue valendo. */
function orgEstruturaRaw(raw,linhas){
  const ov=new Map(linhas.map(l=>[l.id,l]));
  const todos=raw.map(d=>d.slice());
  const tam={};
  raw.forEach(d=>{if(!tam[d[2]])tam[d[2]]={w:d[8],hh:d[9],bh:d[10]||d[9]};});
  const mudou=new Set();
  linhas.filter(l=>l.novo&&!l.removido).forEach(l=>{
    const k=l.tipo||'divisao';
    const t=tam[k]||tam.divisao||{w:531692,hh:152400,bh:135000};
    todos.push([l.id,l.parent_id||'sec',k,l.cor||'blue',l.titulo||'Novo setor',l.holder||'',0,0,t.w,t.hh,t.bh]);
    mudou.add(l.id);
  });
  todos.forEach(d=>{
    const l=ov.get(d[0]);if(!l)return;
    if(!l.novo){
      if(l.titulo)d[4]=l.titulo;
      if(l.tipo)d[2]=l.tipo;
      if(l.cor)d[3]=l.cor;
      if(l.holder!=null)d[5]=l.holder;
      if(l.parent_id&&l.parent_id!==d[1]){d[1]=l.parent_id;mudou.add(d[0]);}
    }
    if(l.sigla)d[11]=l.sigla;
    if(l.cor_titulo)d[12]=l.cor_titulo;
    if(l.cor_texto)d[13]=l.cor_texto;
  });
  // removidas: quem estava ligado a elas passa para o pai delas
  const removidos=new Set(linhas.filter(l=>l.removido).map(l=>l.id));
  if(removidos.size){
    const paiDe=new Map(todos.map(d=>[d[0],d[1]]));
    todos.forEach(d=>{
      let guarda=0;
      while(d[1]&&removidos.has(d[1])&&guarda++<50){d[1]=paiDe.get(d[1])||null;mudou.add(d[0]);}
    });
  }
  const vivos=todos.filter(d=>!removidos.has(d[0]));
  const mapa=new Map(vivos.map(d=>[d[0],d]));
  vivos.forEach(d=>{if(d[1]&&!mapa.has(d[1]))d[1]=mapa.has('sec')?'sec':null;});   // órfã: volta para a raiz

  const profundidade=id=>{let n=0,c=mapa.get(id);while(c&&c[1]&&n<60){c=mapa.get(c[1]);n++;}return n;};
  const filhosDe=id=>vivos.filter(d=>d[1]===id);
  const descendentes=id=>{const out=[];filhosDe(id).forEach(c=>{out.push(c,...descendentes(c[0]));});return out;};
  const pendentes=new Set([...mudou].filter(id=>mapa.has(id)));
  [...pendentes].sort((a,b)=>profundidade(a)-profundidade(b)).forEach(id=>{
    const d=mapa.get(id),p=d[1]?mapa.get(d[1]):null;
    pendentes.delete(id);
    if(!p)return;
    const pFundo=p[7]+p[9]+(p[10]||p[9]);
    const irmaos=filhosDe(p[0]).filter(c=>c[0]!==id&&!pendentes.has(c[0]));
    const abaixo=irmaos.filter(c=>c[7]>=pFundo-50000);
    let nx,ny,borde;
    const VERT=new Set(['divisao','nucleo']);   // caixas altas e estreitas (mesmas de VERT_KINDS)
    const mesmoFormato=abaixo.filter(c=>VERT.has(c[2])===VERT.has(d[2]));
    const extensao=c=>Math.max(c[6]+c[8],...descendentes(c[0]).map(k=>k[6]+k[8]));
    if(mesmoFormato.length){
      // mesma fileira dos irmãos de mesmo formato, depois do último (e de tudo que está ligado a eles)
      const ultimo=mesmoFormato.reduce((m,c)=>(c[6]>m[6]?c:m));
      ny=ultimo[7];
      borde=Math.max(...abaixo.filter(c=>Math.abs(c[7]-ny)<150000).map(extensao));
      nx=borde+60000;
    }else if(abaixo.length){
      // formato diferente dos irmãos (ex.: divisão ligada direto à diretoria): fileira nova,
      // abaixo de tudo que já pende desse pai, centralizada embaixo dele
      const fundo=k=>k[7]+k[9]+(k[10]||k[9]);
      ny=Math.max(...abaixo.flatMap(c=>[c,...descendentes(c[0])]).map(fundo))+250000;
      nx=p[6]+p[8]/2-d[8]/2;
      borde=nx;
    }else{
      nx=p[6]+p[8]/2-d[8]/2;
      borde=nx;
      ny=pFundo+250000;
    }
    const dx=nx-d[6],dy=ny-d[7];
    if(d[6]!==0||d[7]!==0)descendentes(id).forEach(c=>{c[6]+=dx;c[7]+=dy;});
    d[6]=nx;d[7]=ny;
  });
  return vivos;
}
const RAW_EF=orgEstruturaRaw(RAW,ORG_LINHAS);

const nodes=RAW_EF.map(d=>({id:d[0],parent:d[1],kind:d[2],color:d[3],title:d[4],holder:d[5],x:d[6],y:d[7],w:d[8],hh:d[9],bh:d[10]||d[9],sigla:d[11]||d[0].toUpperCase(),corTitulo:d[12]||'',corTexto:d[13]||'',matricula:MATRICULAS[d[0]]||'',children:[]}));
const byId=new Map(nodes.map(n=>[n.id,n]));
nodes.forEach(n=>{if(n.parent&&byId.has(n.parent))byId.get(n.parent).children.push(n.id)});

const collapsed=new Set();
const rendered=new Map();
const canvas=document.getElementById("canvas");
const lineLayer=document.getElementById("lineLayer");
const viewport=document.getElementById("viewport");
const tooltip=document.getElementById("tooltip");
const zoomRange=document.getElementById("zoomRange");
const zoomLabel=document.getElementById("zoomLabel");

function rectFor(n){
  const x=xPx(n.x),y=yPx(n.y),w=xPx(n.w),hh=yPx(n.hh),bh=yPx(n.bh);
  return{x,y,w,hh,bh,h:hh+bh,cx:x+w/2,top:y,bottom:y+hh+bh};
}

function hasCollapsedAncestor(n){
  let p=n.parent;
  while(p){if(collapsed.has(p))return true;p=byId.get(p)?.parent}
  return false;
}
const selectedKinds=new Set();
const selectedNodes=new Set();
let filterVisible=null;
function computeFilterVisible(){
  if(selectedKinds.size===0&&selectedNodes.size===0){filterVisible=null;return;}
  const vis=new Set();
  nodes.forEach(n=>{
    if(!selectedKinds.has(n.kind)&&!selectedNodes.has(n.id))return;
    vis.add(n.id);
    let p=n.parent?byId.get(n.parent):null;
    while(p){vis.add(p.id);p=p.parent?byId.get(p.parent):null;}
    function addDesc(nd){nd.children.forEach(cid=>{const c=byId.get(cid);if(c){vis.add(c.id);addDesc(c);}});}
    addDesc(n);
  });
  filterVisible=vis;
}
function isVisible(n){if(hasCollapsedAncestor(n))return false;if(filterVisible===null)return true;return filterVisible.has(n.id);}

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

// Na caixa só vai o nome e o primeiro sobrenome ("Eneide Thaumaturgo Motta" -> "Eneide
// Thaumaturgo"); partículas ficam com o sobrenome ("Maria da Conceição Almeida" -> "Maria da
// Conceição"). O nome inteiro continua no painel lateral e na busca.
function orgNomeCurto(nome){
  const p=String(nome||'').trim().split(/\s+/).filter(Boolean);
  if(p.length<=2)return p.join(' ');
  const PART=new Set(['da','de','do','das','dos','e']);
  let i=1;
  while(i<p.length-1&&PART.has(p[i].toLowerCase()))i++;
  return p.slice(0,i+1).join(' ');
}
function orgTextoCaixa(holder){
  if(!holder)return '—';
  const linhas=String(holder).split('\n');
  linhas[0]=orgNomeCurto(linhas[0]);
  return linhas.join('\n');
}

// Cor da caixa: uma das cinco do desenho (data-color) ou um #rrggbb escolhido na edição.
function orgTextoSobre(hex){
  // escolhe branco ou preto pelo maior contraste (relação WCAG) com a cor de fundo
  const m=/^#?([0-9a-f]{6})$/i.exec(hex||'');if(!m)return '#fff';
  const v=parseInt(m[1],16);
  const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
  const L=0.2126*lin(v>>16&255)+0.7152*lin(v>>8&255)+0.0722*lin(v&255);
  const comBranco=1.05/(L+0.05), comPreto=(L+0.05)/0.05;
  return comBranco>=comPreto?'#fff':'#111827';
}
/** Cor do título e do texto da caixa escolhidas na edição ('' = automática). */
function orgAplicarTextos(el,n){
  const hdr=el.querySelector('.node-header');
  const body=el.querySelector('.node-body');
  if(hdr){
    // sem cor própria, volta ao automático (branco/escuro conforme o fundo)
    const auto=/^#[0-9a-f]{6}$/i.test(n.color||'')?orgTextoSobre(n.color):'';
    hdr.style.color=n.corTitulo||auto;
  }
  if(body)body.style.color=n.corTexto||'';
}
function orgAplicarCor(el,hdr,cor){
  if(/^#[0-9a-f]{6}$/i.test(cor||'')){
    el.dataset.color='custom';
    el.style.setProperty('--node-bg',cor);
    hdr.style.background='';hdr.style.color=orgTextoSobre(cor);   // cor escolhida: fundo vem de --node-bg
  }else{
    el.dataset.color=cor;
    el.style.removeProperty('--node-bg');
    hdr.style.background='';hdr.style.color='';
  }
}

function createNode(n){
  const r=rectFor(n);
  const el=document.createElement("button");
  el.type="button";el.className="org-node";
  el.dataset.id=n.id;el.dataset.kind=n.kind;el.dataset.color=n.color;
  el.dataset.long=String(n.title.length>42);
  el.style.cssText=`left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--hh:${r.hh}px;--bh:${r.bh}px`;
  const hdr=document.createElement("div");hdr.className="node-header";
  const ttl=document.createElement("span");ttl.className="node-title";ttl.textContent=n.title;hdr.appendChild(ttl);
  orgAplicarCor(el,hdr,n.color);
  orgAplicarTextos(el,n);
  const sg=document.createElement("span");sg.className="node-sigla";sg.textContent=n.sigla;hdr.appendChild(sg);
  if(n.children.length>0){const tg=document.createElement("span");tg.className="node-toggle";tg.textContent="−";hdr.appendChild(tg)}
  const body=document.createElement("div");body.className="node-body";body.textContent=orgTextoCaixa(n.holder);
  el.append(hdr,body);
  const pdfPath=getPDFPath(n.holder);
  if(pdfPath)el.dataset.hasPdf="true";
  el.addEventListener("click",e=>{
    if(window._orgMovido){window._orgMovido=false;e.stopPropagation();return}   // fim de um arrasto, não clique
    if(e.target.closest(".node-toggle")){e.stopPropagation();toggleNode(n);return}
    e.stopPropagation();
    openDetailPanel(n,getPDFPath(n.holder));
  });
  el.addEventListener("mouseenter",e=>showTip(e,n));
  el.addEventListener("mousemove",moveTip);
  el.addEventListener("mouseleave",hideTip);
  canvas.appendChild(el);
  rendered.set(n.id,el);
}

function toggleNode(n){
  if(collapsed.has(n.id))collapsed.delete(n.id);else collapsed.add(n.id);
  refresh();
}

function copyNodeText(n){
  const parts=[n.title];
  if(n.holder)parts.push(n.holder);
  const text=parts.join("\n");
  function fallback(){
    try{
      const ta=document.createElement("textarea");ta.value=text;ta.style.cssText="position:fixed;left:-9999px;opacity:0";
      document.body.appendChild(ta);ta.focus();ta.select();document.execCommand("copy");ta.remove();
    }catch(e){}
    showToast("Texto copiado!");
  }
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=>showToast("Texto copiado!")).catch(fallback);
    }else{fallback()}
  }catch(e){fallback()}
}

let toastTimer=0;
function showToast(msg){
  let t=document.querySelector(".toast");
  if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t)}
  t.textContent=msg;clearTimeout(toastTimer);
  t.classList.add("show");toastTimer=setTimeout(()=>t.classList.remove("show"),2000);
}

function showTip(e,n){
  const parent=n.parent?byId.get(n.parent):null;
  let vinculo='';
  if(parent){
    const chief=parent.holder?parent.holder.split("\n")[0]:null;
    vinculo=`<span class="tip-vinculo">Vinculado a: ${esc(parent.title)}${chief?"<br>Responsável: "+esc(chief):""}</span>`;
  }
  tooltip.innerHTML=`<strong>${esc(n.title)}</strong><span>${esc(n.holder||n.kind)}</span>${vinculo}`;
  tooltip.classList.add("show");moveTip(e);
}
function moveTip(e){
  let l=e.clientX+16,t=e.clientY+16;
  const r=tooltip.getBoundingClientRect();
  if(l+r.width>window.innerWidth)l=e.clientX-r.width-16;
  if(t+r.height>window.innerHeight)t=e.clientY-r.height-16;
  tooltip.style.left=l+"px";tooltip.style.top=t+"px";
}
function hideTip(){tooltip.classList.remove("show")}

const detailPanel=document.getElementById("detailPanel");
const KIND_LABEL={secretaria:"Secretaria",diretoria:"Diretoria","secretaria-adjunta":"Secretaria Adjunta",departamento:"Departamento",divisao:"Divisão",nucleo:"Núcleo",escritorio:"Escritório Local",assessoria:"Assessoria",comissao:"Comissão"};
const KIND_COLOR={secretaria:"#6a1b9a",diretoria:"#c0392b","secretaria-adjunta":"#ffc000",assessoria:"#ffc000",comissao:"#ffc000",departamento:"#4472c4",divisao:"#4771ad",nucleo:"#ed7d31",escritorio:"#888"};

function makeDetailTreeItem(node){
  const wrap=document.createElement("div");wrap.className="detail-tree-item";
  const row=document.createElement("div");row.className="detail-tree-row";
  const kids=node.children.map(id=>byId.get(id)).filter(Boolean);
  let childDiv=null;
  if(kids.length){
    const tog=document.createElement("button");tog.type="button";tog.className="detail-tree-tog";tog.textContent="▶";
    childDiv=document.createElement("div");childDiv.className="detail-tree-children";
    kids.forEach(k=>childDiv.appendChild(makeDetailTreeItem(k)));
    tog.addEventListener("click",e=>{
      e.stopPropagation();
      const open=childDiv.classList.toggle("open");
      tog.textContent=open?"▼":"▶";
    });
    row.appendChild(tog);
  }else{
    const sp=document.createElement("span");sp.className="detail-tree-spacer";row.appendChild(sp);
  }
  const btn=document.createElement("button");btn.className="detail-nav-btn";
  const dot=document.createElement("i");dot.className="detail-sub-dot";dot.style.background=KIND_COLOR[node.kind]||"#888";
  const lbl=document.createElement("span");lbl.textContent=node.title;
  const arr=document.createElement("span");arr.className="detail-nav-arrow";arr.textContent="→";
  btn.appendChild(dot);btn.appendChild(lbl);btn.appendChild(arr);
  btn.addEventListener("click",()=>{panToNode(node);openDetailPanel(node,getPDFPath(node.holder));});
  row.appendChild(btn);
  wrap.appendChild(row);
  if(childDiv)wrap.appendChild(childDiv);
  return wrap;
}

const COPY_ICON='<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 1.5H6a.5.5 0 0 0-.5.5v1H4.5A1.5 1.5 0 0 0 3 5v8.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V5a1.5 1.5 0 0 0-1.5-1.5h-1V2a.5.5 0 0 0-.5-.5zm.5 2V4h-5v-.5h5zM4.5 5h7a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5z"/></svg>';
const CHECK_ICON='<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 3.5L6 11 2.5 7.5 3.5 6.5 6 9l6.5-6.5z"/></svg>';

function copyText(text,btn){
  function done(){
    if(btn){
      btn.innerHTML=CHECK_ICON;btn.classList.add("copiado");
      setTimeout(()=>{btn.innerHTML=COPY_ICON;btn.classList.remove("copiado")},1400);
    }
    showToast("Copiado!");
  }
  function fallback(){
    try{
      const ta=document.createElement("textarea");ta.value=text;ta.style.cssText="position:fixed;left:-9999px;opacity:0";
      document.body.appendChild(ta);ta.focus();ta.select();document.execCommand("copy");ta.remove();
    }catch(e){}
    done();
  }
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    }else{fallback()}
  }catch(e){fallback()}
}

function makeCopyableLine(displayText,copyValue,extraClass){
  const p=document.createElement("p");
  p.className="detail-info-line detail-copyable"+(extraClass?" "+extraClass:"");
  const span=document.createElement("span");
  span.className="detail-copy-text";span.textContent=displayText;
  const btn=document.createElement("button");
  btn.type="button";btn.className="detail-copy-btn";btn.title="Copiar";
  btn.setAttribute("aria-label","Copiar");btn.innerHTML=COPY_ICON;
  btn.addEventListener("click",e=>{e.stopPropagation();copyText(copyValue,btn)});
  p.appendChild(span);p.appendChild(btn);
  return p;
}

function openDetailPanel(n,pdfPath){
  document.getElementById("detailKind").textContent=KIND_LABEL[n.kind]||n.kind;
  document.getElementById("detailKind").style.background=KIND_COLOR[n.kind]||'#888';
  document.getElementById("detailTitle").textContent=n.title;

  const body=document.getElementById("detailBody");
  body.innerHTML='';

  // Servidor responsável
  if(n.holder){
    const sec=makeDetailSection("Servidor responsável","👤");
    const lines=n.holder.split("\n");
    // Nome (primeira linha) em destaque, com ícone de copiar
    const nomeTxt=lines[0].trim();
    sec.appendChild(makeCopyableLine(nomeTxt,nomeTxt,"detail-holder-name"));
    // Matrícula logo abaixo do nome, com ícone de copiar (copia só o número)
    if(n.matricula){
      sec.appendChild(makeCopyableLine("Matrícula: "+n.matricula,n.matricula,"detail-matricula"));
    }
    // Demais linhas (portaria/decreto), com ícone de copiar
    lines.slice(1).forEach(line=>{
      const txt=line.trim();
      sec.appendChild(makeCopyableLine(txt,txt,"detail-portaria"));
    });
    body.appendChild(sec);
  }

  // Vinculado a
  const parent=n.parent?byId.get(n.parent):null;
  if(parent){
    const sec=makeDetailSection("Vinculado a","🔗");
    const btn=document.createElement("button");
    btn.className="detail-nav-btn";
    const dot=document.createElement("i");dot.className="detail-sub-dot";
    dot.style.background=KIND_COLOR[parent.kind]||'#888';
    const lbl=document.createElement("span");
    lbl.textContent=(KIND_LABEL[parent.kind]||parent.kind)+': '+parent.title;
    const arr=document.createElement("span");arr.className="detail-nav-arrow";arr.textContent="→";
    btn.appendChild(dot);btn.appendChild(lbl);btn.appendChild(arr);
    btn.addEventListener("click",()=>{panToNode(parent);openDetailPanel(parent,getPDFPath(parent.holder));});
    sec.appendChild(btn);
    body.appendChild(sec);
  }

  // Setores subordinados (sempre expandidos; cada item tem ▶ para sub-itens)
  const subs=n.children.map(id=>byId.get(id)).filter(Boolean);
  if(subs.length){
    const sec=document.createElement("div");sec.className="detail-section";
    const secHdr=document.createElement("div");secHdr.className="detail-section-title";
    secHdr.textContent="🏢 Setores subordinados ("+subs.length+")";
    sec.appendChild(secHdr);
    const treeWrap=document.createElement("div");treeWrap.className="detail-tree-wrap";
    subs.forEach(c=>treeWrap.appendChild(makeDetailTreeItem(c)));
    sec.appendChild(treeWrap);
    body.appendChild(sec);
  }

  // PDF / Portaria / Decreto
  const decM=n.holder&&n.holder.match(/Decreto\s+N[°oº\.]\s*([\d\.\-P\/]+)/i);
  if(pdfPath){
    const sec=makeDetailSection("Portaria","📄");
    const btnDl=document.createElement("button");
    btnDl.className="detail-pdf-btn";btnDl.textContent="Baixar portaria";
    btnDl.onclick=()=>downloadLink(pdfPath,pdfPath.split("/").pop());
    sec.appendChild(btnDl);
    const btnVer=document.createElement("button");
    btnVer.className="pdf-toggle-btn";btnVer.textContent="Visualizar PDF";
    const portLabel=(()=>{const m=n.holder&&n.holder.match(/Portaria\s+N[ºo°]\s*(\d+\/\d{4})/i);return m?"Portaria "+m[1]:pdfPath.split("/").pop();})();
    btnVer.onclick=()=>openPdfSidePanel(pdfPath,portLabel);
    sec.appendChild(btnVer);
    body.appendChild(sec);
  }else if(decM){
    const sec=makeDetailSection("Decreto","📜");
    const p=document.createElement("p");p.className="detail-info-line detail-portaria";
    p.textContent="Nomeação por Decreto Nº "+decM[1];
    sec.appendChild(p);
    body.appendChild(sec);
  }

  // Linha do tempo (histórico de responsáveis)
  const hist=typeof HISTORICO!=='undefined'?HISTORICO[n.id]:null;
  if(hist&&hist.length>1){
    const sec=makeDetailSection("Histórico de responsáveis","🕐");
    const ul=document.createElement("ul");ul.className="timeline-list";
    hist.forEach((h,i)=>{
      const li=document.createElement("li");li.className="timeline-item";
      const nome=document.createElement("span");nome.className="timeline-nome";nome.textContent=h.nome;
      const port=document.createElement("span");port.className="timeline-port";
      port.textContent="Portaria "+h.portaria+(h.ano?" ("+h.ano+")":"");
      li.appendChild(nome);li.appendChild(port);
      // portaria com PDF na pasta: download direto
      const mh=/^\s*0*(\d+)\s*\/\s*(\d{4})/.exec(String(h.portaria||""));
      const arq=mh?PORTARIA_PDF_N[mh[1]+"/"+mh[2]]:null;
      if(arq){
        const dl=document.createElement("a");dl.className="timeline-baixar";
        dl.href=arq;dl.setAttribute("download",arq.split("/").pop());dl.target="_blank";dl.rel="noopener";
        dl.textContent="⬇ PDF";dl.title="Baixar a portaria";
        li.appendChild(dl);
      }
      ul.appendChild(li);
    });
    sec.appendChild(ul);body.appendChild(sec);
  }

  // Contato — visível para todos se houver número; admin vê também quando vazio
  const tel=(loadContatosAdmin())[n.id]||'';
  if(tel||adminMode){
    const sec=makeDetailSection("Contato","📞");
    if(tel){
      const num=document.createElement("p");
      num.className="detail-info-line";num.textContent=formatTelDisplay(tel);
      sec.appendChild(num);
      const wa=document.createElement("a");
      wa.className="detail-wa-btn";
      wa.innerHTML=WA_ICON+"<span>WhatsApp</span>";
      wa.href=formatWALink(tel);wa.target="_blank";wa.rel="noopener";
      sec.appendChild(wa);
    }else{
      const p=document.createElement("p");p.className="detail-info-line";
      p.style.color="#999";p.textContent="Sem telefone cadastrado";
      sec.appendChild(p);
    }
    body.appendChild(sec);
  }

  if(adminMode&&window.montarEdicaoNo)window.montarEdicaoNo(n,body);

  detailPanel.classList.add("open");
}

function panToNode(n){
  const r=rectFor(n);
  const cx=r.x+r.w/2, cy=r.y+r.h/2;
  const vr=viewport.getBoundingClientRect();
  panX=vr.width/2-cx*scale;
  panY=vr.height/2-cy*scale;
  applyTransform();
}

function makeDetailSection(title,icon){
  const wrap=document.createElement("div");wrap.className="detail-section";
  const hdr=document.createElement("div");hdr.className="detail-section-title";
  hdr.textContent=(icon?icon+' ':'')+title;
  wrap.appendChild(hdr);
  return wrap;
}

document.getElementById("detailClose").addEventListener("click",()=>{
  detailPanel.classList.remove("open");
});
document.getElementById("viewport").addEventListener("click",()=>{
  detailPanel.classList.remove("open");
});
const filterPanel=document.getElementById("filterPanel");
document.getElementById("btnFilter").addEventListener("click",()=>{
  filterPanel.classList.toggle("open");
});
document.getElementById("filterClose").addEventListener("click",()=>{
  filterPanel.classList.remove("open");
});

function addPath(d){
  const p=document.createElementNS("http://www.w3.org/2000/svg","path");
  p.setAttribute("d",d);lineLayer.appendChild(p);
}

function drawLines(){
  lineLayer.replaceChildren();
  const childrenByParent=new Map();
  nodes.forEach(n=>{
    if(!n.parent||!isVisible(n))return;
    const par=byId.get(n.parent);
    if(!par||!isVisible(par))return;
    if(!childrenByParent.has(n.parent))childrenByParent.set(n.parent,[]);
    childrenByParent.get(n.parent).push(n);
  });

  childrenByParent.forEach((children,pid)=>{
    const par=byId.get(pid);
    const pr=rectFor(par);

    if(pid==="del"){
      drawGridLines(pr,children);
      return;
    }

    // Check for horizontal siblings (child top within parent vertical range)
    const below=[];
    const beside=[];
    children.forEach(c=>{
      const cr=rectFor(c);
      if(cr.top<pr.bottom-5) beside.push(c); else below.push(c);
    });

    // Draw horizontal connections
    beside.forEach(c=>{
      const cr=rectFor(c);
      const fromX=cr.cx>pr.cx?pr.x+pr.w:pr.x;
      const toX=cr.cx>pr.cx?cr.x:cr.x+cr.w;
      const midY=(pr.y+pr.h/2+cr.y+cr.h/2)/2;
      addPath(`M ${fromX.toFixed(1)} ${midY.toFixed(1)} H ${toX.toFixed(1)}`);
    });

    // Draw vertical connections using grouped approach
    if(below.length===0)return;

    // SEC children: individual lines only (no horizontal bar between siblings).
    // Route the elbow into the gap just ABOVE each child so the short vertical
    // stub stays in that gap and never runs through the box stacked above it in
    // the same column (fixes the apparent line between ASCOM/PECAFES and
    // OUVID/CPPAS). SEC's centre line sits in the clear gutter between columns.
    if(pid==="sec"){
      below.forEach(c=>{
        const cr=rectFor(c);
        const branchY=cr.top-Math.min(10,(cr.top-pr.bottom)*.4);
        addPath(`M ${pr.cx.toFixed(1)} ${pr.bottom.toFixed(1)} V ${branchY.toFixed(1)} H ${cr.cx.toFixed(1)} V ${cr.top.toFixed(1)}`);
      });
      return;
    }

    if(below.length===1){
      const cr=rectFor(below[0]);
      const gap=Math.max(24,cr.top-pr.bottom);
      const hDist=Math.abs(cr.cx-pr.cx);
      // When child is far to the side, elbow close to parent so horizontal
      // segment stays above sibling connector bars in the gap below.
      const ratio=hDist>50?.15:.5;
      const midY=pr.bottom+gap*ratio;
      addPath(`M ${pr.cx.toFixed(1)} ${pr.bottom.toFixed(1)} V ${midY.toFixed(1)} H ${cr.cx.toFixed(1)} V ${cr.top.toFixed(1)}`);
      return;
    }
    // Group by row (30px tolerance)
    const rows=[];
    below.forEach(c=>{
      const cr=rectFor(c);
      let row=rows.find(r=>Math.abs(r.topY-cr.top)<30);
      if(!row){row={topY:cr.top,nodes:[]};rows.push(row)}
      row.nodes.push({node:c,rect:cr});
    });
    rows.sort((a,b)=>a.topY-b.topY);
    rows.forEach(r=>r.nodes.sort((a,b)=>a.rect.cx-b.rect.cx));

    let trunkX=pr.cx,currentY=pr.bottom;
    rows.forEach(row=>{
      const minTop=Math.min(...row.nodes.map(n=>n.rect.top));
      const gap=Math.max(24,minTop-currentY);
      const barY=currentY+gap*.5;
      addPath(`M ${trunkX.toFixed(1)} ${currentY.toFixed(1)} V ${barY.toFixed(1)}`);
      const leftX=Math.min(trunkX,row.nodes[0].rect.cx);
      const rightX=Math.max(trunkX,row.nodes[row.nodes.length-1].rect.cx);
      if(Math.abs(leftX-rightX)>1)addPath(`M ${leftX.toFixed(1)} ${barY.toFixed(1)} H ${rightX.toFixed(1)}`);
      row.nodes.forEach(({rect})=>{addPath(`M ${rect.cx.toFixed(1)} ${barY.toFixed(1)} V ${rect.top.toFixed(1)}`)});
      currentY=barY;
    });
  });
}

function drawGridLines(pr,children){
  // Group escritórios into rows by Y (200px tolerance in render coords for 2 distinct rows)
  const rows=[];
  children.forEach(c=>{
    const cr=rectFor(c);
    let row=rows.find(r=>Math.abs(r.topY-cr.top)<80);
    if(!row){row={topY:cr.top,nodes:[]};rows.push(row)}
    row.nodes.push({node:c,rect:cr});
  });
  rows.sort((a,b)=>a.topY-b.topY);
  rows.forEach(r=>r.nodes.sort((a,b)=>a.rect.cx-b.rect.cx));

  // Trunk X = parent center (at far left, outside most boxes)
  const trunkX=pr.cx;
  let currentY=pr.bottom;

  rows.forEach(row=>{
    const minTop=Math.min(...row.nodes.map(n=>n.rect.top));
    const gap=Math.max(24,minTop-currentY);
    const barY=minTop-15; // Bar just above the row

    // Trunk segment
    addPath(`M ${trunkX.toFixed(1)} ${currentY.toFixed(1)} V ${barY.toFixed(1)}`);

    // Horizontal bar spanning all nodes in this row
    const leftX=row.nodes[0].rect.cx;
    const rightX=row.nodes[row.nodes.length-1].rect.cx;

    // Connect trunk to bar (if trunk is outside bar range)
    if(trunkX<leftX)addPath(`M ${trunkX.toFixed(1)} ${barY.toFixed(1)} H ${rightX.toFixed(1)}`);
    else if(trunkX>rightX)addPath(`M ${leftX.toFixed(1)} ${barY.toFixed(1)} H ${trunkX.toFixed(1)}`);
    else addPath(`M ${leftX.toFixed(1)} ${barY.toFixed(1)} H ${rightX.toFixed(1)}`);

    // Stubs from bar to each box
    row.nodes.forEach(({rect})=>{addPath(`M ${rect.cx.toFixed(1)} ${barY.toFixed(1)} V ${rect.top.toFixed(1)}`)});

    currentY=barY;
  });
}

function refresh(){
  computeFilterVisible();
  rendered.forEach((el,id)=>{
    const n=byId.get(id);
    el.classList.toggle("hidden",!isVisible(n));
    const tg=el.querySelector(".node-toggle");
    if(tg)tg.textContent=collapsed.has(id)?"+":"−";
  });
  drawLines();
}

// Render all nodes
nodes.forEach(createNode);

// Measure natural height of an element by temporarily removing its fixed height
function naturalH(el){
  el.style.height='auto';
  const h=el.offsetHeight;
  el.style.height='';
  return h;
}

// Ensure header and body content always fits — grow the box if needed
function fitBoxes(){
  rendered.forEach((el,id)=>{
    const n=byId.get(id);
    const hdr=el.querySelector(".node-header");
    const body=el.querySelector(".node-body");

    const neededHdr=naturalH(hdr);
    const curHdr=yPx(n.hh);
    if(neededHdr>curHdr+0.5) n.hh+=(neededHdr-curHdr)/RH*SH;

    if(body){
      const neededBody=naturalH(body);
      const curBody=yPx(n.bh);
      if(neededBody>curBody+0.5) n.bh+=(neededBody-curBody)/RH*SH;
    }

    const r=rectFor(n);
    el.style.height=r.h+"px";
    el.style.setProperty("--hh",r.hh+"px");
    el.style.setProperty("--bh",r.bh+"px");
  });
}
fitBoxes();

// Two shape families: wide/short boxes (org units) vs narrow/tall boxes (divisao/nucleo)
const VERT_KINDS=new Set(["divisao","nucleo"]);
function shapeGroup(kind){return VERT_KINDS.has(kind)?"vert":"horiz"}

// Shrink a title's font-size (only) until its header fits within maxH, without truncating text
function shrinkTitleToFit(hdr,title,maxH){
  let fs=7;
  title.style.fontSize=fs+"px";
  while(naturalH(hdr)>maxH+0.5&&fs>3.5){
    fs-=0.3;
    title.style.fontSize=fs.toFixed(2)+"px";
  }
}

// A couple of committee names are far longer than any other title. Instead of letting
// them inflate every box in the group, cap the standard height from the typical boxes
// and only shrink the title font on these specific outliers so nothing is cropped.
function capOutlierHeights(){
  const OUTLIER_KINDS=new Set(["comissao"]);
  let targetHH=0;
  nodes.forEach(n=>{
    if(shapeGroup(n.kind)==="horiz"&&!OUTLIER_KINDS.has(n.kind)&&n.hh>targetHH) targetHH=n.hh;
  });
  nodes.forEach(n=>{
    if(OUTLIER_KINDS.has(n.kind)&&n.hh>targetHH){
      const el=rendered.get(n.id);
      const hdr=el.querySelector(".node-header");
      const title=hdr.querySelector(".node-title");
      shrinkTitleToFit(hdr,title,yPx(targetHH));
      n.hh=targetHH;
    }
  });
}
capOutlierHeights();

// Equalize width & height of every box within its shape family (horiz vs vert)
function normalizeBoxes(){
  const stats={};
  nodes.forEach(n=>{
    const g=shapeGroup(n.kind);
    if(!stats[g]) stats[g]={hh:0,bh:0,w:0};
    const s=stats[g];
    if(n.hh>s.hh) s.hh=n.hh;
    if(n.bh>s.bh) s.bh=n.bh;
    if(n.w>s.w) s.w=n.w;
  });
  nodes.forEach(n=>{
    const s=stats[shapeGroup(n.kind)];
    const oldCx=n.x+n.w/2;
    n.hh=s.hh; n.bh=s.bh;
    n.w=s.w;
    n.x=oldCx-s.w/2;
    const el=rendered.get(n.id);
    if(el){
      const r=rectFor(n);
      el.style.left=r.x+'px';
      el.style.width=r.w+'px';
      el.style.height=r.h+'px';
      el.style.setProperty('--hh',r.hh+'px');
      el.style.setProperty('--bh',r.bh+'px');
    }
  });
}
normalizeBoxes();

// After width standardization, boxes that used to sit close together in the same
// visual row (regardless of parent) can now touch/overlap. Push them apart in x-order.
function resolveRowOverlaps(){
  const minGapPx=6;
  const crossParentGapPx=20; // larger gap when adjacent nodes have different parents
  const minGapEmu=minGapPx/xPx(1);
  const crossParentGapEmu=crossParentGapPx/xPx(1);
  const byKind=new Map();
  nodes.forEach(n=>{
    if(!byKind.has(n.kind))byKind.set(n.kind,[]);
    byKind.get(n.kind).push(n);
  });
  byKind.forEach(list=>{
    const rows=[];
    list.forEach(c=>{
      let row=rows.find(r=>Math.abs(r.y-c.y)<200000);
      if(!row){row={y:c.y,list:[]};rows.push(row)}
      row.list.push(c);
    });
    rows.forEach(row=>{
      row.list.sort((a,b)=>a.x-b.x);
      for(let i=1;i<row.list.length;i++){
        const prev=row.list[i-1],cur=row.list[i];
        const gap=prev.parent!==cur.parent?crossParentGapEmu:minGapEmu;
        const needed=prev.x+prev.w+gap;
        if(cur.x<needed){
          const shift=needed-cur.x;
          for(let j=i;j<row.list.length;j++)row.list[j].x+=shift;
        }
      }
    });
  });
  nodes.forEach(n=>{
    const el=rendered.get(n.id);
    if(el){const r=rectFor(n);el.style.left=r.x+'px';}
  });
}
resolveRowOverlaps();

// Departments (and other internal nodes) can end up positioned off to the side of
// their own children — so their connector trunk drops down into a SIBLING subtree's
// children and the two horizontal bars overlap, making it look like one department
// owns all the divisions. Center each internal node horizontally over the span of
// its OWN "below" children so every trunk drops into the middle of its own group.
// Processed deepest-first so children settle before their parent is centered.
function centerParentsOverChildren(){
  const depthOf=n=>{let d=0,p=n;while(p&&p.parent){d++;p=byId.get(p.parent)}return d;};
  const parents=nodes.filter(n=>n.children.length>0&&CENTER_KINDS.has(n.kind));
  parents.sort((a,b)=>depthOf(b)-depthOf(a));
  parents.forEach(n=>{
    const pr=rectFor(n);
    const below=n.children.map(id=>byId.get(id)).filter(c=>rectFor(c).top>=pr.bottom-5);
    if(!below.length)return;
    // Skip the escritórios grid parent (children span the whole width; centering
    // it would drop it into the middle and overlap sibling departments).
    if(below.some(c=>c.kind==="escritorio"))return;
    let minL=Infinity,maxR=-Infinity;
    below.forEach(c=>{if(c.x<minL)minL=c.x;if(c.x+c.w>maxR)maxR=c.x+c.w;});
    n.x=(minL+maxR)/2-n.w/2;
  });
  nodes.forEach(n=>{
    const el=rendered.get(n.id);
    if(el){const r=rectFor(n);el.style.left=r.x+'px';}
  });
}
const CENTER_KINDS=new Set(["departamento","diretoria"]);
centerParentsOverChildren();

// Depois de mudar a hierarquia (caixa nova, movida, tipo trocado), grupos de irmãos podem
// ficar em cima um do outro. De baixo para cima, cada grupo de caixas ligadas a um mesmo
// pai é afastado para a direita só o suficiente para não encostar no grupo vizinho
// (caixa contra caixa, na mesma faixa de altura) e o pai volta a ficar centralizado.
// Com o desenho original nada encosta, então nada se mexe.
function packSubtrees(){
  const GAP=4;
  const depthOf=n=>{let d=0,p=n;while(p&&p.parent){d++;p=byId.get(p.parent)}return d;};
  const subtree=n=>{const out=[n];n.children.forEach(id=>{const c=byId.get(id);if(c)out.push(...subtree(c));});return out;};
  const emuPorPx=1/xPx(1);
  const parents=nodes.filter(n=>n.children.length>0).sort((a,b)=>depthOf(b)-depthOf(a));
  parents.forEach(n=>{
    const pr=rectFor(n);
    const below=n.children.map(id=>byId.get(id)).filter(c=>c&&rectFor(c).top>=pr.bottom-5);
    if(n.id!=="del"){
      below.sort((a,b)=>rectFor(a).cx-rectFor(b).cx);
      const fixos=[];
      below.forEach(c=>{
        const grupo=subtree(c);
        let shift=0;
        fixos.forEach(o=>o.forEach(a=>{
          const ra=rectFor(a);
          grupo.forEach(b=>{
            const rb=rectFor(b);
            if(rb.top<ra.bottom+4&&rb.bottom>ra.top-4&&rb.x<ra.x+ra.w+GAP&&rb.x+rb.w>ra.x-GAP){
              const need=ra.x+ra.w+GAP-rb.x;
              if(need>shift)shift=need;
            }
          });
        }));
        if(shift>0)grupo.forEach(b=>{b.x+=shift*emuPorPx;});
        fixos.push(grupo);
      });
    }
    if(CENTER_KINDS.has(n.kind)&&below.length&&!below.some(c=>c.kind==="escritorio")){
      let minL=Infinity,maxR=-Infinity;
      below.forEach(c=>{if(c.x<minL)minL=c.x;if(c.x+c.w>maxR)maxR=c.x+c.w;});
      n.x=(minL+maxR)/2-n.w/2;
    }
  });
  nodes.forEach(n=>{const el=rendered.get(n.id);if(el){const r=rectFor(n);el.style.left=r.x+'px';}});
}

// Box resizing can leave too little vertical room between a parent's bottom edge
// and its children's top edge, so the connector bar ends up drawn inside the child
// box instead of in the gap above it. This also happens BETWEEN stacked rows of
// children under the same parent (e.g. two rows of assessorias). Walk the tree
// top-down, group each parent's "below" children into visual rows, and push each
// row (and everything under it) down as a rigid block until a safe gap is restored.
// Siblings drawn "beside" the parent (same row as the parent itself) are untouched.
function fixVerticalGaps(){
  const MIN_GAP=50;
  const ROW_TOL=30;
  const emuPerPx=1/yPx(1);

  function processNode(n,inheritedShift){
    n.y+=inheritedShift;
    const r=rectFor(n);

    const below=[],beside=[];
    n.children.forEach(cid=>{
      const c=byId.get(cid);
      const simTop=yPx(c.y+inheritedShift);
      (simTop<r.bottom-5?beside:below).push(c);
    });

    beside.forEach(c=>processNode(c,inheritedShift));

    const rows=[];
    below.forEach(c=>{
      const simTop=yPx(c.y+inheritedShift);
      let row=rows.find(rw=>Math.abs(rw.refTop-simTop)<ROW_TOL);
      if(!row){row={refTop:simTop,list:[]};rows.push(row)}
      row.list.push(c);
    });
    rows.sort((a,b)=>a.refTop-b.refTop);

    let cursorBottom=r.bottom;
    rows.forEach(row=>{
      const minTop=Math.min(...row.list.map(c=>yPx(c.y+inheritedShift)));
      const extra=minTop-cursorBottom<MIN_GAP?(MIN_GAP-(minTop-cursorBottom))*emuPerPx:0;
      const rowShift=inheritedShift+extra;
      let rowBottom=-Infinity;
      row.list.forEach(c=>{
        processNode(c,rowShift);
        const cr=rectFor(c);
        if(cr.bottom>rowBottom)rowBottom=cr.bottom;
      });
      cursorBottom=rowBottom;
    });
  }

  nodes.filter(n=>!n.parent).forEach(root=>processNode(root,0));

  nodes.forEach(n=>{
    const el=rendered.get(n.id);
    if(el){const r=rectFor(n);el.style.top=r.y+'px';}
  });
}
fixVerticalGaps();
packSubtrees();   // com as alturas já acertadas

// All the box growth above can push content past the original 2400x1350 canvas
// bounds. Measure the actual content extents, then size the printable frame
// (an A4-landscape ratio, since this is meant to be printed) to fully contain
// everything with a margin, and center the content inside it.
let CANVAS_W=RW,CANVAS_H=RH;
function fitCanvasToContent(){
  const A4_RATIO=297/210;
  const MARGIN=60;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  nodes.forEach(n=>{
    const r=rectFor(n);
    if(r.x<minX)minX=r.x;
    if(r.top<minY)minY=r.top;
    if(r.x+r.w>maxX)maxX=r.x+r.w;
    if(r.bottom>maxY)maxY=r.bottom;
  });
  const contentW=maxX-minX,contentH=maxY-minY;
  CANVAS_W=Math.max(contentW+2*MARGIN,(contentH+2*MARGIN)*A4_RATIO);
  CANVAS_H=CANVAS_W/A4_RATIO;
  const offsetXpx=(CANVAS_W-contentW)/2-minX;
  const offsetYpx=(CANVAS_H-contentH)/2-minY;
  const offsetXemu=offsetXpx/RW*SW;
  const offsetYemu=offsetYpx/RH*SH;
  nodes.forEach(n=>{n.x+=offsetXemu;n.y+=offsetYemu});

  canvas.style.width=CANVAS_W+'px';
  canvas.style.height=CANVAS_H+'px';
  lineLayer.style.width=CANVAS_W+'px';
  lineLayer.style.height=CANVAS_H+'px';

  nodes.forEach(n=>{
    const el=rendered.get(n.id);
    if(el){const r=rectFor(n);el.style.left=r.x+'px';el.style.top=r.y+'px';}
  });
  drawLines();
}
fitCanvasToContent();

// ===== Zoom & Pan =====
let scale=0.7,panX=0,panY=0;
let isDrag=false,dragSX,dragSY,panSX,panSY;

function applyTransform(){
  canvas.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;
  const pct=Math.round(scale*100);
  zoomRange.value=String(pct);
  zoomLabel.textContent=pct+"%";
}

function zoomAt(newScale,px,py){
  newScale=Math.max(.2,Math.min(1.5,newScale));
  const ratio=newScale/scale;
  panX=px-ratio*(px-panX);
  panY=py-ratio*(py-panY);
  scale=newScale;
  applyTransform();
}
function zoomCenter(ns){
  const vr=viewport.getBoundingClientRect();
  zoomAt(ns,vr.width/2,vr.height/2);
}

function fitToScreen(){
  const vr=viewport.getBoundingClientRect();
  const sx=(vr.width-48)/CANVAS_W,sy=(vr.height-48)/CANVAS_H;
  scale=Math.max(.2,Math.min(1,Math.min(sx,sy)));
  panX=(vr.width-CANVAS_W*scale)/2;
  panY=(vr.height-CANVAS_H*scale)/2;
  applyTransform();
}

viewport.addEventListener("wheel",e=>{
  e.preventDefault();
  const vr=viewport.getBoundingClientRect();
  zoomAt(scale+(e.deltaY<0?.05:-.05),e.clientX-vr.left,e.clientY-vr.top);
},{passive:false});

viewport.addEventListener("mousedown",e=>{
  if(e.target.closest(".org-node"))return;
  isDrag=true;dragSX=e.clientX;dragSY=e.clientY;panSX=panX;panSY=panY;
  viewport.classList.add("dragging");e.preventDefault();
});
window.addEventListener("mousemove",e=>{if(!isDrag)return;panX=panSX+(e.clientX-dragSX);panY=panSY+(e.clientY-dragSY);applyTransform()});
window.addEventListener("mouseup",()=>{isDrag=false;viewport.classList.remove("dragging")});

// Touch
let lastDist=0,lastCenter=null;
viewport.addEventListener("touchstart",e=>{
  if(e.target.closest(".org-node"))return;
  if(e.touches.length===1){isDrag=true;dragSX=e.touches[0].clientX;dragSY=e.touches[0].clientY;panSX=panX;panSY=panY}
  else if(e.touches.length===2){isDrag=false;const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;lastDist=Math.sqrt(dx*dx+dy*dy);const vr=viewport.getBoundingClientRect();lastCenter={x:(e.touches[0].clientX+e.touches[1].clientX)/2-vr.left,y:(e.touches[0].clientY+e.touches[1].clientY)/2-vr.top}}
  e.preventDefault();
},{passive:false});
viewport.addEventListener("touchmove",e=>{
  if(e.touches.length===1&&isDrag){panX=panSX+(e.touches[0].clientX-dragSX);panY=panSY+(e.touches[0].clientY-dragSY);applyTransform()}
  else if(e.touches.length===2&&lastDist>0&&lastCenter){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY,dist=Math.sqrt(dx*dx+dy*dy);zoomAt(scale*(dist/lastDist),lastCenter.x,lastCenter.y);lastDist=dist;const vr=viewport.getBoundingClientRect();lastCenter={x:(e.touches[0].clientX+e.touches[1].clientX)/2-vr.left,y:(e.touches[0].clientY+e.touches[1].clientY)/2-vr.top}}
  e.preventDefault();
},{passive:false});
viewport.addEventListener("touchend",()=>{isDrag=false;lastDist=0;lastCenter=null});

// Toolbar
document.getElementById("btnZoomIn").addEventListener("click",()=>zoomCenter(scale+.05));
document.getElementById("btnZoomOut").addEventListener("click",()=>zoomCenter(scale-.05));
zoomRange.addEventListener("input",()=>{zoomCenter(Number(zoomRange.value)/100)});
document.getElementById("btnFit").addEventListener("click",fitToScreen);
document.getElementById("btnExpand").addEventListener("click",()=>{collapsed.clear();refresh()});
document.getElementById("btnCollapse").addEventListener("click",()=>{
  nodes.forEach(n=>{if(n.id!=="sec"&&n.children.length>0)collapsed.add(n.id)});
  refresh();
});

// Init: fully expanded, fit to screen
drawLines();
setTimeout(fitToScreen,60);

// ===== Download =====
function captureCanvas(){
  return new Promise(resolve=>{
    const prevTransform=canvas.style.transform;
    const prevOverflow=canvas.style.overflow;
    const wasCollapsed=[...collapsed];
    collapsed.clear();refresh();
    canvas.style.transform="none";
    canvas.style.overflow="visible";
    setTimeout(()=>{
      html2canvas(canvas,{scale:2,useCORS:true,backgroundColor:"#ffffff",width:CANVAS_W,height:CANVAS_H,windowWidth:CANVAS_W,windowHeight:CANVAS_H}).then(c=>{
        canvas.style.transform=prevTransform;
        canvas.style.overflow=prevOverflow;
        wasCollapsed.forEach(id=>collapsed.add(id));refresh();
        resolve(c);
      });
    },100);
  });
}

// Data da última alteração do organograma: a mais recente troca de responsável (nome/
// portaria) gravada em organograma_ajustes.holder_atualizado_em. Mover caixa não conta;
// sem nenhuma troca, vale a data de modificação da própria página.
let ORG_ULTIMA_ALT=null;
function orgDataAlteracao(){
  if(ORG_ULTIMA_ALT instanceof Date&&!isNaN(ORG_ULTIMA_ALT))return ORG_ULTIMA_ALT;
  const d=new Date(document.lastModified);
  return isNaN(d)?new Date():d;
}
function orgPad(n){return String(n).padStart(2,'0');}
function orgDataBr(d){return orgPad(d.getDate())+'/'+orgPad(d.getMonth()+1)+'/'+d.getFullYear()+' '+orgPad(d.getHours())+':'+orgPad(d.getMinutes());}
function orgDataArq(d){return d.getFullYear()+'-'+orgPad(d.getMonth()+1)+'-'+orgPad(d.getDate());}
/** organograma_alteracao-AAAA-MM-DD_download-AAAA-MM-DD_HHhMM.ext */
function orgNomeArquivo(ext,agora){
  return 'organograma_alteracao-'+orgDataArq(orgDataAlteracao())+
    '_download-'+orgDataArq(agora)+'_'+orgPad(agora.getHours())+'h'+orgPad(agora.getMinutes())+'.'+ext;
}

function downloadLink(url,name){
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
}

document.getElementById("btnJPG").addEventListener("click",()=>{
  const btn=document.getElementById("btnJPG");
  btn.disabled=true;btn.textContent="Gerando...";
  captureCanvas().then(c=>{
    downloadLink(c.toDataURL("image/jpeg",0.95),orgNomeArquivo("jpg",new Date()));
    btn.disabled=false;btn.innerHTML="&#128247; JPG";
  });
});

document.getElementById("btnPDF").addEventListener("click",()=>{
  const btn=document.getElementById("btnPDF");
  btn.disabled=true;btn.textContent="Gerando...";
  captureCanvas().then(c=>{
    const imgData=c.toDataURL("image/jpeg",0.95);
    const pdf=new jspdf.jsPDF({orientation:"landscape",unit:"px",format:[CANVAS_W,CANVAS_H]});
    pdf.addImage(imgData,"JPEG",0,0,CANVAS_W,CANVAS_H);
    // rodapé: última alteração e momento do download (embaixo, no centro, letra pequena)
    const agora=new Date();
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(Math.round(CANVAS_W/150));
    pdf.setTextColor(90,100,115);
    pdf.text("Última alteração: "+orgDataBr(orgDataAlteracao())+"  |  Baixado em: "+orgDataBr(agora),CANVAS_W/2,CANVAS_H-14,{align:"center"});
    pdf.save(orgNomeArquivo("pdf",agora));
    btn.disabled=false;btn.innerHTML="&#128196; PDF";
  });
});

function buildFilterPanel(){
  const container=document.getElementById('filterContent');
  container.innerHTML='';
  const colorMap={purple:'#c0392b',yellow:'#ffc000',blue:'#4472c4',green:'#4771ad',orange:'#ed7d31'};

  // -- Campo de busca --
  const searchWrap=document.createElement('div');
  searchWrap.className='filter-search-wrap';
  const searchInput=document.createElement('input');
  searchInput.type='text';searchInput.className='filter-search';
  searchInput.placeholder='Pesquisar setor...';
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // -- Seção TIPOS --
  const kindSec=document.createElement('div');
  kindSec.className='filter-section';
  kindSec.innerHTML='<div class="filter-section-title">Tipos</div>';
  [
    {kinds:['nucleo'],label:'Núcleos'},
    {kinds:['escritorio'],label:'Escritórios Locais'},
    {kinds:['assessoria','secretaria-adjunta','comissao'],label:'Assessorias'},
  ].forEach(({kinds,label})=>{
    const count=nodes.filter(n=>kinds.includes(n.kind)).length;
    const lbl=document.createElement('label');
    lbl.className='filter-item';
    const chk=document.createElement('input');
    chk.type='checkbox';chk.checked=false;
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(' '+label+' '));
    const badge=document.createElement('span');badge.className='filter-count';badge.textContent='('+count+')';
    lbl.appendChild(badge);
    chk.addEventListener('change',e=>{
      kinds.forEach(k=>e.target.checked?selectedKinds.add(k):selectedKinds.delete(k));
      refresh();
    });
    kindSec.appendChild(lbl);
  });
  container.appendChild(kindSec);

  // -- Seção ESTRUTURA: árvore com expand/collapse por diretoria --
  const treeSec=document.createElement('div');
  treeSec.className='filter-section';

  const masterChk=document.createElement('input');
  masterChk.type='checkbox';masterChk.checked=false;
  const hdrLbl=document.createElement('label');
  hdrLbl.className='filter-section-title filter-section-hdr';
  hdrLbl.appendChild(masterChk);
  const dirCount=nodes.filter(n=>n.kind==='diretoria').length;
  const deptCount=nodes.filter(n=>n.kind==='departamento').length;
  const divCount=nodes.filter(n=>n.kind==='divisao').length;
  hdrLbl.appendChild(document.createTextNode(' Estrutura '));
  const masterBadge=document.createElement('span');masterBadge.className='filter-count';
  masterBadge.textContent='('+dirCount+' dir · '+deptCount+' dep · '+divCount+' div)';
  hdrLbl.appendChild(masterBadge);
  treeSec.appendChild(hdrLbl);

  const treeChks=[];
  const dirWrappers=[];

  function makeItemLabel(n,level){
    const lbl=document.createElement('label');
    lbl.className='filter-item filter-node-item';
    lbl.style.paddingLeft=(8+level*14)+'px';
    lbl.title=n.title;
    const chk=document.createElement('input');
    chk.type='checkbox';chk.checked=false;
    const dot=document.createElement('i');dot.className='filter-dot';
    dot.style.background=colorMap[n.color]||(/^#/.test(n.color)?n.color:'#888');
    lbl.appendChild(chk);lbl.appendChild(dot);
    lbl.appendChild(document.createTextNode(' '+n.sigla));
    chk.addEventListener('change',()=>{
      chk.checked?selectedNodes.add(n.id):selectedNodes.delete(n.id);
      const all=treeChks.every(c=>c.checked),none=treeChks.every(c=>!c.checked);
      masterChk.checked=all;masterChk.indeterminate=!all&&!none;
      refresh();
    });
    treeChks.push(chk);
    return lbl;
  }

  nodes.filter(n=>n.kind==='diretoria').forEach(dir=>{
    const wrapper=document.createElement('div');
    wrapper.className='filter-dir-wrapper';

    // Linha da diretoria com botão de expand
    const dirRow=document.createElement('div');
    dirRow.className='filter-dir-row';

    const toggleBtn=document.createElement('button');
    toggleBtn.type='button';toggleBtn.className='filter-tree-toggle';
    toggleBtn.textContent='▶';toggleBtn.title='Expandir';

    const dirLbl=makeItemLabel(dir,0);
    dirRow.appendChild(toggleBtn);dirRow.appendChild(dirLbl);
    wrapper.appendChild(dirRow);

    // Container dos filhos (recolhido por padrão)
    const childrenDiv=document.createElement('div');
    childrenDiv.className='filter-dir-children';

    const childItems=[];
    dir.children.map(id=>byId.get(id)).filter(c=>c&&c.kind==='departamento').forEach(dept=>{
      const deptLbl=makeItemLabel(dept,1);
      childrenDiv.appendChild(deptLbl);
      childItems.push({n:dept,lbl:deptLbl});
      dept.children.map(id=>byId.get(id)).filter(c=>c&&c.kind==='divisao').forEach(div=>{
        const divLbl=makeItemLabel(div,2);
        childrenDiv.appendChild(divLbl);
        childItems.push({n:div,lbl:divLbl});
      });
    });

    toggleBtn.addEventListener('click',()=>{
      const open=childrenDiv.classList.toggle('open');
      toggleBtn.textContent=open?'▼':'▶';
      toggleBtn.title=open?'Recolher':'Expandir';
    });

    wrapper.appendChild(childrenDiv);
    treeSec.appendChild(wrapper);
    dirWrappers.push({dir,dirLbl,childrenDiv,toggleBtn,childItems,wrapper});
  });

  masterChk.addEventListener('change',()=>{
    treeChks.forEach(chk=>{chk.checked=masterChk.checked;});
    nodes.filter(n=>['diretoria','departamento','divisao'].includes(n.kind))
      .forEach(n=>masterChk.checked?selectedNodes.add(n.id):selectedNodes.delete(n.id));
    masterChk.indeterminate=false;
    refresh();
  });

  container.appendChild(treeSec);

  // -- Busca em tempo real --
  searchInput.addEventListener('input',()=>{
    const q=searchInput.value.toLowerCase().trim();
    if(!q){
      dirWrappers.forEach(({wrapper,childItems,childrenDiv,toggleBtn,dirLbl})=>{
        wrapper.style.display='';
        dirLbl.style.display='';
        childItems.forEach(({lbl})=>lbl.style.display='');
      });
      return;
    }
    dirWrappers.forEach(({dir,dirLbl,childrenDiv,toggleBtn,childItems,wrapper})=>{
      const dirMatch=dir.title.toLowerCase().includes(q)||dir.sigla.toLowerCase().includes(q);
      let anyChild=false;
      childItems.forEach(({n,lbl})=>{
        const m=n.title.toLowerCase().includes(q)||n.sigla.toLowerCase().includes(q);
        lbl.style.display=m?'':'none';
        if(m)anyChild=true;
      });
      wrapper.style.display=(dirMatch||anyChild)?'':'none';
      if(anyChild){
        childrenDiv.classList.add('open');
        toggleBtn.textContent='▼';toggleBtn.title='Recolher';
      }
    });
  });
}
buildFilterPanel();

document.getElementById("btnPrint").addEventListener("click",()=>{
  const canvas=document.getElementById("canvas");
  const vp=document.getElementById("viewport");
  const savedTransform=canvas.style.transform;
  const savedLeft=canvas.style.left;
  const savedTop=canvas.style.top;
  canvas.style.transform="scale(1)";
  canvas.style.left="0px";
  canvas.style.top="0px";
  canvas.style.width=CANVAS_W+"px";
  canvas.style.height=CANVAS_H+"px";
  window.print();
  canvas.style.transform=savedTransform;
  canvas.style.left=savedLeft;
  canvas.style.top=savedTop;
});

// ===== Admin Mode =====
let adminMode=sessionStorage.getItem('seagri_admin')==='1';
const WA_ICON='<svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

// Lê telefones direto do contatos.json (funciona em GH Pages e local)
let CONTATOS_DATA={};
try{CONTATOS_DATA=JSON.parse(localStorage.getItem('seagri_contatos')||'{}')}catch(e){}
fetch('../data/contatos.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{
  if(d&&typeof d==='object'&&Object.keys(d).length>0){
    CONTATOS_DATA=d;try{localStorage.setItem('seagri_contatos',JSON.stringify(d))}catch(e){}
  }
}).catch(()=>{});
const TEL_AJUSTES={};   // telefones ajustados pelo modo admin (tabela organograma_ajustes)
function loadContatosAdmin(){return Object.assign({},CONTATOS_DATA,TEL_AJUSTES);}
function formatWALink(tel){const d=tel.replace(/\D/g,'');if(!d)return'#';return'https://wa.me/'+(d.startsWith('55')&&d.length>=12?d:'55'+d);}
function formatTelDisplay(tel){const d=tel.replace(/\D/g,'');if(d.length===11)return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;if(d.length===10)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return tel;}

function updateAdminBtn(){
  document.body.classList.toggle('org-admin',adminMode);
  ['btnDesfazer','btnVersoes'].forEach(id=>{const b=document.getElementById(id);if(b)b.hidden=!adminMode;});
  const btn=document.getElementById('btnAdmin');
  if(adminMode){btn.textContent='Admin ✓';btn.classList.add('admin-ativo')}
  else{btn.textContent='Admin';btn.classList.remove('admin-ativo')}
}
updateAdminBtn();

const adminOverlay=document.getElementById('adminOverlay');
const adminPwdInput=document.getElementById('adminPwdInput');
const adminErr=document.getElementById('adminErr');

function openAdminModal(){
  if(adminMode){
    adminMode=false;
    sessionStorage.removeItem('seagri_admin');
    updateAdminBtn();
    showToast('Modo admin desativado');
    return;
  }
  adminPwdInput.value='';
  adminErr.textContent='';
  adminOverlay.classList.add('show');
  setTimeout(()=>adminPwdInput.focus(),80);
}

const ADMIN_HASH='8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
function submitAdminPwd(){
  const v=adminPwdInput.value;
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)).then(buf=>{
    const hex=Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hex===ADMIN_HASH){
      adminMode=true;
      sessionStorage.setItem('seagri_admin','1');
      updateAdminBtn();
      adminOverlay.classList.remove('show');
      showToast('Modo admin ativado — arraste as caixas para mover e clique para editar');
    }else{
      adminErr.textContent='Senha incorreta. Tente novamente.';
      adminPwdInput.value='';adminPwdInput.focus();
    }
  });
}

document.getElementById('btnAdmin').addEventListener('click',openAdminModal);
document.getElementById('adminOk').addEventListener('click',submitAdminPwd);
document.getElementById('adminCancel').addEventListener('click',()=>adminOverlay.classList.remove('show'));
adminPwdInput.addEventListener('keydown',e=>{if(e.key==='Enter')submitAdminPwd();if(e.key==='Escape')adminOverlay.classList.remove('show');});
adminOverlay.addEventListener('click',e=>{if(e.target===adminOverlay)adminOverlay.classList.remove('show');});

// ===== Ajustes do organograma (modo Admin): mover caixas e editar o responsável =====
// Gravados na tabela organograma_ajustes (database/organograma-ajustes.sql): todo
// mundo lê; só a conta responsável grava (política do banco).
const ORG_ORIGINAL=new Map();   // id -> valores do desenho original (para "restaurar")
RAW.forEach(d=>ORG_ORIGINAL.set(d[0],{holder:d[5],matricula:MATRICULAS[d[0]]||'',parent:d[1],title:d[4],kind:d[2],color:d[3],sigla:d[0].toUpperCase()}));

function orgCfg(){return window.BANCO_CONFIG||{};}
function orgUrl(){return (orgCfg().url||'').replace(/\/$/,'')+'/rest/v1/organograma_ajustes';}

/** Cabeçalho com a sessão do login do site (só a conta responsável grava). */
async function orgCabecalhoAuth(){
  const auth=window.ADMIN_AUTH;
  const sessao=auth&&auth.garantirSessao?await auth.garantirSessao().catch(()=>null):null;
  if(!sessao||!sessao.access_token)throw new Error('Sua sessão expirou. Recarregue a página e entre de novo.');
  return {apikey:orgCfg().chavePublica,Authorization:'Bearer '+sessao.access_token,'Content-Type':'application/json'};
}

/** Atualiza o cache local com o que acabou de ser gravado (a próxima carga já desenha certo). */
function orgCacheMesclar(linhas){
  const cache=orgLerCache();
  linhas.forEach(l=>{
    const i=cache.findIndex(c=>c.id===l.id);
    if(i>=0)cache[i]={...cache[i],...l};else cache.push({...l});
  });
  orgGuardarCache(cache);
}
/** Chama uma função do banco (RPC) com a sessão do responsável. */
async function orgRpc(nome,corpo){
  const h=await orgCabecalhoAuth();
  const r=await fetch((orgCfg().url||'').replace(/\/$/,'')+'/rest/v1/rpc/'+nome,{method:'POST',headers:h,body:JSON.stringify(corpo||{})});
  let json=null;try{json=await r.json();}catch(e){}
  if(r.status===401||r.status===403)throw new Error('Só a conta do responsável pode alterar o organograma.');
  if(!r.ok){
    const m=json&&(json.message||json.hint);
    const e=new Error(m||('Não foi possível concluir (HTTP '+r.status+').'));
    e.status=r.status;throw e;
  }
  return json;
}

/** Grava as linhas; antes guarda uma versão (para desfazer / recuperar). */
async function orgGravarLote(linhas,descricao){
  const h=await orgCabecalhoAuth();
  const email=(window.ADMIN_AUTH.sessaoAtual()?.user?.email)||'';
  try{
    await orgRpc('organograma_salvar_versao',{p_descricao:descricao||'Alteração'});
  }catch(e){
    // histórico ainda não instalado no banco: segue sem ele; qualquer outro erro interrompe
    if(e.status!==404)throw e;
  }
  const agora=new Date().toISOString();
  const r=await fetch(orgUrl()+'?on_conflict=id',{
    method:'POST',
    headers:{...h,Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(linhas.map(l=>({...l,atualizado_em:agora,atualizado_por:email})))
  });
  if(r.status===401||r.status===403)throw new Error('Só a conta do responsável pode salvar alterações no organograma.');
  if(!r.ok)throw new Error('Não foi possível salvar (HTTP '+r.status+').');
  orgCacheMesclar(linhas);
}

async function orgGravar(id,campos,descricao){
  return orgGravarLote([{id,...campos}],descricao);
}

/** Depois de desfazer/restaurar: traz o estado do banco para o cache e redesenha. */
async function orgRecarregarDoBanco(){
  const c=orgCfg();
  const r=await fetch(orgUrl()+'?select=*',{headers:{apikey:c.chavePublica},cache:'no-store'});
  if(r.ok){const linhas=await r.json();if(Array.isArray(linhas))orgGuardarCache(linhas);}
  try{sessionStorage.removeItem('seagri_org_reload');}catch(e){}
  location.reload();
}

async function orgDesfazer(){
  const b=document.getElementById('btnDesfazer');
  if(b)b.disabled=true;
  try{
    await orgRpc('organograma_desfazer');
    showToast('Alteração desfeita');
    await orgRecarregarDoBanco();
  }catch(err){
    showToast(err.message);
    if(b)b.disabled=false;
  }
}

function orgQuando(iso){
  const d=new Date(iso);
  return isNaN(d)?'':orgPad(d.getDate())+'/'+orgPad(d.getMonth()+1)+'/'+d.getFullYear()+' '+orgPad(d.getHours())+':'+orgPad(d.getMinutes());
}

async function orgAbrirVersoes(){
  const ov=document.getElementById('versoesOverlay');
  const lista=document.getElementById('versoesLista');
  lista.textContent='Carregando…';
  ov.classList.add('show');
  try{
    const h=await orgCabecalhoAuth();
    const r=await fetch((orgCfg().url||'').replace(/\/$/,'')+'/rest/v1/organograma_versoes?select=id,criado_em,criado_por,descricao&order=id.desc&limit=80',{headers:h,cache:'no-store'});
    if(!r.ok)throw new Error(r.status===404?'O histórico ainda não foi instalado no banco (database/organograma-ajustes.sql).':'Não foi possível carregar as versões (HTTP '+r.status+').');
    const itens=await r.json();
    lista.textContent='';
    if(!itens.length){lista.textContent='Nenhuma alteração guardada ainda.';return;}
    itens.forEach(v=>{
      const linha=document.createElement('div');linha.className='versao-item';
      const info=document.createElement('div');info.className='versao-info';
      const t=document.createElement('b');t.textContent='Antes de: '+(String(v.descricao||'alteração').replace(/^Antes de /i,''));
      const m=document.createElement('small');
      m.textContent=orgQuando(v.criado_em)+' · '+String(v.criado_por||'').split('@')[0];
      info.append(t,m);
      const bt=document.createElement('button');bt.type='button';bt.className='versao-voltar';bt.textContent='Voltar a este ponto';
      bt.addEventListener('click',async()=>{
        const ok=await window.Modal.confirmar({
          titulo:'Voltar a esta versão',
          mensagem:'O organograma volta ao estado de '+orgQuando(v.criado_em)+' (antes de: '+(v.descricao||'alteração')+').\n\nO estado de agora fica guardado na lista, então dá para voltar atrás.',
          confirmar:'Voltar a este ponto'
        });
        if(!ok)return;
        bt.disabled=true;
        try{
          await orgRpc('organograma_restaurar',{p_versao:v.id});
          showToast('Versão restaurada');
          await orgRecarregarDoBanco();
        }catch(err){showToast(err.message);bt.disabled=false;}
      });
      linha.append(info,bt);lista.appendChild(linha);
    });
  }catch(err){lista.textContent=err.message;}
}

document.getElementById('btnDesfazer').addEventListener('click',orgDesfazer);
document.getElementById('btnVersoes').addEventListener('click',orgAbrirVersoes);
// Volta o desenho ao original (como no PDF): zera posição, hierarquia, tipo, cor, título e sigla,
// e apaga as caixas novas. Nomes, matrículas e telefones editados continuam. Fica na lista de versões.
document.getElementById('versoesOriginal').addEventListener('click',async()=>{
  const ok=await window.Modal.confirmar({
    titulo:'Voltar ao layout original',
    mensagem:'Todas as caixas voltam para a posição, o nível, o tipo e a cor do desenho original, e as caixas novas são removidas.\n\nNomes, matrículas e telefones editados continuam. O estado de agora fica guardado em Versões.',
    confirmar:'Voltar ao original'
  });
  if(!ok)return;
  try{
    const h=await orgCabecalhoAuth();
    await orgRpc('organograma_salvar_versao',{p_descricao:'Antes de voltar ao layout original'});
    const base=orgUrl();
    let r=await fetch(base+'?novo=eq.true',{method:'DELETE',headers:h});
    if(!r.ok)throw new Error('Não foi possível remover as caixas novas (HTTP '+r.status+').');
    r=await fetch(base+'?novo=eq.false',{method:'PATCH',headers:{...h,Prefer:'return=minimal'},
      body:JSON.stringify({dx:null,dy:null,parent_id:null,tipo:null,cor:null,titulo:null,sigla:null,cor_titulo:null,cor_texto:null,removido:false})});
    if(!r.ok)throw new Error('Não foi possível restaurar o layout (HTTP '+r.status+').');
    showToast('Layout original restaurado');
    await orgRecarregarDoBanco();
  }catch(err){showToast(err.message);}
});
document.getElementById('versoesFechar').addEventListener('click',()=>document.getElementById('versoesOverlay').classList.remove('show'));
document.getElementById('versoesOverlay').addEventListener('click',e=>{if(e.target.id==='versoesOverlay')e.target.classList.remove('show');});
// Ctrl+Z desfaz a última alteração (fora de campos de texto)
document.addEventListener('keydown',e=>{
  if(!adminMode||!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||e.shiftKey)return;
  const t=e.target;
  if(t&&(/^(input|textarea|select)$/i.test(t.tagName)||t.isContentEditable))return;
  e.preventDefault();orgDesfazer();
});

/** Texto da caixa sem estourar: reduz a fonte do corpo até caber. */
function orgAjustarCorpo(n){
  const el=rendered.get(n.id);if(!el)return;
  const body=el.querySelector('.node-body');if(!body)return;
  body.textContent=orgTextoCaixa(n.holder);
  body.style.fontSize='';
  let fs=parseFloat(getComputedStyle(body).fontSize)||7;
  while(body.scrollHeight>body.clientHeight+1&&fs>4){fs-=.5;body.style.fontSize=fs+'px';}
  el.dataset.hasPdf=getPDFPath(n.holder||'')?'true':'';
  if(!el.dataset.hasPdf)delete el.dataset.hasPdf;
}

function orgPosicionar(n){
  const el=rendered.get(n.id);if(!el)return;
  const r=rectFor(n);el.style.left=r.x+'px';el.style.top=r.y+'px';
}

/** Posição de cada caixa depois do desenho automático (base dos deslocamentos). */
const ORG_BASE=new Map();
nodes.forEach(n=>ORG_BASE.set(n.id,{x:n.x,y:n.y}));

function orgDeslocamento(n){
  const b=ORG_BASE.get(n.id);
  return {dx:Math.round(xPx(n.x-b.x)*10)/10,dy:Math.round(yPx(n.y-b.y)*10)/10};
}

// carrega os ajustes salvos (leitura pública)
(function carregarAjustes(){
  const c=orgCfg();if(!c.url||!c.chavePublica)return;
  fetch(orgUrl()+'?select=id,holder,matricula,telefone,dx,dy,holder_atualizado_em,parent_id,titulo,sigla,cor,tipo,removido,novo,cor_titulo,cor_texto',{headers:{apikey:c.chavePublica},cache:'no-store'})
    .then(r=>r.ok?r.json():null).then(linhas=>{
      if(!Array.isArray(linhas))return;
      orgGuardarCache(linhas);
      const sig=orgAssinatura(linhas);
      if(sig!==ORG_ASSINATURA_BUILD){
        // a estrutura salva mudou desde a última visita: desenha de novo, uma vez só
        if(sessionStorage.getItem('seagri_org_reload')!==sig){
          sessionStorage.setItem('seagri_org_reload',sig);
          location.reload();
          return;
        }
      }
      let mudouPos=false;
      (linhas||[]).forEach(a=>{
        const t=a.holder_atualizado_em?new Date(a.holder_atualizado_em):null;   // só troca de nome conta
        if(t&&!isNaN(t)&&(!ORG_ULTIMA_ALT||t>ORG_ULTIMA_ALT))ORG_ULTIMA_ALT=t;
        const n=byId.get(a.id);if(!n)return;
        if(a.holder!=null){n.holder=a.holder;}
        if(a.matricula!=null){n.matricula=a.matricula;}
        if(a.telefone!=null&&a.telefone!==''){TEL_AJUSTES[n.id]=a.telefone;}
        if(a.holder!=null)orgAjustarCorpo(n);
        if(a.dx!=null||a.dy!=null){
          const b=ORG_BASE.get(n.id);
          n.x=b.x+(Number(a.dx)||0)*SW/RW;
          n.y=b.y+(Number(a.dy)||0)*SH/RH;
          orgPosicionar(n);mudouPos=true;
        }
      });
      if(mudouPos)drawLines();
    }).catch(()=>{});
})();

// depois de uma recarga causada por edição de estrutura, reabre a caixa mexida
(function reabrir(){
  let id=null;
  try{id=sessionStorage.getItem('seagri_org_abrir');sessionStorage.removeItem('seagri_org_abrir');}catch(e){}
  const n=id&&byId.get(id);
  if(n)setTimeout(()=>{panToNode(n);openDetailPanel(n,getPDFPath(n.holder));},250);
})();

// ---- mover caixas (só com o modo Admin ligado; Shift leva a subárvore junto)
function orgSubarvore(n){
  const out=[n];
  n.children.forEach(id=>{const c=byId.get(id);if(c)out.push(...orgSubarvore(c));});
  return out;
}
let orgArrasto=null;
viewport.addEventListener('mousedown',e=>{
  if(!adminMode||e.button!==0)return;
  const el=e.target.closest('.org-node');
  if(!el||e.target.closest('.node-toggle'))return;
  const n=byId.get(el.dataset.id);if(!n)return;
  const grupo=e.shiftKey?orgSubarvore(n):[n];
  orgArrasto={n,sx:e.clientX,sy:e.clientY,moveu:false,grupo,orig:grupo.map(g=>({g,x:g.x,y:g.y}))};
});
window.addEventListener('mousemove',e=>{
  if(!orgArrasto)return;
  const dxs=e.clientX-orgArrasto.sx,dys=e.clientY-orgArrasto.sy;
  if(!orgArrasto.moveu){
    if(Math.hypot(dxs,dys)<5)return;
    orgArrasto.moveu=true;hideTip();
    document.body.classList.add('org-arrastando');
  }
  const dx=dxs/scale*SW/RW,dy=dys/scale*SH/RH;
  orgArrasto.orig.forEach(o=>{o.g.x=o.x+dx;o.g.y=o.y+dy;orgPosicionar(o.g);});
  drawLines();
});
window.addEventListener('mouseup',()=>{
  const a=orgArrasto;orgArrasto=null;
  document.body.classList.remove('org-arrastando');
  if(!a||!a.moveu)return;
  window._orgMovido=true;                 // o "click" que vem logo depois não abre o painel
  setTimeout(()=>{window._orgMovido=false;},0);
  orgGravarLote(a.grupo.map(g=>({id:g.id,...orgDeslocamento(g)})),'Moveu "'+a.n.title+'"'+(a.grupo.length>1?' e '+(a.grupo.length-1)+' caixa(s) ligada(s)':''))
    .then(()=>showToast(a.grupo.length>1?'Posições salvas':'Posição salva'))
    .catch(err=>showToast(err.message));
});

// "416" ou "416/2026" vira "Portaria Nº 416/2026" (ano atual quando não digitado).
// "Decreto 1.855-P/2023" e textos já completos ficam como estão, só com o "Nº" padronizado.
function orgFormatarAto(v){
  let t=String(v||'').trim().replace(/\s+/g,' ');
  if(!t)return '';
  const ano=String(new Date().getFullYear());
  let m=/^(\d{1,4})$/.exec(t);
  if(m)return 'Portaria Nº '+m[1]+'/'+ano;
  m=/^(\d{1,4})\s*\/\s*(\d{2}|\d{4})$/.exec(t);
  if(m)return 'Portaria Nº '+m[1]+'/'+(m[2].length===2?'20'+m[2]:m[2]);
  m=/^(portaria|decreto)\s*(?:n[ºo°.]*)?\s*(.+)$/i.exec(t);
  if(m){
    let resto=m[2].trim();
    const so=/^(\d{1,4})$/.exec(resto);
    if(so)resto=so[1]+'/'+ano;
    const tipo=m[1].charAt(0).toUpperCase()+m[1].slice(1).toLowerCase();
    return tipo+' Nº '+resto;
  }
  return t;
}

// ---- formulário de edição no painel lateral
// Regras da estrutura:
//  - divisão não recebe caixa abaixo;
//  - Secretária, Secretário Adjunto e os setores ligados ao gabinete (assessorias, comissões e o que
//    estiver abaixo de um gabinete) têm o nível fixo: nada é colocado acima deles nem mudam de pai.
function orgNivelFixo(n){
  if(n.kind==='secretaria'||n.kind==='secretaria-adjunta'||n.kind==='assessoria'||n.kind==='comissao')return true;
  for(let p=n.parent?byId.get(n.parent):null,i=0;p&&i<60;p=p.parent?byId.get(p.parent):null,i++){
    if(p.id==='gab'||p.id==='gabsecad')return true;
  }
  return false;
}
function orgPodeAdicionarAbaixo(n){return n.kind!=='divisao';}

const ORG_COR_PRESETS={purple:'#6a1b9a',yellow:'#ffc000',blue:'#4472c4',green:'#4771ad',orange:'#c95c14'};
// tipo da caixa -> tipos de "pai" que ele já tem no organograma original
const ORG_PAIS_VALIDOS={};
RAW.forEach(d=>{
  const pai=d[1]?RAW.find(x=>x[0]===d[1]):null;
  if(!pai)return;
  (ORG_PAIS_VALIDOS[d[2]]=ORG_PAIS_VALIDOS[d[2]]||new Set()).add(pai[2]);
});
const ORG_FILHO_TIPO={secretaria:'diretoria','secretaria-adjunta':'assessoria',diretoria:'departamento',departamento:'divisao',divisao:'nucleo',nucleo:'nucleo',assessoria:'assessoria',comissao:'comissao',escritorio:'escritorio'};

function orgDescendentesIds(n){
  const out=new Set();
  (function rec(x){x.children.forEach(id=>{const c=byId.get(id);if(c&&!out.has(c.id)){out.add(c.id);rec(c);}});})(n);
  return out;
}

/** Nome do setor, sigla, tipo, cor e "vinculado a" — devolve leitura() com o que está no formulário. */
function orgBlocoEstrutura(n,sec){
  const campo=(rot,ctl)=>{
    const l=document.createElement('label');l.className='org-edit-campo';
    const t=document.createElement('span');t.textContent=rot;
    l.append(t,ctl);sec.appendChild(l);return ctl;
  };
  const iTitulo=document.createElement('input');iTitulo.type='text';iTitulo.value=n.title;iTitulo.autocomplete='off';
  campo('Nome do setor',iTitulo);
  const iSigla=document.createElement('input');iSigla.type='text';iSigla.value=n.sigla;iSigla.maxLength=14;iSigla.autocomplete='off';
  iSigla.addEventListener('input',()=>{iSigla.value=iSigla.value.toUpperCase();});
  campo('Sigla',iSigla);
  const sTipo=document.createElement('select');
  Object.keys(KIND_LABEL).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=KIND_LABEL[k];sTipo.appendChild(o);});
  sTipo.value=n.kind;
  campo('Tipo (define o formato da caixa)',sTipo);

  // cor: só as que já existem no organograma (as cinco do desenho + as que algum setor usa hoje).
  // Ao trocar, vale também para todas as caixas abaixo.
  let cor=n.color;
  const corWrap=document.createElement('div');corWrap.className='org-edit-cores';
  const NOMES_COR={purple:'Roxo',yellow:'Amarelo',blue:'Azul',green:'Azul-aço',orange:'Laranja','#2f855a':'Verde'};
  const emUso=[];
  Object.keys(ORG_COR_PRESETS).forEach(k=>emUso.push(k));
  nodes.forEach(x=>{if(x.color&&emUso.indexOf(x.color)<0)emUso.push(x.color);});
  if(cor&&emUso.indexOf(cor)<0)emUso.push(cor);
  const valorCor=k=>ORG_COR_PRESETS[k]||k;
  const marcar=()=>corWrap.querySelectorAll('.org-cor').forEach(b=>b.classList.toggle('on',b.dataset.cor===cor));
  emUso.forEach(k=>{
    const b=document.createElement('button');b.type='button';b.className='org-cor';b.dataset.cor=k;
    b.style.background=valorCor(k);b.title=NOMES_COR[k]||k;b.setAttribute('aria-label',NOMES_COR[k]||k);
    b.addEventListener('click',()=>{cor=k;marcar();});
    corWrap.appendChild(b);
  });
  const lc=document.createElement('div');lc.className='org-edit-campo';
  const tc=document.createElement('span');tc.textContent='Cor da caixa';
  lc.append(tc,corWrap);
  if(n.children.length){
    const dicaCor=document.createElement('small');dicaCor.className='org-edit-dica';
    dicaCor.textContent=n.parent?'A cor escolhida vale também para todas as caixas abaixo desta.':'Na secretaria, a cor vale só para ela (cada grupo abaixo mantém a sua).';
    lc.appendChild(dicaCor);
  }
  sec.appendChild(lc);
  marcar();

  // cor do texto: do título (cabeçalho) e do nome/portaria (corpo). '' = automática.
  const TEXTOS_TITULO=[['', 'Automática','#ffffff'],['#ffffff','Branco','#ffffff'],['#111827','Preto','#111827'],['#fff3b0','Amarelo claro','#fff3b0'],['#e5e7eb','Cinza claro','#e5e7eb']];
  const TEXTOS_CORPO=[['', 'Automática','#0f172a'],['#0f172a','Preto','#0f172a'],['#475569','Cinza escuro','#475569'],['#1e3a8a','Azul-marinho','#1e3a8a'],['#14532d','Verde-escuro','#14532d'],['#7f1d1d','Vinho','#7f1d1d']];
  let corTitulo=n.corTitulo||'', corTexto=n.corTexto||'';
  const fileira=(rotulo,opcoes,valorInicial,aoMudar)=>{
    const wrap=document.createElement('div');wrap.className='org-edit-cores';
    let atual=valorInicial;
    const marcarT=()=>wrap.querySelectorAll('.org-cor').forEach(b=>b.classList.toggle('on',b.dataset.cor===atual));
    opcoes.forEach(o=>{
      const b=document.createElement('button');b.type='button';b.className='org-cor org-cor-texto'+(o[0]===''?' org-cor-auto':'');
      b.dataset.cor=o[0];b.title=o[1];b.setAttribute('aria-label',o[1]);
      if(o[0]!=='')b.style.background=o[2];else b.textContent='A';
      b.addEventListener('click',()=>{atual=o[0];aoMudar(o[0]);marcarT();});
      wrap.appendChild(b);
    });
    marcarT();
    const l=document.createElement('div');l.className='org-edit-campo';
    const t=document.createElement('span');t.textContent=rotulo;
    l.append(t,wrap);sec.appendChild(l);
  };
  fileira('Cor do título',TEXTOS_TITULO,corTitulo,v=>{corTitulo=v;});
  fileira('Cor do texto (nome e portaria)',TEXTOS_CORPO,corTexto,v=>{corTexto=v;});

  // hierarquia: só aparecem como "nível acima" os tipos que, no organograma, já têm esse tipo
  // de caixa abaixo deles (ex.: divisão fica sob departamento) — mantém o desenho coerente.
  // Para ligar a outro nível, mude antes o Tipo da caixa.
  const sPai=document.createElement('select');
  const bloqueados=orgDescendentesIds(n);bloqueados.add(n.id);
  const montarPais=()=>{
    const aceitos=ORG_PAIS_VALIDOS[sTipo.value];
    const atual=sPai.value||n.parent;
    sPai.innerHTML='';
    nodes.filter(x=>!bloqueados.has(x.id)&&(x.id===n.parent||!aceitos||aceitos.has(x.kind))).forEach(x=>{
      const o=document.createElement('option');o.value=x.id;
      o.textContent=(KIND_LABEL[x.kind]||x.kind)+' — '+x.title.replace(/\s+/g,' ').slice(0,60);
      sPai.appendChild(o);
    });
    if([...sPai.options].some(o=>o.value===atual))sPai.value=atual;
  };
  if(n.parent){
    montarPais();
    campo('Vinculado a (nível acima)',sPai);
    sTipo.addEventListener('change',montarPais);
    if(orgNivelFixo(n)){
      sPai.disabled=true;sTipo.disabled=true;
      const dica=document.createElement('small');dica.className='org-edit-dica';
      dica.textContent='O nível deste setor é fixo (secretaria, adjunto e gabinete): não dá para colocar nada acima dele nem mudá-lo de lugar na hierarquia.';
      sPai.parentNode.appendChild(dica);
    }
  }else{
    sTipo.disabled=true;   // a raiz não muda de tipo
  }
  return {leitura:()=>({
    titulo:iTitulo.value.trim().replace(/\s+/g,' ')||n.title,
    sigla:iSigla.value.trim()||n.sigla,
    tipo:sTipo.disabled?n.kind:sTipo.value,
    cor,
    corTitulo,corTexto,
    parent:(n.parent&&!sPai.disabled)?sPai.value:null
  })};
}

/** Mostra a caixa nova/atualizada na hora (nome, sigla e cor); tipo e hierarquia pedem redesenho. */
function orgAtualizarVisual(n){
  const el=rendered.get(n.id);if(!el)return;
  const t=el.querySelector('.node-title');if(t)t.textContent=n.title;
  const sg=el.querySelector('.node-sigla');if(sg)sg.textContent=n.sigla;
  orgAplicarCor(el,el.querySelector('.node-header'),n.color);
  orgAplicarTextos(el,n);
  el.dataset.long=String(n.title.length>42);
}

function orgRecarregarAbrindo(id){
  try{sessionStorage.setItem('seagri_org_abrir',id);}catch(e){}
  location.reload();
}

window.montarEdicaoNo=function(n,body){
  const sec=makeDetailSection('Editar (modo admin)','✏️');
  const linhas=(n.holder||'').split('\n');
  const campo=(rot,valor,ph)=>{
    const l=document.createElement('label');l.className='org-edit-campo';
    const t=document.createElement('span');t.textContent=rot;
    const i=document.createElement('input');i.type='text';i.value=valor||'';i.placeholder=ph||'';i.autocomplete='off';
    l.append(t,i);sec.appendChild(l);return i;
  };
  const estrutura=orgBlocoEstrutura(n,sec);
  const iNome=campo('Servidor responsável',linhas[0]||'','Nome completo');
  // Nome + tipo do ato (Portaria/Decreto) + número: a caixa mostra "Portaria Nº 416/2026"
  const atoAtual=(linhas.slice(1).join(' ').trim());
  const mAto=/^(portaria|decreto)\s*(?:n[ºo°.]*)?\s*(.*)$/i.exec(atoAtual);
  const rowAto=document.createElement('div');rowAto.className='org-edit-ato';
  const lTipo=document.createElement('label');lTipo.className='org-edit-campo';
  const tTipo=document.createElement('span');tTipo.textContent='Tipo do ato';
  const iTipo=document.createElement('select');
  ['Portaria','Decreto'].forEach(t=>{const o=document.createElement('option');o.textContent=t;iTipo.appendChild(o);});
  iTipo.value=mAto&&/^decreto$/i.test(mAto[1])?'Decreto':'Portaria';
  lTipo.append(tTipo,iTipo);
  const lNum=document.createElement('label');lNum.className='org-edit-campo';
  const tNum=document.createElement('span');tNum.textContent='Número';
  const iAto=document.createElement('input');iAto.type='text';iAto.autocomplete='off';
  iAto.value=mAto?mAto[2].trim():atoAtual;
  iAto.placeholder='Ex.: 416 ou 416/2026';
  lNum.append(tNum,iAto);
  rowAto.append(lTipo,lNum);
  sec.appendChild(rowAto);
  const prevAto=document.createElement('small');prevAto.className='org-edit-previa';
  sec.appendChild(prevAto);
  const montarAto=()=>{
    const n0=iAto.value.trim().replace(/\s+/g,' ');
    if(!n0)return '';
    const f=orgFormatarAto(iTipo.value+' '+n0);   // "Portaria 416" -> "Portaria Nº 416/2026"
    return f;
  };
  const atualizarPrevia=()=>{
    const nome=iNome.value.trim();
    const ato=montarAto();
    prevAto.textContent=(nome||ato)?'Na caixa: '+[nome,ato].filter(Boolean).join(' — '):'';
  };
  iAto.addEventListener('input',atualizarPrevia);
  iNome.addEventListener('input',atualizarPrevia);
  iTipo.addEventListener('change',atualizarPrevia);
  iAto.addEventListener('blur',()=>{
    const f=montarAto();
    if(f){const m=/^(?:Portaria|Decreto)\s+Nº\s+(.+)$/i.exec(f);if(m)iAto.value=m[1];}
    atualizarPrevia();
  });
  atualizarPrevia();
  const iMat=campo('Matrícula',n.matricula||'','');
  const iTel=campo('Telefone (WhatsApp)',(loadContatosAdmin())[n.id]||'','(68) 90000-0000');
  const msg=document.createElement('p');msg.className='org-edit-msg';
  const acoes=document.createElement('div');acoes.className='org-edit-acoes';
  const bSalvar=document.createElement('button');bSalvar.type='button';bSalvar.className='org-edit-salvar';bSalvar.textContent='Salvar';
  const bRest=document.createElement('button');bRest.type='button';bRest.className='org-edit-restaurar';bRest.textContent='Restaurar original';
  const bAdd=document.createElement('button');bAdd.type='button';bAdd.className='org-edit-restaurar';bAdd.textContent='+ Adicionar caixa abaixo';
  acoes.append(bSalvar,bRest);
  if(orgPodeAdicionarAbaixo(n)){
    acoes.appendChild(bAdd);
  }else{
    const aviso=document.createElement('small');aviso.className='org-edit-dica';
    aviso.textContent='Divisão não recebe caixas abaixo dela.';
    sec.appendChild(aviso);
  }
  if(n.parent){
    const bDel=document.createElement('button');bDel.type='button';bDel.className='org-edit-remover';bDel.textContent='Remover caixa';
    acoes.appendChild(bDel);
    bDel.addEventListener('click',async()=>{
      const filhos=n.children.map(id=>byId.get(id)).filter(Boolean);
      if(filhos.length){
        // com caixas ligadas o desenho ficaria sem lugar certo para elas: mova ou remova antes
        showToast('Esta caixa tem '+filhos.length+' caixa(s) ligada(s). Mova cada uma para outro setor (campo "Vinculado a") ou remova-as primeiro.');
        return;
      }
      const ok=await window.Modal.confirmar({
        titulo:'Remover caixa',
        mensagem:'Remover "'+n.title+'" do organograma?',
        confirmar:'Remover',perigo:true
      });
      if(!ok)return;
      bDel.disabled=true;msg.textContent='Removendo…';msg.className='org-edit-msg';
      try{
        const agoraIso=new Date().toISOString();
        const linhasGravar=[{id:n.id,removido:true,holder_atualizado_em:agoraIso}];
        await orgGravarLote(linhasGravar,'Removeu "'+n.title+'"');
        try{sessionStorage.setItem('seagri_org_abrir',n.parent);}catch(e){}
        location.reload();
      }catch(err){msg.textContent=err.message;msg.className='org-edit-msg erro';bDel.disabled=false;}
    });
  }
  bAdd.addEventListener('click',async()=>{
    if(!orgPodeAdicionarAbaixo(n)){showToast('Divisão não recebe caixas abaixo dela.');return;}
    bAdd.disabled=true;msg.textContent='Adicionando…';msg.className='org-edit-msg';
    try{
      const id='n'+Date.now().toString(36);
      const tipo=ORG_FILHO_TIPO[n.kind]||'divisao';
      // cor mais usada entre as caixas do mesmo tipo
      const cont={};nodes.filter(x=>x.kind===tipo).forEach(x=>{cont[x.color]=(cont[x.color]||0)+1;});
      // dentro de um grupo (diretoria > departamento > divisão > núcleo) a caixa nova herda a cor do pai;
      // fora disso, usa a cor mais comum do mesmo tipo
      const grupo=['diretoria','departamento','divisao','nucleo'];
      const corNova=grupo.includes(n.kind)?n.color:(Object.keys(cont).sort((a,b)=>cont[b]-cont[a])[0]||n.color);
      await orgGravarLote([{id,novo:true,parent_id:n.id,titulo:'Novo setor',sigla:'NOVO',tipo,cor:corNova,holder:'',holder_atualizado_em:new Date().toISOString()}],'Adicionou caixa abaixo de "'+n.title+'"');
      orgRecarregarAbrindo(id);
    }catch(err){msg.textContent=err.message;msg.className='org-edit-msg erro';bAdd.disabled=false;}
  });
  sec.append(acoes,msg);
  const dica=document.createElement('p');dica.className='org-edit-dica';
  dica.textContent='Arraste a caixa para mudá-la de lugar (Shift leva as caixas ligadas a ela junto).';
  sec.appendChild(dica);
  body.insertBefore(sec,body.firstChild);

  bSalvar.addEventListener('click',async()=>{
    const nome=iNome.value.trim().replace(/\s+/g,' ');
    const ato=montarAto();
    const holder=nome?(nome+(ato?'\n'+ato:'')):'';
    const tel=iTel.value.trim();
    bSalvar.disabled=true;msg.textContent='Salvando…';msg.className='org-edit-msg';
    try{
      const mudouHolder=holder!==(n.holder||'');
      const est=estrutura.leitura();
      const mudouTitulo=est.titulo!==n.title,mudouSigla=est.sigla!==n.sigla,mudouTipo=est.tipo!==n.kind;
      const mudouCor=est.cor!==n.color,mudouPai=est.parent!==null&&est.parent!==n.parent;
      const mudouCorTitulo=est.corTitulo!==(n.corTitulo||''),mudouCorTexto=est.corTexto!==(n.corTexto||'');
      const campos={holder,matricula:iMat.value.trim(),telefone:tel};
      if(mudouTitulo)campos.titulo=est.titulo;
      if(mudouSigla)campos.sigla=est.sigla;
      if(mudouTipo)campos.tipo=est.tipo;
      if(mudouCor)campos.cor=est.cor;
      if(mudouCorTitulo)campos.cor_titulo=est.corTitulo||null;
      if(mudouCorTexto)campos.cor_texto=est.corTexto||null;
      if(mudouPai)campos.parent_id=est.parent;
      // "última alteração" = troca de nome/responsável ou de hierarquia (cor e posição não contam)
      const agoraIso=new Date().toISOString();
      if(mudouHolder||mudouTitulo||mudouSigla||mudouPai)campos.holder_atualizado_em=agoraIso;
      const lote=[{id:n.id,...campos}];
      // cor trocada num nível: vale para todas as caixas abaixo (menos na secretaria, a raiz)
      const aplicaAbaixo=(mudouCor||mudouCorTitulo||mudouCorTexto)&&n.parent;
      const abaixo=aplicaAbaixo?[...orgDescendentesIds(n)]:[];
      abaixo.forEach(id=>{
        const l={id};
        if(mudouCor)l.cor=est.cor;
        if(mudouCorTitulo)l.cor_titulo=est.corTitulo||null;
        if(mudouCorTexto)l.cor_texto=est.corTexto||null;
        lote.push(l);
      });
      await orgGravarLote(lote,'Editou "'+n.title+'"'+(abaixo.length?' (cor aplicada a '+abaixo.length+' caixa(s) abaixo)':''));
      if(campos.holder_atualizado_em)ORG_ULTIMA_ALT=new Date(agoraIso);
      if(mudouTipo||mudouPai){orgRecarregarAbrindo(n.id);return;}   // formato/ligação mudam: redesenha
      n.title=est.titulo;n.sigla=est.sigla;n.color=est.cor;n.corTitulo=est.corTitulo;n.corTexto=est.corTexto;
      orgAtualizarVisual(n);
      abaixo.forEach(id=>{
        const d=byId.get(id);if(!d)return;
        if(mudouCor)d.color=est.cor;
        if(mudouCorTitulo)d.corTitulo=est.corTitulo;
        if(mudouCorTexto)d.corTexto=est.corTexto;
        orgAtualizarVisual(d);
      });
      n.holder=holder;n.matricula=iMat.value.trim();
      if(tel)TEL_AJUSTES[n.id]=tel;else delete TEL_AJUSTES[n.id];
      orgAjustarCorpo(n);drawLines();
      showToast('Alterações salvas');
      openDetailPanel(n,getPDFPath(n.holder));
    }catch(err){
      msg.textContent=err.message;msg.className='org-edit-msg erro';
      bSalvar.disabled=false;
    }
  });
  bRest.addEventListener('click',async()=>{
    const o=ORG_ORIGINAL.get(n.id),b=ORG_BASE.get(n.id);
    bRest.disabled=true;msg.textContent='Restaurando…';msg.className='org-edit-msg';
    try{
      const mudouHolder=(n.holder||'')!==(o.holder||'');
      const agoraIso=new Date().toISOString();
      const estruturaMudou=n.title!==o.title||n.kind!==o.kind||n.parent!==o.parent||n.sigla!==o.sigla||n.color!==o.color||!!n.corTitulo||!!n.corTexto;
      await orgGravarLote([{id:n.id,holder:null,matricula:null,telefone:null,dx:null,dy:null,parent_id:null,titulo:null,sigla:null,cor:null,tipo:null,cor_titulo:null,cor_texto:null,
        ...((mudouHolder||estruturaMudou)?{holder_atualizado_em:agoraIso}:{})}],'Restaurou "'+n.title+'" ao original');
      if(mudouHolder||estruturaMudou)ORG_ULTIMA_ALT=new Date(agoraIso);
      if(n.kind!==o.kind||n.parent!==o.parent){orgRecarregarAbrindo(n.id);return;}
      n.title=o.title;n.sigla=o.sigla;n.color=o.color;n.corTitulo='';n.corTexto='';orgAtualizarVisual(n);
      n.holder=o.holder;n.matricula=o.matricula;n.x=b.x;n.y=b.y;delete TEL_AJUSTES[n.id];
      orgAjustarCorpo(n);orgPosicionar(n);drawLines();
      showToast('Caixa restaurada ao original');
      openDetailPanel(n,getPDFPath(n.holder));
    }catch(err){
      msg.textContent=err.message;msg.className='org-edit-msg erro';
      bRest.disabled=false;
    }
  });
};

// ===== PDF Overlay Viewer =====
let _pdfPath='',_pdfZoom=100;
const pdfOverlay=document.getElementById('pdfOverlay');
const pdfPanel=document.getElementById('pdfViewerPanel');
const pdfIframe=document.getElementById('pdfViewerIframe');
const pdfZoomLbl=document.getElementById('pdfZoomLabel');

function openPdfSidePanel(path,label){
  _pdfPath=path;_pdfZoom=100;
  document.getElementById('pdfViewerTitle').textContent=label||'Portaria';
  pdfZoomLbl.textContent='100%';
  pdfIframe.src=path+'#zoom=100';
  pdfOverlay.classList.add('open');
}
function closePdfOverlay(){
  pdfOverlay.classList.remove('open');
  setTimeout(()=>{pdfIframe.src='';},300);
}
document.getElementById('pdfViewerClose').addEventListener('click',closePdfOverlay);
pdfOverlay.addEventListener('click',e=>{if(e.target===pdfOverlay)closePdfOverlay();});
document.getElementById('pdfZoomIn').addEventListener('click',()=>{
  _pdfZoom=Math.min(_pdfZoom+25,300);
  pdfZoomLbl.textContent=_pdfZoom+'%';
  pdfIframe.src=_pdfPath+'#zoom='+_pdfZoom;
});
document.getElementById('pdfZoomOut').addEventListener('click',()=>{
  _pdfZoom=Math.max(_pdfZoom-25,50);
  pdfZoomLbl.textContent=_pdfZoom+'%';
  pdfIframe.src=_pdfPath+'#zoom='+_pdfZoom;
});
// Drag handle to resize panel width
(function(){
  const handle=document.getElementById('pdfDragHandle');
  let dragging=false,startX=0,startW=0;
  handle.addEventListener('mousedown',e=>{
    dragging=true;startX=e.clientX;startW=pdfPanel.offsetWidth;
    handle.classList.add('dragging');document.body.style.userSelect='none';e.preventDefault();
  });
  window.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const newW=Math.max(320,Math.min(window.innerWidth*.92,startW+(startX-e.clientX)));
    pdfPanel.style.width=newW+'px';
  });
  window.addEventListener('mouseup',()=>{
    if(!dragging)return;
    dragging=false;handle.classList.remove('dragging');document.body.style.userSelect='';
  });
})();

// ===== Busca rápida de nós (2.2) =====
const searchInput=document.getElementById('searchNode');
const searchResults=document.getElementById('searchResults');

function doSearch(q){
  searchResults.innerHTML='';
  if(!q){searchResults.classList.remove('show');return;}
  const ql=q.toLowerCase();
  const matches=nodes.filter(n=>{
    return n.title.toLowerCase().includes(ql)||
           n.sigla.toLowerCase().includes(ql)||
           (n.holder&&n.holder.toLowerCase().includes(ql));
  }).slice(0,12);
  if(!matches.length){searchResults.classList.remove('show');return;}
  matches.forEach(n=>{
    const item=document.createElement('div');item.className='search-node-item';
    const dot=document.createElement('span');dot.className='search-node-dot';
    dot.style.background=KIND_COLOR[n.kind]||'#888';
    const name=document.createElement('span');name.className='search-node-name';
    name.textContent=n.title;
    const holder=document.createElement('span');holder.className='search-node-holder';
    holder.textContent=n.holder?n.holder.split('\n')[0]:'';
    item.appendChild(dot);item.appendChild(name);item.appendChild(holder);
    item.addEventListener('click',()=>{
      searchResults.classList.remove('show');
      searchInput.value='';
      collapsed.clear();refresh();
      panToNode(n);
      openDetailPanel(n,getPDFPath(n.holder));
    });
    searchResults.appendChild(item);
  });
  searchResults.classList.add('show');
  posicionarResultados();
}

/* A lista flutua sobre a página (position:fixed, a partir do campo): assim a barra de
   ferramentas, que rola em telas pequenas, não corta os resultados. */
function posicionarResultados(){
  if(!searchResults.classList.contains('show'))return;
  const r=searchInput.getBoundingClientRect();
  const largura=Math.min(Math.max(r.width,260),window.innerWidth-16);
  const esquerda=Math.max(8,Math.min(r.left,window.innerWidth-largura-8));
  searchResults.style.position='fixed';
  searchResults.style.top=(r.bottom+4)+'px';
  searchResults.style.left=esquerda+'px';
  searchResults.style.width=largura+'px';
  searchResults.style.maxHeight=Math.max(120,window.innerHeight-r.bottom-16)+'px';
}
window.addEventListener('resize',posicionarResultados);
window.addEventListener('scroll',posicionarResultados,true);

searchInput.addEventListener('input',e=>doSearch(e.target.value.trim()));
searchInput.addEventListener('keydown',e=>{
  if(e.key==='Escape'){searchResults.classList.remove('show');searchInput.value='';}
  if(e.key==='Enter'){
    const first=searchResults.querySelector('.search-node-item');
    if(first)first.click();
  }
});
document.addEventListener('click',e=>{
  if(!e.target.closest('.search-node-wrap'))searchResults.classList.remove('show');
});

