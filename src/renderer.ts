import { h, render } from 'preact';
import Logger from './logger';
import { App } from './renderer/app';

Logger.initRenderer();

window.addEventListener('DOMContentLoaded', () => {
  Logger.info('Renderer started');
  const root = document.getElementById('root');
  if (root) render(h(App, {}), root);
});
