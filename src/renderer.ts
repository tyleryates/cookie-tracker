import { h, render } from 'preact';
import { App } from './renderer/app';

window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  if (root) render(h(App, {}), root);
});
