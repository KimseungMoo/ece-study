import 'katex/dist/katex.min.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { boot } from './ui/app.js';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('ece-sw-update'));
  },
});

window.__eceUpdateSW = () => updateSW(true);

boot();
