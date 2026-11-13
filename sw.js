// Service worker do Banco CBR: guarda o app para abrir sem internet e serve as imagens (./img/<arquivo>)
// lendo do repositório privado com a chave do aparelho. Imagem vista uma vez fica no aparelho.
const VERSAO = "bcbr-1.50.4";
const APP = ["./", "./index.html", "./shim.js", "./app.js", "./vendor/tiptap.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./icon-mask.png", "./apple-touch-icon.png"];
const REPO = "arturaragao/banco-cbr-app";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(APP)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith("bcbr-v") || /^bcbr-\d/.test(k)) && k !== VERSAO).map((k) => caches.delete(k))))); self.clients.claim(); });
async function token() { const c = await caches.open("bcbr-cfg"); const r = await c.match("./__token"); return r ? r.text() : ""; }
async function imagem(req, nome) {
  const cache = await caches.open("bcbr-img");
  const hit = await cache.match(req); if (hit) return hit;
  const tk = await token();
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/imagens/${encodeURIComponent(nome)}`, { headers: { Authorization: "Bearer " + tk, Accept: "application/vnd.github.raw" } });
  if (!r.ok) return new Response("", { status: r.status });
  const ext = nome.split(".").pop().toLowerCase();
  const tipo = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] || "image/jpeg";
  const resp = new Response(await r.blob(), { headers: { "Content-Type": tipo } });
  cache.put(req, resp.clone()); return resp;
}
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const m = u.pathname.match(/\/img\/([^/]+)$/);
  if (m) return e.respondWith(imagem(e.request, decodeURIComponent(m[1])));
  if (e.request.method !== "GET") return;
  if (u.pathname.endsWith("/versao.txt")) return;   // sempre da rede (confere versão nova)
  // app: abre na hora com a cópia do aparelho e baixa a versão nova por trás (pedido do Artur, 23/10/2026: abrir rápido no celular).
  // Se a página mudou, avisa o app ("Versão nova do app pronta · Atualizar"). Sem cópia: rede (e cópia se o GitHub falhar).
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO), hit = await cache.match(e.request) || (e.request.mode === "navigate" ? await cache.match("./index.html", { ignoreSearch: true }) : null);   // ./?pagina=<id> abre com a cópia do app (1.43)
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
