import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),build:{outDir:'../../dist/web',emptyOutDir:true,sourcemap:false},
  server:{fs:{allow:[fileURLToPath(new URL('../..',import.meta.url))],deny:['**/.secrets/**','**/secrets/**','**/data/**','**/.git/**','**/artifacts/**','**/.env*','**/*.pem','**/*.key']},host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:4318','/health':'http://127.0.0.1:4318'}}});
