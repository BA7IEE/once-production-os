import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),build:{outDir:'../../dist/design-review',emptyOutDir:true,sourcemap:false,rollupOptions:{input:fileURLToPath(new URL('design-review.html',import.meta.url))}}});
