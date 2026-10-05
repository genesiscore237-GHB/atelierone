const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let pass=0, fail=0;
const check=(l,o,x="")=>{if(o){pass++;console.log("  [PASS]",l)}else{fail++;console.log("  [FAIL]",l,x)}};
const jar=new Map();
async function h(path,opts={}){
  const headers={...(opts.headers||{})}; const ck=[...jar.entries()].map(([k,v])=>k+"="+v).join("; ");
  if(ck)headers.cookie=ck;
  const res=await fetch(BASE+path,{...opts,headers,redirect:"manual"});
  const scs=typeof res.headers.getSetCookie==="function"?res.headers.getSetCookie():[res.headers.get("set-cookie")].filter(Boolean);
  for(const sc of scs){const pair=sc.split(";")[0];const i=pair.indexOf("=");if(i>0)jar.set(pair.slice(0,i).trim(),pair.slice(i+1));}
  return res;
}
(async()=>{
  const csrf=await (await h("/api/auth/csrf")).json();
  await h("/api/auth/callback/credentials",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrfToken:csrf.csrfToken,email:"admin@gpj.cm",password:"admin123",callbackUrl:BASE+"/dashboard"})});
  const token=jar.get("authjs.session-token");
  const browser=await chromium.launch({executablePath:CHROME,headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.addCookies([{name:"authjs.session-token",value:token,domain:"localhost",path:"/",httpOnly:true}]);
  const page=await ctx.newPage(); page.setDefaultTimeout(45000);

  await page.goto(BASE+"/dashboard/catalog",{waitUntil:"domcontentloaded",timeout:90000});
  await page.waitForTimeout(2000);
  check("Sous-nav: Statistiques", (await page.getByText("Statistiques",{exact:false}).count())>=1);
  check("Sous-nav: Catégories", (await page.getByText("Catégories",{exact:false}).count())>=1);

  await page.goto(BASE+"/dashboard/catalog/produits/nouveau",{waitUntil:"domcontentloaded",timeout:90000});
  await page.waitForTimeout(2500);
  check("Formulaire: 4 types", (await page.locator("text=Pièce détachée").count())>=1 && (await page.locator("text=Consommable").count())>=1 && (await page.locator("text=Outillage").count())>=1 && (await page.locator("text=Main d'œuvre").count())>=1);
  check("Wireframe: A Identification", (await page.locator("text=A · Identification").count())>=1);
  check("Wireframe: B Classification", (await page.locator("text=B · Classification").count())>=1);
  check("Wireframe: C Compatibilité", (await page.locator("text=C · Compatibilité véhicule").count())>=1);
  check("Wireframe: E Prix", (await page.locator("text=E · Prix & tarification").count())>=1);
  check("Wireframe: F Gestion de stock", (await page.locator("text=F · Gestion de stock").count())>=1);
  check("Anti-doublon présent", (await page.locator("text=Cette pièce existe déjà ?").count())>=1);
  check("Bouton Enregistrer et créer un autre", (await page.locator("text=Enregistrer et créer un autre").count())>=1);

  await page.goto(BASE+"/dashboard/catalog/articles",{waitUntil:"domcontentloaded",timeout:90000});
  await page.waitForTimeout(2000);
  check("Liste articles: recherche présente", (await page.locator("input[placeholder*='Rechercher'], input[type='search']").count())>=1);

  await browser.close();
  console.log(`RÉSULTAT CATALOGUE UI (module 1): ${pass} PASS / ${fail} FAIL`);
  process.exit(fail>0?1:0);
})().catch(e=>{console.error("FATAL:",e.message);process.exit(1)});
