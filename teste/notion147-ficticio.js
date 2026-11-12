// Somente dados sintéticos. Os ZIPs de exemplo são reproduzíveis a partir deste arquivo.
const {zip}=require('./zip-ficticio.js');
const id='0123456789abcdef0123456789abcdef',nome=`Página fictícia ${id}.html`;
const {deflateSync,crc32}=require('node:zlib');
const chunk=(tipo,raw)=>{const t=Buffer.from(tipo),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(raw.length);c.writeUInt32BE(crc32(Buffer.concat([t,raw])));return Buffer.concat([n,t,raw,c])};
const ihdr=Buffer.from([0,0,0,1,0,0,0,1,8,6,0,0,0]);
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,0,80,255,255]))),chunk('IEND',Buffer.alloc(0))]);
const html=v=>`<!doctype html><html><head><title>Página fictícia</title></head><body><article id="${id}"><div class="page-body"><p>Introdução</p>${v===1?'<p>Remover este bloco</p>':''}<h2>Âncora A</h2><p>${v===1?'Texto antigo':'Texto atualizado'}</p><h2>Âncora B</h2><details><summary>Toggle</summary><p>Conteúdo preservado</p></details>${v===2?'<p>Bloco adicionado</p>':''}<img src="pixel.png"></div></article></body></html>`;
const exemplo=v=>zip([{nome,dados:html(v),metodo:8},{nome:'pixel.png',dados:png,metodo:0}]);
module.exports={id,nome,html,exemplo};
if(require.main===module){const fs=require('node:fs'),path=require('node:path');for(const v of [1,2])fs.writeFileSync(path.join(__dirname,`notion147-v${v}.zip`),exemplo(v));console.log('ok: ZIPs fictícios v1/v2 gerados')}
