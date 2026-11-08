export const BUSY_REASON='Právě probíhá zpracování. Počkej na jeho dokončení.';
export const LAYER_REASON='Nejdřív vyber obrazovou vrstvu v seznamu, nebo přidej nový obrázek.';
export const LEGACY_REASON='Tato spuštěná verze tuto funkci neumí. Nový projekt to nezmění. Použij „Otevřít aktuální editor“ v upozornění nahoře.';
type Control=HTMLInputElement|HTMLButtonElement|HTMLSelectElement;
type Binding={wrapper:HTMLDivElement;tooltip:HTMLSpanElement;reason:HTMLSpanElement;help:string;describedBy:string};
const bindings=new WeakMap<Control,Binding>();
let sequence=0;

/** Native disabled controls stay disabled; a focusable wrapper explains why. */
export function setControlState(control:Control,reason:string|null=null,help?:string,inline=true):void{
  if(control instanceof HTMLInputElement&&control.type==='file'){
    control.disabled=Boolean(reason);return;
  }
  let binding=bindings.get(control);
  if(!binding){
    const label=control.closest('label');
    const host=label&&label.querySelectorAll('input,select,button').length===1?label:control;
    const wrapper=document.createElement('div');wrapper.className='ux-control';
    wrapper.setAttribute('role','group');
    wrapper.addEventListener('keydown',event=>{if(event.key==='Escape')wrapper.classList.add('tooltip-dismissed');});
    wrapper.addEventListener('pointerleave',()=>wrapper.classList.remove('tooltip-dismissed'));
    wrapper.addEventListener('focusout',()=>wrapper.classList.remove('tooltip-dismissed'));
    wrapper.setAttribute('aria-label',control.getAttribute('aria-label')||label?.textContent?.trim()||control.textContent?.trim()||control.id);
    host.before(wrapper);wrapper.append(host);
    const tooltip=document.createElement('span');tooltip.className='ux-tooltip';tooltip.id=`ux-tooltip-${++sequence}`;tooltip.setAttribute('role','tooltip');
    const explanation=document.createElement('span');explanation.className='ux-reason';
    wrapper.append(explanation,tooltip);
    binding={wrapper,tooltip,reason:explanation,help:control.title,describedBy:control.getAttribute('aria-describedby')||''};bindings.set(control,binding);
  }
  if(help!==undefined)binding.help=help;
  const text=[reason,binding.help].filter(Boolean).join(' ');
  control.disabled=Boolean(reason);control.setAttribute('aria-disabled',String(Boolean(reason)));
  control.title=text;binding.wrapper.title=text;
  binding.wrapper.tabIndex=reason?0:-1;
  binding.wrapper.classList.toggle('is-unavailable',Boolean(reason));
  binding.wrapper.classList.toggle('has-tooltip',Boolean(text));
  binding.tooltip.textContent=text;
  binding.reason.textContent=reason||'';
  // The working overlay already explains a busy state; don't repeat it below every field.
  binding.reason.hidden=!inline||!reason||reason===BUSY_REASON;
  const description=[binding.describedBy,text?binding.tooltip.id:''].filter(Boolean).join(' ');
  if(description){control.setAttribute('aria-describedby',description);binding.wrapper.setAttribute('aria-describedby',description);}
  else{control.removeAttribute('aria-describedby');binding.wrapper.removeAttribute('aria-describedby');}
}

