// Kit de teste do Banco CBR: serve a raiz do app (sem copiar) e simula a API do GitHub com os dados locais.
// Uso: node teste/servidor.js [pasta-dos-dados] [porta]   (ou BCBR_DADOS=... PORT=...)
// Só código aqui: nenhum dado/questão/imagem é copiado. PUT de progresso só responde 200 (nada é gravado).
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const D = path.resolve(process.argv[2] || process.env.BCBR_DADOS || path.join(RAIZ, '..', 'banco-cbr-app'));
const PORT = +(process.argv[3] || process.env.PORT || 8765);
const SIMULADO=process.argv[2]==='--simulado',simulado=SIMULADO?require('./calendario-dados.js'):null;
if (!SIMULADO&&!fs.existsSync(D + '/dados/questoes.json')) { console.error('Dados não encontrados em ' + D + ' (passe a pasta como 1º argumento)'); process.exit(1); }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
// interceptor injetado no index.html (só na resposta; o arquivo do app não muda): desvia api.github.com para /api e põe token falso
const PRE = `(()=>{const f=window.fetch;window.fetch=(u,o)=>{u=String(u);if(u.startsWith('https://api.github.com'))u=u.replace('https://api.github.com','/api');return f(u,o)};
try{localStorage.setItem('bcbr_gh_token','token-falso')}catch(e){}})();`;
const SW_NULO = `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));`;
let n = 0;
// BCBR_MEM=1 (só com --simulado): PUT de semana/plano.json e imagens/ fica guardado em MEMÓRIA do servidor e volta no GET (teste de recarregar a página).
const MEM=process.env.BCBR_MEM==='1',mem=new Map();
// 1.40: contadores e cota simulada (GET /__stats, /__stats?zera, /__cota?rest=N). ETag = "<sha>"; GET com If-None-Match igual -> 304; PUT com sha velho -> 409.
const stats={get:0,n304:0,put:0,n409:0};let cota=null;
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const rl = () => cota == null ? {} : { 'x-ratelimit-remaining': String(cota), 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) };
  const j = (o, c = 200, h = {}) => { res.writeHead(c, { 'content-type': 'application/json', ...rl(), ...h }); res.end(JSON.stringify(o)); };
  if (u === '/__stats') { const o = { ...stats }; if (req.url.includes('zera')) Object.assign(stats, { get: 0, n304: 0, put: 0, n409: 0 }); return j(o); }
  if (u === '/__cota') { const r = new URL(req.url, 'http://x').searchParams.get('rest'); cota = r == null || r === '' ? null : +r; return j({ cota }); }
  if (u.startsWith('/api/')) {
    if(SIMULADO){
      if(req.method==='PUT'){
        if(!MEM){req.resume();return j({content:{sha:'fake'+(++n)}})}
        let b='';req.on('data',c=>b+=c);req.on('end',()=>{const o=JSON.parse(b),rel=u.replace(/^.*contents\//,''),atual=mem.get(rel);
          if(atual&&o.sha!==atual.sha){stats.n409++;return j({message:'sha does not match'},409)}
          const sha='m'+(++n);stats.put++;mem.set(rel,{sha,b64:o.content});j({content:{sha}})});return;
      }
      const rel=u.replace(/^.*contents\//,'');
      if(MEM&&mem.has(rel)){const m=mem.get(rel);
        if(rel.startsWith('imagens/')){res.writeHead(200,{'content-type':'image/jpeg'});return res.end(Buffer.from(m.b64,'base64'))}
        stats.get++;const et='"'+m.sha+'"';
        if(req.headers['if-none-match']===et){stats.n304++;res.writeHead(304,{etag:et,...rl()});return res.end()}
        return j({sha:m.sha,content:m.b64,encoding:'base64'},200,{etag:et})}
      if(Object.hasOwn(simulado,rel))return j({sha:'sintetico',content:Buffer.from(JSON.stringify(simulado[rel])).toString('base64'),encoding:'base64'});
      if(['dados','progresso','semana'].includes(rel))return j(Object.keys(simulado).filter(k=>k.startsWith(rel+'/')).map(k=>({name:path.basename(k),type:'file',sha:k})));
      const blob=u.split('/git/blobs/')[1];if(blob&&Object.hasOwn(simulado,blob))return j(simulado[blob]);
      return j({},404);
    }
    let m;
    if ((m = u.match(/contents\/(dados|progresso|semana)$/))) {
      const d = D + '/' + m[1]; if (!fs.existsSync(d)) return j([]);
      return j(fs.readdirSync(d).filter(f => fs.statSync(d + '/' + f).isFile()).map(f => ({ name: f, sha: m[1] + '|' + f, type: 'file' })));
    }
    if ((m = u.match(/git\/blobs\/(.+)$/))) { const [a, b] = m[1].split('|'); if (!/^(dados|progresso|semana)$/.test(a) || b.includes('..')) { res.writeHead(404); return res.end(); } res.writeHead(200); return res.end(fs.readFileSync(D + '/' + a + '/' + b)); }
    if ((m = u.match(/contents\/imagens\/(.+)$/))) {
      const p = path.join(D, 'imagens', path.basename(m[1]));
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(fs.readFileSync(p));
    }
    if (req.method === 'PUT') { req.resume(); return j({ content: { sha: 'fake' + (++n) } }); }
    const p = path.join(D, u.replace(/^.*contents\//, ''));
    if (p.startsWith(D) && fs.existsSync(p) && fs.statSync(p).isFile()) return j({ sha: 'x', content: fs.readFileSync(p).toString('base64'), encoding: 'base64' });
    res.writeHead(404); return res.end('{}');
  }
  if (u === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(SW_NULO); }
  const rel = u === '/' ? '/index.html' : u, p = path.join(RAIZ, rel);
  if (!p.startsWith(RAIZ) || rel.startsWith('/teste') || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(p);
  if (rel === '/index.html') body = Buffer.from(body.toString('utf8').replace(/<script/, '<script>' + PRE + '</script><script'));
  res.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
}).listen(PORT, () => console.log(`Banco CBR (teste) em http://localhost:${PORT}/  dados: ${SIMULADO?'fictícios, somente em memória':D}`));
