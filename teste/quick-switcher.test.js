const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');
const notas = fs.readFileSync(path.join(raiz, 'build/notas.js'), 'utf8');
const notas2 = fs.readFileSync(path.join(raiz, 'build/notas2.js'), 'utf8');

test('Quick Switcher presente em notas.js, notas2.js e app.js gerado', () => {
  assert.match(notas2, /function ntQuickSwitcher\(\)/);
  assert.match(notas, /onclick="ntQuickSwitcher\(\)"/);
  assert.match(notas, /Alt\+K/);
  assert.match(app, /function ntQuickSwitcher\(\)/);
  assert.match(app, /Ir para p[áa]gina/);
});

test('Barra das Notas centralizada, menu ⋯ na direita com Historico/Atalhos e lateral sem icones', () => {
  assert.match(notas, /<div class="nt-barra-slot" id="nt_barra"><\/div><button type="button" class="b s nt-pg-opcoes"/);
  assert.match(notas, /data-hist>Histórico<\/button><button type="button" role="menuitem" data-atalhos>Atalhos<\/button>/);
  assert.doesNotMatch(notas, />📄 \$\{esc\(p\.titulo/);
  assert.doesNotMatch(notas, /▼'\} 📁 \$\{esc\(p\.titulo/);
});
