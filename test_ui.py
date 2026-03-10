import asyncio
from playwright.async_api import async_playwright
import time

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto('http://localhost:12344')
        await page.wait_for_selector('#btn-google-signin')
        await page.evaluate('_handleSignIn("fake_token")')
        await page.wait_for_timeout(2000) # give time for JS to render main app
        await page.screenshot(path='/Users/evanpark/.gemini/antigravity/brain/f00082a3-e43c-4de8-97dd-d01ca2ed7a1a/main_ui.png')
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
