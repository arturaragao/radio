// Alternativa sem dependências para ambientes sem Python.
// Executa as trocas da receita montar.py, mantendo-a como única fonte das transformações.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..');
const ler=p=>fs.readFileSync(path.join(raiz,p),'utf8').replace(/\r\n/g,'\n');
const receita=ler('build/montar.py');
const versao=receita.match(/^VERSAO = "([^"]+)"/m)[1];
const literal=/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const strings=s=>[...s.matchAll(literal)].map(m=>vm.runInNewContext(m[0]));
const lerExpr=s=>s.replace(/open\(f"\{R\}\/([^"\n]+)", encoding="utf8"\)\.read\(\)/g,(_,p)=>JSON.stringify(ler(p)));
let js=ler('fonte/artefato-app.js').split('<script>')[1].split('</script>')[0],head=ler('fonte/artefato-head.html'),i0,i1,ini,fim;
const troca=(a,b,n=1)=>{assert.equal(js.split(a).length-1,n,'troca: '+a.slice(0,80));js=js.split(a).join(b)};
const expr=s=>{
  s=lerExpr(s);
  // Esta pequena gramática cobre somente composição e cortes da receita, sem executar Python.
  s=s.replace(/js\[:(\w+)\]/g,'js.slice(0,$1)').replace(/js\[(\w+):\]/g,'js.slice($1)');
  const ctx={js,i0,i1,ini,fim};return vm.runInNewContext(s,ctx);
};
const linhas=receita.split('\n');let inicio=linhas.findIndex(l=>l.startsWith('# imagens'));
for(let k=inicio;k<linhas.length;k++){
  let l=linhas[k].trim();if(!l||l.startsWith('#'))continue;
  if(l.startsWith('open(f"{R}/app.js"'))break;
  if(l.startsWith('troca(')){
    while(!l.endsWith(')'))l+='\n'+linhas[++k].trim();
    const [a,b]=strings(l),n=l.match(/,\s*(\d+)\)$/);troca(a,b,n?+n[1]:1);continue;
  }
  if(l.startsWith('js = js.replace(')){
    while(!l.endsWith(')'))l+='\n'+linhas[++k].trim();
    const [a,b]=strings(l);js=/,\s*1\)$/.test(l)?js.replace(a,b):js.split(a).join(b);continue;
  }
  if(/^(i0|i1|ini|fim) = js.index\(/.test(l)){
    // Algumas linhas declaram os dois cortes separados por ponto e vírgula.
    for(const stmt of l.split('; ')){
      const nome=stmt.match(/^(\w+) =/)[1],valores=strings(stmt);let valor;
      const a=valores[0];
      if(/js.index\([^,]+, js.index\(/.test(stmt))valor=js.indexOf(a,js.indexOf(valores[1]));
      else valor=js.indexOf(a,/js.index\([^,]+, i0\)/.test(stmt)?i0:0);
      assert.ok(valor>=0,'corte: '+a);
      const tamanho=stmt.match(/\+ len\(/);if(tamanho)valor+=valores[1].length;
      else if(/\+ 2$/.test(stmt))valor+=2;
      if(nome==='i0')i0=valor;else if(nome==='i1')i1=valor;else if(nome==='ini')ini=valor;else fim=valor;
    }continue;
  }
  if(l.startsWith('js = ')){js=expr(l.slice(5).split(' #')[0]);continue}
  throw Error('Instrução da receita não suportada: '+l);
}
const gravar=(p,s)=>fs.writeFileSync(path.join(raiz,p),s,'utf8');
gravar('app.js',`// Banco CBR app ${versao} — gerado por build/montar.py a partir do artefato (não editar à mão)\n`+js);
const css=[...receita.match(/^css = (.+)$/m)[1].matchAll(/\{R\}\/([^"\n]+)"/g)].map(m=>ler(m[1])).join('');
const pwa='<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg"><link rel="apple-touch-icon" href="apple-touch-icon.png"><meta name="theme-color" content="#2f2923" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#4a3320" media="(prefers-color-scheme: light)"><meta name="apple-mobile-web-app-capable" content="yes">';
head=head.replace('<style>',pwa+'<style>').replace('</style>',css+'</style>');
assert.equal(head.split('</svg>Radio</div>').length-1,1);
head=head.replace('</svg>Radio</div>',`</svg>Radio<small class="versao">v${versao}</small></div>`);
gravar('index.html',head+`\n<script>window.BCBR_VERSAO="${versao}"</script><script src="shim.js?v=${versao}"></script>\n</body></html>\n`);
gravar('versao.txt',versao);
const sw=ler('sw.js');assert.equal((sw.match(/^const VERSAO = "[^"]+";/gm)||[]).length,1);
gravar('sw.js',sw.replace(/^const VERSAO = "[^"]+";/m,`const VERSAO = "bcbr-${versao}";`));
console.log(`ok: app.js ${js.length} caracteres · index.html ${versao} (receita montar.py)`);
