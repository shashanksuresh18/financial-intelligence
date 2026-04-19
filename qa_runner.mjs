import puppeteer from 'puppeteer';
import path from 'path';
const ARTIFACT_DIR = path.join(process.env.USERPROFILE, '.gemini', 'antigravity', 'brain', '9b7491b8-6f90-44dc-b920-811816574d50', '.system_generated', 'click_feedback');

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function run() {
  console.log("Starting QA Puppeteer Tests...");
  const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1440, height: 900 }});
  
  try {
    const page = await browser.newPage();
    
    console.log("Navigating to localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
    
    console.log("Searching Apple...");
    await page.type("input[type='search']", "Apple");
    await page.keyboard.press("Enter");
    
    console.log("Waiting for Apple report to load...");
    await page.waitForSelector("h2", { text: /Apple/i, timeout: 60000 });
    // wait for either "Strong Public" or something to settle
    await delay(10000); // Give time for the backend analysis to populate the memo
    
    const stressTestPath = path.join(ARTIFACT_DIR, 'click_feedback_1777000000001.png');
    
    // Check if Stress Test exists
    const stressTestExists = await page.evaluate(() => {
        return document.body.innerText.includes("Unstated Assumptions") || document.body.innerText.includes("Challenger");
    });
    console.log("TEST 2: Stress test UI presence:", stressTestExists);
    
    await delay(3000); 
    await page.screenshot({ path: stressTestPath, fullPage: true });
    
    console.log("Searching SpaceX...");
    // Clear search manually
    await page.click("input[type='search']", { clickCount: 3});
    await page.keyboard.press("Backspace");
    await page.type("input[type='search']", "SpaceX");
    await page.keyboard.press("Enter");
    
    console.log("Waiting for SpaceX report to load...");
    await delay(20000); 
    
    const spaceXPath = path.join(ARTIFACT_DIR, 'click_feedback_1777000000002.png');
    await page.screenshot({ path: spaceXPath, fullPage: true });

    const entityName = await page.evaluate(() => {
        const h2 = document.querySelector("h2");
        return h2 ? h2.innerText : "Not found";
    });
    console.log("TEST 3: SpaceX Resolved Entity:", entityName);

  } catch (err) {
    console.error("Puppeteer test failed:", err);
  } finally {
    await browser.close();
  }
}

run();
