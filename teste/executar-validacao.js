// Guarda stdout/stderr e código real sem redirecionamento PowerShell (UTF-8 sem BOM).
const fs=require('node:fs'),{spawn}=require('node:child_process');
const args=process.argv.slice(2),nome=args.shift(),p=spawn(process.execPath,args,{windowsHide:true}),out=fs.createWriteStream('teste/'+nome+'.log',{encoding:'utf8'});
for(const stream of [p.stdout,p.stderr])stream.on('data',b=>out.write(b));
p.on('error',e=>{out.write(e.stack);process.exitCode=1});
p.on('close',code=>{out.end('\nEXIT_CODE='+code+'\n');console.log(nome+': exit '+code);process.exitCode=code||0});
