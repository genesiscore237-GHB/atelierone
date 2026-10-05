const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let pass=0,fail=0;
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
const PATHS=["/dashboard/catalog","/dashboard/catalog/articles","/dashboard/catalog/produits/nouveau","/dashboard/catalog/recherche","/dashboard/catalog/categories"];
const VIEWPORTS=[{w:375,h:812,n:"MOBILE"},{w:768,h:1024,n:"TABLETTE"},{w:1440,h:900,n:"DESKTOP"}];
(async()=>{
  const csrf=await (await h("/api/auth/csrf")).json();
  await h("/api/auth/callback/credentials",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrfToken:csrf.csrfToken,email:"admin@gpj.cm",password:"admin123",callbackUrl:BASE+"/dashboard"})});
  const token=jar.get("authjs.session-token");
  const browser=await chromium.launch({executablePath:CHROME,headless:true});
  for(const vp of VIEWPORTS){
    const ctx=await browser.newContext({viewport:{width:vp.w,height:vp.h}});
    await ctx.addCookies([{name:"authjs.session-token",value:token,domain:"localhost",path:"/",httpOnly:true}]);
    const page=await ctx.newPage(); page.setDefaultTimeout(60000);
    const errors=[]; page.on("pageerror",e=>errors.push(e.message.slice(0,120)));
    for(const p of PATHS){
      try{
        await page.goto(BASE+p,{waitUntil:"networkidle",timeout:90000});
        await page.waitForTimeout(3000);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
        const e=errors.length; errors.length=0;
        check(`${vp.n} ${p} (overflow<=4, 0 err)`, overflow<=4 && e===0, `overflow=${overflow}px errs=${e}`);
      }catch(err){ check(`${vp.n} ${p} (chargement)`, false, err.message.slice(0,90)); }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`RÉSULTAT RESPONSIVE (module 1, 3000): ${pass} PASS / ${fail} FAIL`);
  process.exit(fail>0?1:0);
})().catch(e=>{console.error("FATAL:",e.message);process.exit(1)});
