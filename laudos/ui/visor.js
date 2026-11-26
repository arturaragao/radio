// Visualizador de imagens em tela cheia: deslizar para trocar, pinça e dois toques para zoom, arrastar com zoom,
// setas/Esc no teclado, roda do mouse para zoom no PC. Escopado ao container montado no Radio.
let raizAtual = null;
const $ = (id) => raizAtual?.querySelector(`#bl_${id}`) || document.getElementById(`bl_${id}`);
let srcs = [], i = 0, esc = 1, tx = 0, ty = 0;
const img = () => $("visor")?.querySelector("img");

function aplicar(anim) {
  const el = img();
  if (!el) return;
  el.style.transition = anim ? "transform .18s" : "none";
  el.style.transform = `translate(-50%,-50%) translate(${tx}px,${ty}px) scale(${esc})`;
}
function mostrar(n) {
  const el = img();
  if (!el || !srcs.length) return;
  i = (n + srcs.length) % srcs.length;
  esc = 1; tx = 0; ty = 0;
  el.src = srcs[i];
  aplicar(false);
  const cont = $("vCont");
  if (cont) cont.textContent = srcs.length > 1 ? `${i + 1} de ${srcs.length}` : "";
  if ($("vAnt")) $("vAnt").hidden = srcs.length < 2;
  if ($("vProx")) $("vProx").hidden = srcs.length < 2;
}
export function abrirVisor(lista, n = 0) {
  const v = $("visor");
  if (!v) return;
  srcs = lista;
  v.classList.add("aberto");
  mostrar(n);
}
export const visorAberto = () => !!$("visor")?.classList.contains("aberto");
export function fecharVisor() { $("visor")?.classList.remove("aberto"); }

export function initVisor(raiz, signal) {
  raizAtual = raiz;
  const v = $("visor");
  if (!v) return;
  const opt = signal ? { signal } : undefined;
  $("vFechar")?.addEventListener("click", fecharVisor, opt);
  $("vAnt")?.addEventListener("click", () => mostrar(i - 1), opt);
  $("vProx")?.addEventListener("click", () => mostrar(i + 1), opt);
  document.addEventListener("keydown", (e) => {
    if (!visorAberto()) return;
    if (e.key === "Escape") fecharVisor();
    else if (e.key === "ArrowLeft") mostrar(i - 1);
    else if (e.key === "ArrowRight") mostrar(i + 1);
    else return;
    e.preventDefault();
  }, opt);
  v.addEventListener("wheel", (e) => {
    e.preventDefault();
    esc = Math.min(6, Math.max(1, esc * (e.deltaY < 0 ? 1.15 : 0.87)));
    if (esc === 1) { tx = 0; ty = 0; }
    aplicar(false);
  }, { passive: false, ...(signal ? { signal } : {}) });

  let ini = null, ultimoToque = 0;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  v.addEventListener("touchstart", (e) => {
    if (e.target.closest(".vb")) return;
    const t = e.touches;
    if (t.length === 2) ini = { pinca: dist(t), esc };
    else if (t.length === 1) {
      const agora = Date.now();
      if (agora - ultimoToque < 280) { esc = esc > 1 ? 1 : 2.5; tx = 0; ty = 0; aplicar(true); ultimoToque = 0; ini = null; return; }
      ultimoToque = agora;
      ini = { x: t[0].clientX, y: t[0].clientY, tx, ty };
    }
  }, { passive: true, ...(signal ? { signal } : {}) });
  v.addEventListener("touchmove", (e) => {
    if (!ini) return;
    const t = e.touches;
    if (t.length === 2 && ini.pinca) { esc = Math.min(6, Math.max(1, ini.esc * dist(t) / ini.pinca)); aplicar(false); }
    else if (t.length === 1 && ini.x != null) {
      const dx = t[0].clientX - ini.x, dy = t[0].clientY - ini.y;
      if (esc > 1) { tx = ini.tx + dx; ty = ini.ty + dy; } else { tx = dx; ty = 0; }
      aplicar(false);
    }
    e.preventDefault();
  }, { passive: false, ...(signal ? { signal } : {}) });
  v.addEventListener("touchend", (e) => {
    if (!ini) return;
    if (ini.x != null && esc === 1 && e.touches.length === 0) {
      if (tx < -60 && srcs.length > 1) return (ini = null, mostrar(i + 1));
      if (tx > 60 && srcs.length > 1) return (ini = null, mostrar(i - 1));
      tx = 0; aplicar(true);
    }
    if (esc <= 1.02) { esc = 1; tx = 0; ty = 0; aplicar(true); }
    if (e.touches.length === 0) ini = null;
  }, opt);
}
