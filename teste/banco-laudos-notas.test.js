import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { indexar, padronizar, filtrar, origemLaudo } from "../laudos/lib/indice.js";

const R = path.resolve(import.meta.dirname, "..");

test("origemLaudo identifica Ecomax, HSI e Notion antigo preservando compatibilidade", () => {
  assert.equal(origemLaudo({ acc: "1234567" }), "Ecomax");
  assert.equal(origemLaudo({ acc: "1234567", origem: "ecomax" }), "Ecomax");
  assert.equal(origemLaudo({ acc: "hsi:987654", origem: "hsi" }), "HSI");
  assert.equal(origemLaudo({ acc: "hsi:987654" }), "HSI");
  assert.equal(origemLaudo({ acc: "111222", doNotion: true }), "Notion antigo");
});

test("filtrar contabiliza faceta origem e filtra por img e comNota", () => {
  const regs = [
    { acc: "10001", data: "2026-11-20", titulo: "TC DE TORAX", mod: "CT", medico: "Silva", nImagens: 2, nota: "caso raro", pars: [[{ t: "Conclusão: nódulo pulmonar." }]] },
    { acc: "hsi:20002", origem: "hsi", data: "2026-11-21", titulo: "RM CRANIO", mod: "MR", medico: "Souza", nImagens: 0, nota: "", pars: [[{ t: "Conclusão: exame normal." }]], normal: true },
  ];
  const ixs = padronizar(regs.map(indexar));
  const tudo = filtrar(ixs, { facetas: {} }, "");
  assert.equal(tudo.lista.length, 2);
  assert.deepEqual(tudo.contagens.origem, [["Ecomax", 1], ["HSI", 1]]);

  const soHsi = filtrar(ixs, { facetas: { origem: ["HSI"] } }, "");
  assert.equal(soHsi.lista.length, 1);
  assert.equal(soHsi.lista[0].r.acc, "hsi:20002");

  const soImg = filtrar(ixs, { img: true, facetas: {} }, "");
  assert.equal(soImg.lista.length, 1);
  assert.equal(soImg.lista[0].r.acc, "10001");

  const soNota = filtrar(ixs, { comNota: true, facetas: {} }, "");
  assert.equal(soNota.lista.length, 1);
  assert.equal(soNota.lista[0].r.acc, "10001");
});

test("build do Radio 1.68.0 inclui Banco de Laudos em Notas, CSS escopado e cache SW", () => {
  const appJs = fs.readFileSync(path.join(R, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(R, "index.html"), "utf8");
  const swJs = fs.readFileSync(path.join(R, "sw.js"), "utf8");
  const versao = fs.readFileSync(path.join(R, "versao.txt"), "utf8").trim();

  assert.equal(versao, "1.72.1");
  assert.match(appJs, /NT_LAUDOS='banco-laudos'/);
  assert.match(appJs, /function ntLaudosAbre\(/);
  assert.match(appJs, /Banco de Laudos/);
  assert.match(appJs, /c\.buscaAbertos/);
  assert.match(indexHtml, /\.bl-root\{/);
  assert.match(swJs, /bcbr-1\.72\.1/);
  assert.match(swJs, /\.\/laudos\/laudos-app\.js/);
});

test("busca numérica encontra também por pid e accOriginal", () => {
  const regs = [
    { acc: "hsi:9001", accOriginal: "9001", pid: "554433", origem: "hsi", data: "2026-11-26", titulo: "TC CRANIO", pars: [[{ t: "Conclusão: normal." }]] },
  ];
  const ixs = padronizar(regs.map(indexar));
  assert.equal(filtrar(ixs, { facetas: {} }, "554433").lista.length, 1);
  assert.equal(filtrar(ixs, { facetas: {} }, "9001").lista.length, 1);
});
