import {defineConfig} from 'vite';

export default defineConfig({build:{rollupOptions:{input:{moon:'index.html',flat:'flat.html'}}}});
