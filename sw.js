// Service worker do Banco CBR: guarda o app para abrir sem internet e serve as imagens (./img/<arquivo>)
// lendo do repositório privado com a chave do aparelho. Imagem vista uma vez fica no aparelho.
const VERSAO = "bcbr-1.66.0";
const APP = ["./", "./index.html", "./shim.js", "./app.js", "./vendor/tiptap.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./icon-mask.png", "./apple-touch-icon.png"];
const REPO = "arturaragao/banco-cbr-app";
let pausaAte = 0;
const encPath = (nome) => String(nome || "").replace(/^\/+/, "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
function esperaLimite(r) {
  const ra = r.headers?.get?.("retry-after");
  if (ra) {
    const seg = Number(ra); if (Number.isFinite(seg) && seg > 0) return seg * 1000;
    const dt = Date.parse(ra); if (Number.isFinite(dt) && dt > Date.now()) return dt - Date.now();
  }
  const rst = Number(r.headers?.get?.("x-ratelimit-reset") || 0);
  if (Number.isFinite(rst) && rst > 0) { const ms = rst * 1000 - Date.now() + 1000; if (ms > 0) return ms; }
  return 60000;
}
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(APP)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith("bcbr-v") || /^bcbr-\d/.test(k)) && k !== VERSAO).map((k) => caches.delete(k))))); self.clients.claim(); });
async function token() { const c = await caches.open("bcbr-cfg"); const r = await c.match("./__token"); return r ? r.text() : ""; }
async function imagem(req, nome) {
  const cache = await caches.open("bcbr-img");
  const hit = (await cache.match(req)) || (await cache.match("./img/" + encPath(nome))) || (await cache.match(req, { ignoreSearch: true }));
  if (hit && hit.ok) return hit;
  if (pausaAte > Date.now()) return new Response("", { status: 429 });
  const tk = await token();
  let r = null;
  if (!tk) {
    try { r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/imagens/${encPath(nome)}`); } catch (e) {}
    if (!r || !r.ok) return new Response("", { status: 401 });
  } else {
    for (const nm of [...new Set([nome, nome.normalize("NFC"), nome.normalize("NFD")])]) {
      r = await fetch(`https://api.github.com/repos/${REPO}/contents/imagens/${encPath(nm)}`, { headers: { Authorization: "Bearer " + tk, Accept: "application/vnd.github.raw" } });
      if (r.status === 403 || r.status === 429) {
        if (r.status === 429 || r.headers?.get?.("x-ratelimit-remaining") === "0" || r.headers?.get?.("retry-after")) {
          pausaAte = Math.max(pausaAte, Date.now() + esperaLimite(r));
        }
        return new Response("", { status: r.status });
      }
      if (r.status !== 404) break;
    }
    if (!r || !r.ok) return new Response("", { status: r ? r.status : 404 });
    pausaAte = 0;
  }
  const b = await r.blob();
  if (!b.size || /text\/html|application\/json/i.test(b.type || "")) return new Response("", { status: 404 });
  const ext = nome.split(".").pop().toLowerCase();
  const tipo = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] || b.type || "image/jpeg";
  const resp = new Response(b, { headers: { "Content-Type": tipo } });
  cache.put(req, resp.clone()); return resp;
}
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const m = u.pathname.match(/\/img\/(.+)$/);
  if (m) {
    let nm = m[1]; try { nm = decodeURIComponent(nm); } catch (e2) {}
    return e.respondWith(imagem(e.request, nm));
  }
  if (e.request.method !== "GET") return;
  if (u.pathname.endsWith("/versao.txt")) return;   // sempre da rede (confere versão nova)
  // app: abre na hora com a cópia do aparelho e baixa a versão nova por trás (pedido do Artur, 23/10/2026: abrir rápido no celular).
  // Se a página mudou, avisa o app ("Versão nova do app pronta · Atualizar"). Sem cópia: rede (e cópia se o GitHub falhar).
  e.respondWith((async () => {
    const vReq = u.searchParams.get("v"), vIgual = !vReq || VERSAO === "bcbr-" + vReq;
    const cache = await caches.open(VERSAO), hit = await cache.match(e.request) || (vIgual ? await cache.match(e.request, { ignoreSearch: true }) : null) || (e.request.mode === "navigate" ? await cache.match("./index.html", { ignoreSearch: true }) : null);   // ./?pagina=<id> e ?v= (mesma versão) abrem com a cópia do app
    const rede = fetch(e.request.url, { cache: "no-cache" }).then(async (r) => {
      if (r.ok) {
        const pagina = e.request.mode === "navigate";
        if (pagina && hit) {
          const [a, b] = await Promise.all([hit.clone().text(), r.clone().text()]);
          await cache.put(e.request, r.clone());
          if (a !== b) (await self.clients.matchAll()).forEach((c) => c.postMessage("bcbr-nova"));
        } else await cache.put(e.request, r.clone());
      }
      return r;
    });
    if (hit) { e.waitUntil(rede.catch(() => {})); return hit; }
    return rede.then((r) => r.ok ? r : caches.match(e.request, { ignoreSearch: true }).then((c) => c || r))
      .catch(() => caches.match(e.request, { ignoreSearch: true }));
  })());
});
