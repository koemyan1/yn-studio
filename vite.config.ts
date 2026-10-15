import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore - plain JS build helper (see the comment at the top of that file)
import ynFit from './tools/postcss-yn-fit.mjs';
export default defineConfig({plugins:[react()],css:{postcss:{plugins:[ynFit()]}}});
