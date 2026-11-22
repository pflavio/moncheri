// An die private Verwaltungstabelle gebundenes Apps Script.
// Nur die beiden Mitgliederfunktionen dürfen per google.script.run Daten austauschen.
const SITE_ = 'https://moncheri.pflavio.com/';
function onOpen() {
  SpreadsheetApp.getUi().createMenu('MonChéri')
    .addItem('Mitgliederlink erstellen', 'mitgliederlink_')
    .addItem('Auswertungen aktualisieren', 'auswertungen_')
    .addToUi();
}
function mitgliederlink_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const settings = book.getSheetByName('Einrichtung');
  const url = String(settings.getRange('B10').getValue()).trim();
  const match = /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]{12,})\/exec$/.exec(url);
  if (!match) throw new Error('Kopiere die Web-App-URL mit /exec in Einrichtung!B10.');
  const props = PropertiesService.getScriptProperties();
  const invite = props.getProperty('INVITE') || Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperties({ BOOK: book.getId(), INVITE: invite });
  settings.getRange('B8:B9').setValues([[SITE_ + '#k=' + invite],[url + '#k=' + invite]]);
  SpreadsheetApp.getUi().alert('Die beiden Links stehen im Blatt „Einrichtung“. Nach der Freigabe in B5 kannst du den Mitgliederlink teilen.');
}
function doGet() {
  return HtmlService.createHtmlOutput(formular_())
    .setTitle('MonChéri · Vereinskleidung')
    .addMetaTag('viewport','width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function bookFor_(token) {
  const props = PropertiesService.getScriptProperties();
  if (typeof token !== 'string' || !token || token !== props.getProperty('INVITE')) throw new Error('Bitte öffne den vollständigen Einladungslink aus der Vereinsgruppe.');
  return SpreadsheetApp.openById(props.getProperty('BOOK'));
}
function rows_(sheet, columns) {
  const n = sheet.getLastRow() - 4;
  return n <= 0 ? [] : sheet.getRange(5,1,n,columns).getValues();
}
function options_(v) {
  const xs = [...new Set(String(v || '').split(',').map(x=>x.trim()).filter(Boolean))];
  return xs.length ? xs : ['Standard'];
}
function catalog_(book) {
  const fields = book.getSheetByName('Einrichtung').getRange('B5:B7').getValues().flat();
  const products = rows_(book.getSheetByName('Artikel'),7).filter(r=>r[6] === true).map(r=>{
    const cents = Math.round(r[2] * 100);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(r[0])) || !String(r[1]).trim() || typeof r[2] !== 'number' || !Number.isSafeInteger(cents) || cents < 0 || cents > 1000000)
      throw new Error('Der Artikelkatalog wird überarbeitet. Bitte melde dich bei der Orga.');
    return {id:String(r[0]),name:String(r[1]).trim(),cents,sizes:options_(r[3]),colors:options_(r[4]),custom:r[5]===true};
  });
  if (new Set(products.map(p=>p.id)).size !== products.length) throw new Error('Im Katalog sind Artikel-IDs doppelt vergeben.');
  return {open:fields[0]===true, payment:String(fields[1]||''),privacy:String(fields[2]||''),products};
}
function getCatalog(token) { return catalog_(bookFor_(token)); }
function plain_(s,max) {
  if (typeof s !== 'string' || s.trim().length > max || /[\u0000-\u001f\u007f]/.test(s)) throw new Error('Bitte prüfe deine Texteingabe.');
  return s.trim();
}
function literal_(v) { return typeof v==='string' && /^[\s]*[=+@'-]/.test(v) ? "'"+v : v; }
function quote_(catalog, request) {
  if (!Array.isArray(request.items) || !request.items.length || request.items.length>40) throw new Error('Wähle zwischen 1 und 40 Positionen.');
  const lines=request.items.map(line=>{
    const p=catalog.products.find(x=>x.id===line.id);
    if(!p || !p.colors.includes(line.color) || !p.sizes.includes(line.size) || line.cents!==p.cents || line.name!==p.name)
      throw new Error('Das Sortiment oder ein Preis hat sich geändert. Bitte lade die Seite neu und prüfe deine Auswahl.');
    if(!Number.isInteger(line.qty) || line.qty<1 || line.qty>99) throw new Error('Die Menge muss zwischen 1 und 99 liegen.');
    const custom=plain_(line.text,30);
    if(custom && !p.custom) throw new Error('Für diesen Artikel ist kein Sticktext vorgesehen.');
    return {id:p.id,name:p.name,color:line.color,size:line.size,text:custom,qty:line.qty,cents:p.cents};
  });
  return {lines,total:lines.reduce((sum,l)=>sum+l.cents*l.qty,0)};
}
function submitOrder(token,request) {
  const book=bookFor_(token);
  if(!request || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.key)) throw new Error('Bitte öffne das Formular erneut.');
  const name=plain_(request.name,60);
  if(!name) throw new Error('Trage deinen Namen oder Spitznamen ein.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try {
    const sheet=book.getSheetByName('Bestellungen');
    const prior=sheet.getLastRow()>4 ? sheet.getRange(5,8,sheet.getLastRow()-4,1).createTextFinder(request.key).matchEntireCell(true).findNext() : null;
    const catalog=catalog_(book);
    if(prior){
      const old=sheet.getRange(prior.getRow(),1,1,8).getValues()[0];
      return {ref:String(old[0]),total:Math.round(old[3]*100),payment:catalog.payment};
    }
    if(!catalog.open) throw new Error('Die Bestellrunde ist geschlossen.');
    const {lines,total}=quote_(catalog,request);
    const ref='MC-'+Utilities.getUuid().replace(/-/g,'').slice(0,12).toUpperCase();
    const summary=lines.map(l=>l.qty+' × '+l.name+' · '+l.color+' · '+l.size+(l.text?' · '+l.text:'')).join('\n');
    const target=sheet.getLastRow()+1;
    if(target>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),100);
    const row=[ref,new Date(),literal_(name),total/100,false,summary,JSON.stringify(lines),request.key];
    sheet.getRange(target,1,1,8).setValues([row]);
    sheet.getRange(target,5).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    sheet.getRange(target,4).setNumberFormat('#,##0.00 "€"');
    sheet.getRange(target,2).setNumberFormat('dd.MM.yyyy HH:mm');
    SpreadsheetApp.flush();
    // The order is durable before either derived view is refreshed.
    try { writeReports_(book); } catch (err) { console.warn('Auswertungen bitte im Tabellenmenü aktualisieren.'); }
    return {ref,total,payment:catalog.payment};
  } finally {lock.releaseLock();}
}
function aggregate_(orders) {
  const variants=new Map(),people=new Map();
  for(const r of orders){
    if(!r[0]) continue;
    const name=String(r[2]).trim(), key=name.toLocaleLowerCase('de-DE'), cents=Math.round(r[3]*100);
    const p=people.get(key)||{name,count:0,total:0,paid:0};
    p.count++;p.total+=cents;if(r[4]===true)p.paid+=cents;people.set(key,p);
    for(const x of JSON.parse(r[6])){
      const parts=[x.id,x.name,x.color,x.size,x.text],k=JSON.stringify(parts);
      const previous=variants.get(k);variants.set(k,{parts,qty:(previous?previous.qty:0)+x.qty});
    }
  }
  const cmp=(a,b)=>a.localeCompare(b,'de',{numeric:true});
  return {
    supplier:[...variants.values()].sort((a,b)=>cmp(a.parts.join(' '),b.parts.join(' '))).map(v=>[...v.parts.map(literal_),v.qty]),
    people:[...people.values()].sort((a,b)=>cmp(a.name,b.name)).map(p=>[literal_(p.name),p.count,p.total/100,p.paid/100,(p.total-p.paid)/100])
  };
}
function replaceReport_(sheet,values,width) {
  const old=sheet.getLastRow()-4;
  if(values.length+4>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),values.length+4-sheet.getMaxRows());
  if(values.length) sheet.getRange(5,1,values.length,width).setValues(values);
  if(old>values.length) sheet.getRange(5+values.length,1,old-values.length,width).clearContent();
}
function writeReports_(book) {
  const a=aggregate_(rows_(book.getSheetByName('Bestellungen'),8));
  replaceReport_(book.getSheetByName('Stickerei'),a.supplier,6);
  replaceReport_(book.getSheetByName('Personensummen'),a.people,5);
}
function auswertungen_() {
  const book=SpreadsheetApp.getActiveSpreadsheet();
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    writeReports_(book);
    SpreadsheetApp.flush();
  }finally{lock.releaseLock();}
}
function onEdit(e){
  if(e && e.range.getSheet().getName()==='Bestellungen' && e.range.getColumn()<=5 && e.range.getLastColumn()>=5 && e.range.getLastRow()>=5) auswertungen_();
}

