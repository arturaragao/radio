// Arquivos fictícios montados no teste. Nenhum conteúdo de usuário.
const {deflateRawSync,crc32}=require('node:zlib');
function zip(arquivos){
  const locais=[],centrais=[];let offset=0;
  for(const a of arquivos){
    const nome=Buffer.from(a.nome),raw=Buffer.from(a.dados||''),metodo=a.metodo??8,flags=a.flags??0x800,comp=metodo===8?deflateRawSync(raw):raw,crc=crc32(raw);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(flags,6);l.writeUInt16LE(metodo,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(comp.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(nome.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(flags,8);c.writeUInt16LE(metodo,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(comp.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(nome.length,28);c.writeUInt32LE(offset,42);
    locais.push(l,nome,comp);centrais.push(c,nome);offset+=l.length+nome.length+comp.length;
  }
  const central=Buffer.concat(centrais),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(arquivos.length,8);e.writeUInt16LE(arquivos.length,10);e.writeUInt32LE(central.length,12);e.writeUInt32LE(offset,16);
  return Buffer.concat([...locais,central,e]);
}
module.exports={zip};
