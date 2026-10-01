const sqlite3=require('sqlite3');
const {open}=require('sqlite');
const prisma=require('../db');
const fs=require('fs');

let running=false;

async function openDb(){
  const file=process.env.PDV_DB_PATH;
  if(!file||!fs.existsSync(file)) throw Error('PDV_DB_PATH não configurado ou arquivo não encontrado.');
  return open({filename:file,driver:sqlite3.Database,mode:sqlite3.OPEN_READONLY});
}
function slug(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||'produto';}

async function sync(){
  if(running) return {skipped:true,message:'Sincronização do PDV já está em andamento.'};
  running=true;
  let db=null;
  const started=new Date();
  let created=0,updated=0,errors=0,deactivated=0,stockConflicts=0;
  try{
    db=await openDb();
    const rows=await db.all(`
      SELECT p.codigo_barras,p.nome,p.categoria,p.preco_varejo,p.status,
             COALESCE(SUM(e.quantidade),0) AS estoque_total
      FROM produtos p
      LEFT JOIN estoque_saldos e ON e.codigo_barras=p.codigo_barras
      WHERE p.status=1
      GROUP BY p.codigo_barras,p.nome,p.categoria,p.preco_varejo,p.status
    `);
    const cats=await db.all(`SELECT nome FROM categorias`);
    const catMap=new Map();
    for(const c of cats){
      const cdb=await prisma.category.upsert({where:{slug:slug(c.nome)},create:{name:c.nome,slug:slug(c.nome)},update:{name:c.nome,active:true}});
      catMap.set(c.nome,cdb.id);
    }

    const seen=new Set();
    for(const r of rows){
      try{
        const pdvId=String(r.codigo_barras);
        seen.add(pdvId);
        const categoryId=catMap.get(r.categoria)||null;
        const stock=Math.max(0,Math.floor(Number(r.estoque_total||0)));
        const existing=await prisma.product.findUnique({where:{pdvId}});
        if(existing && (existing.reservedStock||0)>stock) stockConflicts++;
        const data={
          name:r.nome,
          priceCents:Math.round(Number(r.preco_varejo||0)*100),
          categoryId,
          stock,
          pdvManaged:true,
          active:true
        };
        if(existing){await prisma.product.update({where:{id:existing.id},data});updated++;}
        else {await prisma.product.create({data:{...data,pdvId,slug:slug(`${r.nome}-${r.codigo_barras}`)}});created++;}
      }catch(e){errors++;}
    }

    const managed=await prisma.product.findMany({where:{pdvManaged:true,pdvId:{not:null}},select:{id:true,pdvId:true}});
    const stale=managed.filter(p=>!seen.has(String(p.pdvId)));
    for(const p of stale){
      await prisma.product.update({where:{id:p.id},data:{active:false}});
      deactivated++;
    }

    const message=`${rows.length} produtos ativos lidos; estoque sincronizado; ${deactivated} inativados por ausência no PDV.${stockConflicts?` ATENÇÃO: ${stockConflicts} produto(s) com reserva online acima do estoque físico.`:''}`;
    await prisma.pdvSyncLog.create({data:{startedAt:started,finishedAt:new Date(),created,updated,errors,message}});
    return {read:rows.length,created,updated,errors,deactivated,stockConflicts,startedAt:started,finishedAt:new Date()};
  } finally {
    if(db) await db.close();
    running=false;
  }
}

async function productByBarcode(code){
  const db=await openDb();
  try{return await db.get(`SELECT p.codigo_barras,p.nome,p.categoria,p.preco_varejo,p.status,COALESCE(SUM(e.quantidade),0) quantidade FROM produtos p LEFT JOIN estoque_saldos e ON e.codigo_barras=p.codigo_barras WHERE p.codigo_barras=? GROUP BY p.codigo_barras,p.nome,p.categoria,p.preco_varejo,p.status`,String(code));}
  finally{await db.close();}
}

async function health(){
  const db=await openDb();
  try{
    const [{n:products}]=await db.all(`SELECT COUNT(*) n FROM produtos WHERE status=1`);
    const [{n:stockRows}]=await db.all(`SELECT COUNT(*) n FROM estoque_saldos`);
    const [{n:sales}]=await db.all(`SELECT COUNT(*) n FROM vendas`);
    return {ok:true,products,stockRows,sales};
  }finally{await db.close();}
}
module.exports={sync,productByBarcode,health};
