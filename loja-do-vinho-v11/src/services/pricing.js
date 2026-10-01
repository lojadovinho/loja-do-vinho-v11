const prisma=require('../db');
function scopeFor(city,state){const c=String(city||'').trim().toLowerCase(),uf=String(state||'').trim().toUpperCase();if((c==='juazeiro'&&uf==='BA')||(c==='petrolina'&&uf==='PE'))return 'LOCAL';if(c||uf)return 'NATIONAL';return 'ALL'}
function apply(cents,r){if(!r)return cents;if(r.adjustmentType==='FIXED_DISCOUNT')return Math.max(0,cents-r.adjustmentValue);if(r.adjustmentType==='SURCHARGE_PERCENT')return Math.round(cents*(10000+r.adjustmentValue)/10000);return Math.max(0,Math.round(cents*(10000-r.adjustmentValue)/10000))}
async function getRules(scope){const rows=await prisma.paymentPriceRule.findMany({where:{active:true,scope:{in:[scope,'ALL']}},orderBy:{scope:'desc'}});const out={};for(const r of rows)if(!out[r.method])out[r.method]=r;return out}
async function priceFor(cents,method,city,state){const rules=await getRules(scopeFor(city,state));return {scope:scopeFor(city,state),rule:rules[method]||null,cents:apply(cents,rules[method])}}
module.exports={scopeFor,apply,getRules,priceFor};
