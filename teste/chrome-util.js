// Auxiliar dos testes de navegador da 1.42 (radio-browser, offline-browser): sobe o servidor de teste (dados fictícios) e o Chrome headless e devolve
// funções de teclado/mouse/avaliação por CDP. Só dados fictícios; nada vai ao GitHub.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const espera=ms=>new Promise(r=>setTimeout(r,ms));
const raiz=path.resolve(__dirname,'..');
function sobeServidor(porta,env={}){
  return spawn(process.execPath,['teste/servidor.js','--simulado',String(porta)],{cwd:raiz,windowsHide:true,stdio:'pipe',env:{...process.env,BCBR_MEM:'1',...env}});
}
async function iniciar({porta,env={},largura=1000,altura=900,sw=false,tema=null}){
  const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if(!fs.existsSync(chrome))throw new Error('Chrome não encontrado');
  const perfil=fs.mkdtempSync(path.join(os.tmpdir(),'bcbr-r-')),URL_=`http://127.0.0.1:${porta}/`;
  const E={...env,...(sw?{BCBR_SW:'1'}:{})};
  const S={proc:sobeServidor(porta,E)};
  const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${perfil}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws;
  const fim=async()=>{try{ws?.close()}catch(e){}proc.kill();S.proc.kill();await espera(600);fs.rmSync(perfil,{recursive:true,force:true,maxRetries:8,retryDelay:250})};
  try{
    const pa=path.join(perfil,'DevToolsActivePort');for(let i=0;i<150&&!fs.existsSync(pa);i++)await espera(100);
    if(!fs.existsSync(pa))throw new Error('Chrome não abriu o protocolo de depuração');
    await espera(300);const pc=fs.readFileSync(pa,'utf8').split('\n')[0];
    const alvo=await(await fetch(`http://127.0.0.1:${pc}/json/new?about:blank`,{method:'PUT'})).json();
    ws=new WebSocket(alvo.webSocketDebuggerUrl);await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});
    let seq=0;const pend=new Map(),erros=[],consoleErros=[];
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pend.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
    const local=u=>u.startsWith(`http://127.0.0.1:${porta}/`);
    ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pend.get(r.id);pend.delete(r.id);if(p)r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}
      if(r.method==='Runtime.exceptionThrown')erros.push(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text);
      if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')consoleErros.push(r.params.args.map(x=>x.value||x.description).join(' '));
      if(r.method==='Fetch.requestPaused'){const p=r.params;call(local(p.request.url)?'Fetch.continueRequest':'Fetch.failRequest',{requestId:p.requestId,...(local(p.request.url)?{}:{errorReason:'BlockedByClient'})}).catch(()=>{})}};
    const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
    await call('Emulation.setDeviceMetricsOverride',{width:largura,height:altura,deviceScaleFactor:1,mobile:false});
    if(tema)await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:tema}]});
    for(let i=0;i<60;i++){try{if((await fetch(URL_)).ok)break}catch{}await espera(100)}
    const esperaApp=async(aba)=>{
      for(let i=0;i<150;i++){if(await ev("typeof SM!=='undefined'&&SM.ok&&typeof TABS!=='undefined'&&!!document.querySelector('.sm')").catch(()=>false))break;await espera(100)}
      if(aba){await ev(`go('${aba}')`);if(aba==='notas')for(let i=0;i<100;i++){if(await ev("typeof NT!=='undefined'&&!!NT.ed&&!!document.querySelector('.nt-pm')").catch(()=>false))break;await espera(100)}}
      await espera(600);await ev("SM.fila.then(()=>1)");
    };
    const abre=async aba=>{await call('Page.navigate',{url:URL_});await esperaApp(aba)};
    const tecla=async(key,extra={})=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,...extra});await call('Input.dispatchKeyEvent',{type:'keyUp',key,...extra})};
    const digita=async txt=>{for(const ch of txt){await call('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,unmodifiedText:ch});await call('Input.dispatchKeyEvent',{type:'keyUp',key:ch})}};
    const COD={Enter:13,Escape:27,Tab:9,Delete:46,Backspace:8,ArrowDown:40,ArrowUp:38};
    const especial=(key,mod=0)=>tecla(key,{code:key,windowsVirtualKeyCode:COD[key],modifiers:mod});   // mod: 1 Alt, 2 Ctrl, 8 Shift
    const ctrl=(letra,mod=2)=>tecla(letra,{code:'Key'+letra.toUpperCase(),windowsVirtualKeyCode:letra.toUpperCase().charCodeAt(0),modifiers:mod});
    const click=async s=>{const p=await ev(`(()=>{const el=document.querySelector(${JSON.stringify(s)});if(!el)throw Error('Ausente: '+${JSON.stringify(s)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p})};
    const mouse=(type,x,y,preso=false)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!preso?'none':'left',buttons:type==='mouseReleased'||(type==='mouseMoved'&&!preso)?0:1,clickCount:1});
    const arrasta=async(de,ate,passos=4)=>{await mouse('mouseMoved',...de);await mouse('mousePressed',...de);for(let i=1;i<=passos;i++){await mouse('mouseMoved',de[0]+(ate[0]-de[0])*i/passos,de[1]+(ate[1]-de[1])*i/passos,true);await espera(50)}await mouse('mouseReleased',...ate);await espera(120)};
    const shot=async nome=>{const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(nome,Buffer.from(r.data,'base64'))};
    const ate=async(expr,ms=15000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await ev(expr).catch(()=>false))return Date.now()-t0;await espera(100)}throw new Error('não ocorreu a tempo: '+expr)};
    const par=(t,id)=>({type:'paragraph',...(id?{attrs:{id}}:{}),...(t?{content:[{type:'text',text:t}]}:{})});
    const tg=(titulo,...f)=>({type:'details',content:[{type:'detailsSummary',...(titulo?{content:[{type:'text',text:titulo}]}:{})},{type:'detailsContent',content:f.length?f:[par('')]}]});
    const reset=async(...blocos)=>{await ev(`NT.ed.commands.setContent({type:'doc',content:${JSON.stringify(blocos)}},{emitUpdate:false});NT.ed.commands.focus();0`);await espera(250)};
    const fechaTodos=()=>ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='true'&&b.click())");
    const confirmado=async()=>{for(let i=0;i<100;i++){if(await ev("!ntTemPendentes()&&!NT.sync&&!NT.sujo&&!SM.sujo"))return true;await espera(100)}return false};
    const abertos=()=>ev("[...document.querySelectorAll('.nt-pm [data-type=details]')].map(d=>d.classList.contains('is-open'))");
    return {call,ev,espera,esperaApp,abre,tecla,digita,especial,ctrl,click,mouse,arrasta,shot,ate,par,tg,reset,fechaTodos,confirmado,abertos,erros,consoleErros,URL_,S,porta,env:E,fim,
      sobeServidor:()=>{S.proc=sobeServidor(porta,E)},paraServidor:async()=>{S.proc.kill();await espera(500)}};
  }catch(e){await fim();throw e}
}
module.exports={iniciar,espera,raiz};
