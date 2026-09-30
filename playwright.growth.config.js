import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,
  use:{...base.use,baseURL:'http://127.0.0.1:4187'},
  webServer:{...base.webServer,command:'npm run dev -- --host 127.0.0.1 --port 4187',url:'http://127.0.0.1:4187'},
});
