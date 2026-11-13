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
