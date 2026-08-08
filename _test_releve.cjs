const XLSX=require('xlsx'), fs=require('fs');
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
function toISO(v){ if(v instanceof Date&&!isNaN(v)){const d=new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate()));return d.toISOString().slice(0,10);} const s=String(v??'').trim();const m=s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);if(m){const[,dd,mm,yy]=m;const y=yy.length===2?'20'+yy:yy;return `${y}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;}return null;}
function toNum(v){if(v==null||v==='')return null;if(typeof v==='number')return v;const s=String(v).replace(/\s/g,'').replace(/[^\d,.-]/g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null;}
const wb=XLSX.read(fs.readFileSync('_test_releve.xlsx'),{type:'buffer',cellDates:true});
let out=[];
for(const sn of wb.SheetNames){
 const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,blankrows:false});
 let h=-1,cDate=-1,cLib=-1,cDeb=-1,cCred=-1;
 for(let i=0;i<rows.length;i++){const c=(rows[i]||[]).map(norm);const f=k=>c.findIndex(x=>x.includes(k));const il=f('libell'),id=f('debit'),ic=f('credit');if(il!==-1&&(id!==-1||ic!==-1)){h=i;cLib=il;cDeb=id;cCred=ic;cDate=f('date');break;}}
 if(h===-1)continue;
 for(let i=h+1;i<rows.length;i++){const r=rows[i]||[];const lib=String(r[cLib]??'').trim();const iso=toISO(r[cDate]);const deb=cDeb!==-1?toNum(r[cDeb]):null;const cred=cCred!==-1?toNum(r[cCred]):null;if(!iso||!lib)continue;let m=null,t=null;if(deb&&deb!==0){m=Math.abs(deb);t='depense';}else if(cred&&cred!==0){m=Math.abs(cred);t='recette';}if(m==null)continue;out.push({date:iso,type:t,montant:m,libelle:lib.slice(0,45)});}
}
console.log('TOTAL ops:', out.length);
const rec=out.filter(o=>o.type==='recette'),dep=out.filter(o=>o.type==='depense');
console.log('recettes:',rec.length,'somme',rec.reduce((s,o)=>s+o.montant,0).toFixed(2));
console.log('depenses:',dep.length,'somme',dep.reduce((s,o)=>s+o.montant,0).toFixed(2));
console.log('--- 6 premieres ---'); out.slice(0,6).forEach(o=>console.log(o.date,o.type.padEnd(8),String(o.montant).padStart(9),o.libelle));
fs.unlinkSync('_test_releve.xlsx'); fs.unlinkSync('_test_releve.cjs');