interface SharedState {busy:boolean;hasLayer:boolean;index:number;count:number;resultReady:boolean;}
export interface FlatControlContext extends SharedState {legacy:boolean;bridge:boolean;border:boolean;printMode:string;filter:string;}
export interface MoonControlContext extends SharedState {modelLoaded:boolean;hasResult:boolean;blender:boolean;}
export function layerOrderNote(state:SharedState):string{
  if(!state.hasLayer)return LAYER_REASON;
  if(state.count===1)return 'Toto je jediná obrazová vrstva. Pořadí půjde měnit po přidání další vrstvy.';
  if(state.index===state.count-1)return 'Vybraná vrstva je úplně nahoře; posunout ji lze pouze níž.';
  if(state.index===0)return 'Vybraná vrstva je úplně dole; posunout ji lze pouze výš.';
  return '';
}
function orderReason(id:string,state:SharedState):string|null{
  if(['up','down','layer-up','layer-down'].includes(id)){
    if(!state.hasLayer)return LAYER_REASON;
    if((id==='up'||id==='layer-up')&&state.index===state.count-1)return 'Vrstva už je úplně nahoře. Výš ji posunout nelze.';
    if((id==='down'||id==='layer-down')&&state.index===0)return 'Vrstva už je úplně dole nad podkladem. Níž ji posunout nelze.';
  }
  return null;
}
const flatLayerIds=new Set(['layer-name','replace-file','replace-url','copy','remove','x-mm','y-mm','width-mm','height-mm','angle-deg','strength']);
const moonLayerIds=new Set(['width','height','angle','strength','layer-name','layer-copy','layer-remove','replace-file','replace-url','move']);
export function flatControlReason(id:string,state:FlatControlContext,imageSetting=false):string|null{
  if(state.busy)return BUSY_REASON;
  if(state.legacy&&['border-height-mm','allow-overflow'].includes(id))return LEGACY_REASON;
  if(!state.hasLayer&&(imageSetting||flatLayerIds.has(id)))return LAYER_REASON;
  const order=orderReason(id,state);if(order)return order;
  if(id==='calculate'&&!state.bridge)return 'Výpočet .NET není připravený. Spusť aplikaci pomocí Start-Luna.ps1, který jej sestaví.';
  if(id==='export'&&!state.resultReady)return 'Nejdřív klikni na „Přepočítat model v .NET“. Po změně obrázku nebo desky je potřeba nový přepočet.';
  if(['border-mm','border-height-mm'].includes(id)&&!state.border)return 'Nejdřív zapni „Okraj pro uchycení do rámečku“.';
  if(['nozzle-mm','pixel-ratio'].includes(id)&&state.printMode!=='FDM')return 'Tyto parametry patří k tisku FDM. Pro jejich změnu vyber tisk FDM.';
  if(id==='resin-resolution'&&state.printMode!=='Resin')return 'Toto rozlišení platí pro pryskyřici. Pro jeho změnu vyber tisk Pryskyřice.';
  if(['sigma','threshold'].includes(id)&&state.filter!=='GaussianBlur')return 'Vyber vyhlazování „Gaussovo vyhlazení“, aby se tento parametr použil.';
  if(id==='window'&&state.filter!=='MedianFilter')return 'Vyber vyhlazování „Medián“, aby se tento parametr použil.';
  if(['spatial','range'].includes(id)&&state.filter!=='BilateralFilter')return 'Vyber vyhlazování „Bilaterální filtr“, aby se tento parametr použil.';
  return null;
}
export function moonControlReason(id:string,state:MoonControlContext,imageSetting=false):string|null{
  if(state.busy)return BUSY_REASON;
  if(!state.modelLoaded&&['apply','open-motif','add-url','export','bundle','render','save','snapshot'].includes(id))return 'Nejdřív načti STL nebo založ nový projekt s Měsícem.';
  if(!state.hasLayer&&(imageSetting||moonLayerIds.has(id)))return LAYER_REASON;
  const order=orderReason(id,state);if(order)return order;
  if(id==='render'&&!state.blender)return 'Blender není nainstalovaný. Po ověření modelu můžeš stáhnout scénu a vykreslit ji na počítači s Blenderem.';
  if(['export','bundle','render'].includes(id)&&!state.resultReady)return state.hasResult
    ?'Model neprošel kontrolou tloušťky. Uprav meze nebo dominanci motivu a znovu přepočítej model.'
    :'Nejdřív klikni na „Přepočítat a ověřit model“. Po změně motivu je potřeba nové ověření.';
  return null;
}

export const CONTROL_HELP:Record<string,string>={
  'allow-overflow':'Po zapnutí může obrázek přesahovat obrazovou plochu. Přesah se ořízne; lem ani celkové rozměry tisku se nezmění. Platí pro všechny vrstvy.',
  'border-mm':'Šířka lemu od vnějšího okraje směrem k obrázku, na každé straně desky.',
  'border-height-mm':'Výška lemu v ose Z pro zasunutí do drážky rámečku. Je nezávislá na minimu a maximu obrázku.',
  'save':'Stáhne jeden projekt .luna s obrázky, vrstvami a nastavením pro další úpravy. Aktuální přepočítané STL se přibalí, pokud je dostupné.',
  'export':'Stáhne výsledný model .stl pro přípravu tisku.',
  'calculate':'Původní .NET jádro vytvoří přesný povrch, provede vyhlazení a připraví tiskové STL.',
  'apply':'Přepočítá geometrii a zkontroluje vzorky tloušťky před exportem.',
  'width-mm':'Změní šířku motivu. Drž Shift pro zachování poměru stran.',
  'height-mm':'Změní výšku motivu. Drž Shift pro zachování poměru stran.',
  'up':'Posune vrstvu výš; vyšší vrstvy překrývají nižší podle průhlednosti a dominance.',
  'down':'Posune vrstvu níž pod ostatní motivy.',
};

export function currentEditorUrl(value:unknown,origin:string):string|null{
  if(typeof value!=='string')return null;
  try{const url=new URL(value);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.pathname!=='/flat.html'||url.search||url.hash||url.origin===origin)return null;
    return url.href;
  }catch{return null;}
}
