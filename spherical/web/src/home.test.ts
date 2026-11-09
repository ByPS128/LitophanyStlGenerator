// @vitest-environment jsdom
/// <reference types="vite/client" />
import html from "../index.html?raw";
import {it,expect} from 'vitest';

it('offers distinct editor routes with an accessible introduction and save reminder',()=>{
  document.documentElement.innerHTML=html;
  expect(document.querySelector('h1')?.textContent).toContain('nové světlo');
  const cards=Array.from(document.querySelectorAll<HTMLAnchorElement>('a.editor'));
  expect(cards.map(card=>card.getAttribute('href'))).toEqual(['/flat.html','/sphere.html']);
  for(const card of cards)expect(card.querySelector('h3')?.textContent).toBeTruthy();
  expect(document.body.textContent).toContain('Před vypnutím');
  expect(document.body.textContent).toContain('Projekt .luna');
  expect(document.querySelector('script')).toBeNull();
});
