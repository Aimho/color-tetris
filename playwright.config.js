import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  fullyParallel:true,
  forbidOnly:Boolean(process.env.CI),
  retries:process.env.CI ? 2 : 0,
  workers:process.env.CI ? 2 : undefined,
  reporter:[
    ['line'],
    ['html', {open:'never'}],
  ],
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure',
  },
  webServer:{
    command:'npm run dev -- --host 127.0.0.1 --port 4173',
    env:{VITE_E2E:'true'},
    url:'http://127.0.0.1:4173',
    reuseExistingServer:false,
    timeout:120_000,
  },
  projects:[
    {name:'desktop-chrome', use:{...devices['Desktop Chrome']}},
    {name:'pixel-5', use:{...devices['Pixel 5']}},
    {name:'iphone-se', use:{...devices['iPhone SE (3rd gen)']}},
    {name:'iphone-12', use:{...devices['iPhone 12']}},
    {name:'ipad-mini', use:{...devices['iPad Mini']}},
  ],
});
