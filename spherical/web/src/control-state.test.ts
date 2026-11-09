// @vitest-environment jsdom
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {setControlState,flatControlReason,moonControlReason,currentEditorUrl,BUSY_REASON,LEGACY_REASON,LAYER_REASON,type FlatControlContext} from './control-state';

const fresh:FlatControlContext={busy:false,hasLayer:true,index:0,count:1,resultReady:false,legacy:false,bridge:true,border:true,printMode:'FDM',filter:'BilateralFilter'};
describe('explanations for flat editor availability',()=>{
  it('allows overflow in a new compatible project, including a project without layers',()=>{
    expect(flatControlReason('allow-overflow',fresh)).toBeNull();
    expect(flatControlReason('allow-overflow',{...fresh,hasLayer:false,index:-1,count:0})).toBeNull();
  });
  it('explains why a new project on an older service cannot enable overflow',()=>{
    expect(flatControlReason('allow-overflow',{...fresh,legacy:true})).toBe(LEGACY_REASON);
    expect(LEGACY_REASON).toContain('Nový projekt to nezmění');
    expect(LEGACY_REASON).toContain('Otevřít aktuální editor');
  });
  it('explains work in progress and restores the original reason afterwards',()=>{
    expect(flatControlReason('allow-overflow',{...fresh,busy:true,legacy:true})).toBe(BUSY_REASON);
    expect(flatControlReason('allow-overflow',{...fresh,busy:false,legacy:true})).toBe(LEGACY_REASON);
  });
  it('gives an actionable reason for each dependent control',()=>{
    expect(flatControlReason('width-mm',{...fresh,hasLayer:false})).toBe(LAYER_REASON);
    expect(flatControlReason('export',fresh)).toContain('Přepočítat model v .NET');
    expect(flatControlReason('export',{...fresh,resultReady:true})).toBeNull();
    expect(flatControlReason('calculate',{...fresh,bridge:false})).toContain('Start-Luna.ps1');
    expect(flatControlReason('border-height-mm',{...fresh,border:false})).toContain('Nejdřív zapni');
    expect(flatControlReason('up',fresh)).toContain('úplně nahoře');
    expect(flatControlReason('down',fresh)).toContain('úplně dole');
    expect(flatControlReason('up',{...fresh,hasLayer:false,index:-1,count:0})).toBe(LAYER_REASON);
    expect(flatControlReason('resin-resolution',fresh)).toContain('Pryskyřice');
    expect(flatControlReason('nozzle-mm',{...fresh,printMode:'Resin'})).toContain('FDM');
    expect(flatControlReason('sigma',fresh)).toContain('Gaussovo');
    expect(flatControlReason('window',fresh)).toContain('Medián');
    expect(flatControlReason('spatial',{...fresh,filter:'None'})).toContain('Bilaterální');
  });
});
describe('moon editor availability',()=>{
  const moon={busy:false,hasLayer:false,index:-1,count:0,resultReady:false,modelLoaded:false,hasResult:false,blender:false};
  it('explains missing model, layer, calculation, invalid result and missing Blender',()=>{
    expect(moonControlReason('export',moon)).toContain('načti STL');
    expect(moonControlReason('width',{...moon,modelLoaded:true})).toBe(LAYER_REASON);
    expect(moonControlReason('export',{...moon,modelLoaded:true})).toContain('Přepočítat a ověřit');
    expect(moonControlReason('export',{...moon,modelLoaded:true,hasResult:true})).toContain('neprošel kontrolou');
    expect(moonControlReason('render',{...moon,modelLoaded:true,resultReady:true})).toContain('Blender není');
    expect(moonControlReason('bundle',{...moon,modelLoaded:true,resultReady:true})).toBeNull();
  });
});
describe('disabled controls in the DOM',()=>{
  beforeEach(()=>{document.body.innerHTML='';});
  it('shows a reason beside a disabled checkbox, exposes hover text and a keyboard-accessible explanation',()=>{
    document.body.innerHTML='<label><input id="overflow" type="checkbox">Povolit přesah</label>';
    const input=document.querySelector('input')!;
    setControlState(input,LEGACY_REASON,'Přesah se ořízne a lem zůstane zachovaný.');
    const wrapper=input.closest('.ux-control') as HTMLElement;
    expect(input.disabled).toBe(true);expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(wrapper.tabIndex).toBe(0);expect(wrapper.title).toContain(LEGACY_REASON);
    const reason=wrapper.querySelector('.ux-reason') as HTMLElement;
    expect(reason.hidden).toBe(false);expect(reason.textContent).toBe(LEGACY_REASON);
    const tooltip=document.getElementById(input.getAttribute('aria-describedby')!)!;
    expect(tooltip.getAttribute('role')).toBe('tooltip');expect(tooltip.textContent).toContain('Přesah se ořízne');
    wrapper.focus();expect(document.activeElement).toBe(wrapper);
    wrapper.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(wrapper.classList.contains('tooltip-dismissed')).toBe(true);
    wrapper.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
    expect(wrapper.classList.contains('tooltip-dismissed')).toBe(false);
    input.click();expect(input.checked).toBe(false);
  });
  it('removes stale disabled reasons and keeps label activation working after enabling',()=>{
    document.body.innerHTML='<label><input id="overflow" type="checkbox">Přesah</label>';
    const input=document.querySelector('input')!,label=document.querySelector('label')!;
    setControlState(input,LEGACY_REASON,'Ořízne přesah.');setControlState(input,null);
    expect(input.disabled).toBe(false);expect(input.title).toBe('Ořízne přesah.');
    expect(document.querySelectorAll('.ux-control')).toHaveLength(1);
    expect((document.querySelector('.ux-reason') as HTMLElement).hidden).toBe(true);
    expect((input.closest('.ux-control') as HTMLElement).tabIndex).toBe(-1);
    label.click();expect(input.checked).toBe(true);
  });
  it('does not activate a disabled button and does not duplicate wrappers on repeated updates',()=>{
    document.body.innerHTML='<button id="export" aria-describedby="existing">Exportovat</button><p id="existing">STL pro tisk</p>';
    const button=document.querySelector('button')!,action=vi.fn();button.onclick=action;
    setControlState(button,'Nejdřív přepočítej model.');setControlState(button,'Model se změnil. Přepočítej jej znovu.');
    button.click();expect(action).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.ux-control')).toHaveLength(1);
    expect(button.getAttribute('aria-describedby')).toContain('existing');
    expect(button.title).not.toContain('Nejdřív');
    setControlState(button,null);button.click();expect(action).toHaveBeenCalledOnce();
  });
  it('keeps busy explanations accessible without repeating visible text for every field',()=>{
    document.body.innerHTML='<button>Načíst</button>';const button=document.querySelector('button')!;
    setControlState(button,BUSY_REASON);
    expect(button.title).toBe(BUSY_REASON);
    expect((document.querySelector('.ux-reason') as HTMLElement).hidden).toBe(true);
  });
  it('keeps hidden file pickers hidden and unwrapped',()=>{
    document.body.innerHTML='<input type="file" hidden>';const input=document.querySelector('input')!;
    setControlState(input,BUSY_REASON);expect(input.disabled).toBe(true);expect(input.hidden).toBe(true);
    expect(document.querySelector('.ux-control')).toBeNull();
  });
});
describe('current editor destination',()=>{
  it('links to the actual local port without hardcoding a deployment port',()=>{
    expect(currentEditorUrl('http://127.0.0.1:8767/flat.html','http://127.0.0.1:8766')).toBe('http://127.0.0.1:8767/flat.html');
  });
  it.each(['https://evil.example/flat.html','javascript:alert(1)','http://user:pass@127.0.0.1:8767/flat.html','http://127.0.0.1:8767/other','http://127.0.0.1:8767/flat.html?redirect=other',null])('rejects unsafe or unrelated destinations',url=>{
    expect(currentEditorUrl(url,'http://127.0.0.1:8766')).toBeNull();
  });
  it('does not offer a misleading link back to the same outdated service',()=>{
    expect(currentEditorUrl('http://127.0.0.1:8766/flat.html','http://127.0.0.1:8766')).toBeNull();
  });
});
