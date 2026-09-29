const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests', testMatch: '*.spec.cjs', timeout: 45000,
    use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } }
    ],
    webServer: { command: 'node tests/server.cjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI }
});