// Eingebettetes Formular aus docs/index.html
function formular_() {
  return [
    "<!doctype html>",
    "<html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow,noarchive\"><meta name=\"referrer\" content=\"no-referrer\"><title>Vereinskleidung · MonChéri Pétanque</title>",
    "<style>",
    ":root{--red:#7b2138;--dark:#341924;--muted:#635960;--line:#ded4d6;--pale:#faf2f3;--paper:#fffcfa;--white:#fff;--good:#24533d;font-family:\"Source Sans 3\",system-ui,sans-serif;color:var(--dark);background:var(--paper);line-height:1.45}*{box-sizing:border-box}body{margin:0;border-top:6px solid var(--red)}header,main,footer{max-width:1120px;margin:auto;padding:0 clamp(16px,4vw,50px)}header{display:flex;align-items:center;justify-content:space-between;min-height:90px;gap:12px}header a,footer a{color:var(--red)}.brand{display:flex;align-items:center;gap:12px}.brand img{width:62px;height:62px;object-fit:contain}.brand strong{font-family:Georgia,serif;font-size:1.45rem}.brand small{display:block;color:var(--muted);font-size:.85rem}header>a{font-size:.9rem}main{padding-bottom:28px}.hero{border-top:1px solid var(--line);padding:clamp(24px,4vw,44px) 0 20px}.hero h1{font:normal clamp(2.5rem,6.5vw,5.25rem)/1 Georgia,serif;letter-spacing:-.05em;margin:0 0 12px;color:var(--red)}.hero p{margin:0;color:var(--muted)}.layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(295px,1fr);gap:clamp(18px,3vw,36px);align-items:start}h2{font:normal 1.7rem/1.15 Georgia,serif;margin:0 0 14px}.box{background:var(--white);border:1px solid var(--line);border-radius:12px;overflow:hidden}.catalog{padding:20px 22px 4px}.product{padding:15px 0;border-top:1px solid var(--line)}.product summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px}.product summary::-webkit-details-marker{display:none}.product summary strong{flex:1}.product summary .price{color:var(--red);font-weight:650;white-space:nowrap}.plus{font-size:1.25rem;line-height:1;display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;width:28px;height:28px}.product[open] .plus{background:var(--pale);transform:rotate(45deg)}.controls{display:grid;grid-template-columns:1fr 1fr 80px;gap:10px;margin:14px 0 2px}label{display:block;font-weight:600;font-size:.89rem}.full{grid-column:1/-1}input,select,button{font:inherit}input,select{width:100%;border:1px solid #bcaeb3;border-radius:6px;padding:9px;color:var(--dark);background:white;min-height:44px;margin-top:4px}select{padding-right:24px}button{cursor:pointer;border-radius:6px;min-height:43px;font-weight:650;padding:9px 15px;border:1px solid var(--red);background:var(--red);color:white}button:disabled{cursor:default;opacity:.55}button.secondary{background:white;color:var(--red)}:focus-visible{outline:3px solid #b45322;outline-offset:3px}.cart{padding:20px 22px;border-top:4px solid var(--red)}.cart ul{list-style:none;padding:0;margin:0}.line{display:grid;grid-template-columns:1fr auto;gap:2px 8px;border-bottom:1px solid var(--line);padding:9px 0}.line small{display:block;color:var(--muted)}button.remove{display:inline-block;color:var(--red);background:none;border:0;text-decoration:underline;font-size:.87rem;min-height:32px;padding:4px 0;justify-self:start}.total{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:15px 0 18px;padding:10px 0 0}.total strong{color:var(--red);font-size:1.65rem}.cart button[type=submit]{width:100%;margin-top:12px}.notice,.status{padding:12px 16px;margin:0 0 18px;border-left:4px solid var(--red);background:var(--pale);border-radius:2px 6px 6px 2px}.notice:empty,.status:empty,[hidden]{display:none!important}.status{margin:12px 0 0}.empty,.details p{color:var(--muted)}.details{margin-top:20px;font-size:.94rem}.details summary{cursor:pointer;color:var(--red)}.preserve{white-space:pre-line;overflow-wrap:anywhere}footer{border-top:1px solid var(--line);padding-top:16px;padding-bottom:26px;color:var(--muted);font-size:.9rem;display:flex;flex-wrap:wrap;gap:18px}.receipt{padding:24px 28px;border-top:5px solid var(--good);max-width:680px}.receipt b{font-size:1.45rem;color:var(--red)}#live-shell{height:100dvh;display:flex;flex-direction:column}#live-shell iframe{border:none;width:100%;flex:1}#live-shell a{align-self:center;color:var(--red);padding:8px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(max-width:760px){.layout{grid-template-columns:1fr}.hero{padding-top:25px}.catalog,.cart{padding-left:16px;padding-right:16px}}@media(max-width:440px){header{min-height:72px}.brand img{width:43px;height:43px}.brand strong{font-size:1.2rem}.brand small{font-size:.76rem}.controls{grid-template-columns:1fr 1fr}.controls label:nth-child(3){grid-column:1/-1;width:86px}header>a{font-size:.83rem}}",
    "</style></head><body>",
    "<div id=\"live-shell\" hidden><a id=\"direct\" target=\"_blank\" rel=\"noreferrer\">Formular in eigenem Fenster öffnen</a><iframe id=\"frame\" title=\"Bestellformular des Vereins\" referrerpolicy=\"no-referrer\"></iframe></div>",
    "<div id=\"page\"><header><div class=\"brand\"><img id=\"logo\" alt=\"MonChéri Pétanque\" src=\"https://assets.zyrosite.com/A3QEqxZZ8VSnn6x7/mon_chi_trans-YbNDp1VqNViX14VW.png\"><div><strong>MonChéri Pétanque</strong><small>TV Groß-Zimmern 1863 e.V.</small></div></div><a href=\"https://www.moncheri-petanque.de/\" target=\"_blank\" rel=\"noreferrer\">Vereinsseite</a></header>",
    "<main><div class=\"hero\"><h1>Vereinskleidung</h1><p>Stelle deine Bestellung für die gemeinsame Stickerei zusammen.</p></div><div id=\"notice\" class=\"notice\" role=\"status\">Bestellrunde wird geladen …</div>",
    "<div class=\"layout\" id=\"shop\" hidden><section class=\"box catalog\"><h2>Artikel auswählen</h2><div id=\"catalog\"></div></section><section class=\"box cart\"><h2>Deine Bestellung</h2><p id=\"empty\" class=\"empty\">Deine Auswahl erscheint hier.</p><ul id=\"lines\"></ul><div class=\"total\"><span>Überweisungsbetrag</span><strong id=\"total\">0,00 €</strong></div><form id=\"order\"><label>Name oder Spitzname<input id=\"who\" required maxlength=\"60\" autocomplete=\"off\" placeholder=\"Wie kennt dich der Verein?\"></label><button id=\"send\" type=\"submit\" disabled>Bestellung abgeben</button></form><div id=\"status\" class=\"status\" role=\"status\"></div><details class=\"details\"><summary>Wer sieht meine Angaben?</summary><p>Die Orga sieht deinen Namen, deine Auswahl und den Zahlungsstatus. Die Stickerei erhält Artikel, Farbe, Größe, Stückzahl und gegebenenfalls deinen gewünschten Sticktext.</p><p id=\"privacy\" class=\"preserve\"></p></details></section></div>",
    "<section id=\"receipt\" class=\"box receipt\" tabindex=\"-1\" hidden><h2 id=\"receipt-title\">Bestellung eingegangen</h2><p>Dein Überweisungsbetrag<br><b id=\"receipt-total\"></b></p><p>Verwendungszweck<br><strong id=\"ref\"></strong></p><p id=\"payment\" class=\"preserve\"></p><p id=\"receipt-note\"></p></section>",
    "<div class=\"sr\" aria-live=\"polite\" id=\"announcer\"></div></main>",
    "<footer><span>MonChéri · Abteilung Pétanque</span><a href=\"https://www.moncheri-petanque.de/impressum\" target=\"_blank\" rel=\"noreferrer\">Impressum des Vereins</a><a href=\"https://www.moncheri-petanque.de/datenschutz\" target=\"_blank\" rel=\"noreferrer\">Datenschutz des Vereins</a></footer></div>",
    "<script>",
    "'use strict';",
    "const $=id=>document.getElementById(id);",
    "const money=cents=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);",
    "const example=[",
    " ['shirt','T-Shirt',1800,['Weiß','Bordeaux']],['polo','Polohemd',2950,['Weiß','Bordeaux']],['anzug','Jogginganzug',6400,['Marine']],['cap','Kappe',1500,['Bordeaux']],['tasche','Sporttasche',3200,['Schwarz']]",
    "].map(([id,name,cents,colors],i)=>({id,name,cents,colors,sizes:i<3?['S','M','L','XL','XXL']:['Einheitsgröße'],custom:id==='tasche'}));",
    "const hosted=typeof google!=='undefined' && !!google.script?.run;",
    "let token='',cart=[],demo=false,ready=false,busy=false,attempt=null,storageKey='';",
    "function el(tag,txt,cls){const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;}",
    "function select(values){const n=el('select');values.forEach(v=>n.append(el('option',v)));return n;}",
    "function label(txt,control){const n=el('label',txt);n.append(control);return n;}",
    "function stash(v){if(!storageKey)return;try{if(v)sessionStorage.setItem(storageKey,JSON.stringify(v));else sessionStorage.removeItem(storageKey)}catch{}}",
    "function cached(){try{return JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{return null}}",
    "function rpc(method,...args){return new Promise((resolve,reject)=>{google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[method](...args);});}",
    "function product(p){",
    " const d=el('details',undefined,'product'), head=el('summary');",
    " const plus=el('span','+','plus');plus.setAttribute('aria-hidden','true');head.append(el('strong',p.name),el('span',money(p.cents),'price'),plus);",
    " const f=el('form',undefined,'controls'),size=select(p.sizes),color=select(p.colors),qty=el('input');",
    " qty.type='number';qty.min=1;qty.max=99;qty.step=1;qty.value=1;qty.required=true;",
    " f.append(label('Größe',size),label('Farbe',color),label('Menge',qty));",
    " const note=el('input');note.maxLength=30;",
    " if(p.custom){const fld=label('Sticktext (optional)',note);fld.className='full';f.append(fld);}",
    " const add=el('button','Zur Bestellung hinzufügen','secondary full');add.type='submit';f.append(add);d.append(head,f);",
    " f.onsubmit=e=>{",
    "  e.preventDefault();if(busy||attempt)return;",
    "  const item={id:p.id,name:p.name,cents:p.cents,size:size.value,color:color.value,qty:Number(qty.value),text:note.value.trim()};",
    "  const prev=cart.find(x=>x.id===item.id&&x.size===item.size&&x.color===item.color&&x.text===item.text);",
    "  if(prev && prev.qty+item.qty>99){$('status').textContent='Pro Variante sind höchstens 99 Stück möglich.';return;}",
    "  if(!prev&&cart.length>=40){$('status').textContent='Eine Bestellung kann bis zu 40 Positionen enthalten.';return;}",
    "  if(prev)prev.qty+=item.qty;else cart.push(item);",
    "  $('status').textContent='';$('announcer').textContent=p.name+' hinzugefügt.';d.open=false;drawCart();",
    " };return d;",
    "}",
    "function drawCart(){",
    " const list=$('lines');list.replaceChildren();cart.forEach((x,i)=>{",
    "  const li=el('li',undefined,'line'),info=el('div');info.append(el('strong',x.qty+' × '+x.name),el('small',[x.color,x.size,x.text].filter(Boolean).join(' · ')));",
    "  const remove=el('button','Entfernen','remove');remove.type='button';remove.setAttribute('aria-label',x.name+' '+x.size+' entfernen');remove.disabled=busy||!!attempt;",
    "  remove.onclick=()=>{cart.splice(i,1);drawCart()};li.append(info,el('span',money(x.qty*x.cents)),remove);list.append(li);",
    " });",
    " $('empty').hidden=cart.length>0;$('total').textContent=money(cart.reduce((n,x)=>n+x.qty*x.cents,0));",
    " $('who').disabled=busy||!!attempt;$('send').disabled=!ready||!cart.length||busy;",
    " $('send').textContent=busy?'Wird übermittelt …':attempt?'Bestellbestätigung abrufen':demo?'Testbestellung abschließen':'Bestellung abgeben';",
    "}",
    "function showCatalog(data){",
    " ready=data.open;",
    " $('notice').textContent=demo?'Vorschau mit Beispielpreisen. Du kannst alles ausprobieren. Eine Testbestellung löst keine Bestellung oder Zahlung aus.':!ready?'Die Bestellrunde ist geschlossen.':'';",
    " if(!ready&&!attempt)return;",
    " $('privacy').textContent=data.privacy||'';$('catalog').replaceChildren(...data.products.map(product));",
    " if(!data.products.length)$('catalog').append(el('p','Derzeit sind keine Artikel freigegeben.'));",
    " $('shop').hidden=false;drawCart();",
    "}",
    "function receipt(r){",
    " $('shop').hidden=true;$('notice').textContent='';$('receipt-title').textContent=demo?'Testbestellung abgeschlossen':'Bestellung eingegangen';$('receipt-total').textContent=money(r.total);$('ref').textContent=r.ref;",
    " $('payment').textContent=demo?'Dies ist eine Vorschau. Bitte nichts überweisen.':r.payment||'Die Bankverbindung erhältst du von der Vereinsorga.';",
    " $('receipt-note').textContent=demo?'Du kannst die Seite neu laden und eine weitere Auswahl testen.':'Speichere dir Betrag und Referenz, zum Beispiel als Screenshot.';",
    " $('receipt').hidden=false;$('receipt').focus();",
    "}",
    "$('order').onsubmit=async e=>{",
    " e.preventDefault();if(busy||!cart.length)return;",
    " if(!$('who').value.trim()){$('status').textContent='Bitte trage deinen Namen oder Spitznamen ein.';return;}",
    " if(demo){receipt({ref:'VORSCHAU',total:cart.reduce((n,x)=>n+x.qty*x.cents,0)});return;}",
    " if(!attempt)attempt={key:crypto.randomUUID(),name:$('who').value.trim(),items:cart.map(x=>({...x}))};",
    " stash({pending:attempt});busy=true;$('status').textContent='';drawCart();",
    " try{const r=await rpc('submitOrder',token,attempt);stash({receipt:r});receipt(r);}",
    " catch(err){const msg=String(err.message||err);",
    " if(/Sortiment oder ein Preis|Runde ist geschlossen|Bestellrunde ist geschlossen|Texteingabe|kein Sticktext|Menge muss|Positionen|erneut|Spitznamen/.test(msg)){attempt=null;stash(null);}",
    " $('status').textContent=msg.replace(/^(ScriptError: |Exception: |Error: )+/,'')+(attempt?' Du kannst dieselbe Anfrage erneut senden.':'');}",
    " finally{busy=false;drawCart();}",
    "};",
    "async function start(){",
    " const hash=new URLSearchParams(location.hash.slice(1));",
    " if(!hosted && hash.has('k')){",
    "  const k=hash.get('k')||'';",
    "  if(!/^[0-9a-f]{64}$/.test(k)){$('notice').textContent='Der Einladungslink ist unvollständig. Bitte öffne den vollständigen Link aus der Vereinsgruppe.';return;}",
    "  try {",
    "   const response=await fetch('./konfiguration.json',{cache:'no-store'});",
    "   if(!response.ok)throw new Error();",
    "   const cfg=await response.json();",
    "   if(typeof cfg.webApp!=='string'||!/^https:\\/\\/script\\.google\\.com\\/macros\\/s\\/[A-Za-z0-9_-]{12,200}\\/exec$/.test(cfg.webApp))throw new Error();",
    "   const url=cfg.webApp+'#k='+k;",
    "   $('page').hidden=true;$('live-shell').hidden=false;$('direct').href=url;$('frame').src=url;",
    "  } catch {$('notice').textContent='Die Vereinsdomain ist noch nicht mit dem Formular verbunden. Bitte nutze den Direktlink der Orga.';}",
    "  return;",
    " }",
    " if(!hosted){demo=true;showCatalog({open:true,products:example});return;}",
    " google.script.url.getLocation(async loc=>{",
    "  token=new URLSearchParams(loc.hash||'').get('k')||'';storageKey='mc-v1-'+token;",
    "  try{",
    "   const data=await rpc('getCatalog',token),saved=cached();",
    "   if(saved?.receipt){receipt(saved.receipt);return;}",
    "   if(saved?.pending){attempt=saved.pending;cart=attempt.items;$('who').value=attempt.name;data.open=true;$('status').textContent='Deine letzte Übermittlung wurde unterbrochen. Rufe die Bestätigung mit derselben Referenz ab.';}",
    "   showCatalog(data);",
    "  }catch(err){$('notice').textContent=String(err.message||err).replace(/^(ScriptError: |Exception: |Error: )+/,'');}",
    " });",
    "}",
    "const crest=$('logo');",
    "crest.onerror=function(){",
    " const backup='https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=169,h=171,fit=crop/A3QEqxZZ8VSnn6x7/mc_trans_2-AGBreN7o7vT2NWy0.png';",
    " if(crest.src!==backup){crest.src=backup;}else{crest.hidden=true;}",
    "};",
    "start();",
    "</script></body></html>"
  ].join('\n');
}
