import {defineConfig} from 'vite';

export default defineConfig({build:{rollupOptions:{input:{home:'index.html',moon:'sphere.html',flat:'flat.html'}}}});
