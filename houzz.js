const { chromium } = require('playwright');
const fs = require('fs');
const XLSX = require('xlsx');

// ================= CONFIG =================
const START_FI = 1;
const END_FI = 1425;
const STEP = 15;

const PAGE_SLEEP_MS = 20000;     // 20s after each listing page
const BUSINESS_SLEEP_MS = 2000;  // 2s between businesses

const OUTPUT_JSON = 'houzz_businesses.json';
const OUTPUT_XLSX = 'houzz_businesses.xlsx';

const BASE_URL =
  'https://www.houzz.com/professionals/general-contractor/probr0-bo~t_11786';
// =========================================

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(60000);

  // Resume-safe load
  let results = [];
  if (fs.existsSync(OUTPUT_JSON)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf-8'));
  }
  const visited = new Set(results.map(r => r.url));

  console.log('🚀 START FULL SCRAPE');

  // ================= LISTING LOOP =================
  for (let fi = START_FI; fi <= END_FI; fi += STEP) {
    const listUrl = `${BASE_URL}?fi=${fi}`;
    console.log(`\n📄 LIST PAGE fi=${fi}`);
    console.log(listUrl);

    await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Force render cards
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);

    // ===== BUSINESS LINKS (YOUR CLASS) =====
    const businessLinks = await page.$$eval(
      'a.hui-link.hz-pro-ctl',
      els =>
        els
          .map(a => a.href)
          .filter(h =>
            h.startsWith('https://www.houzz.com/professionals/') &&
            !h.includes('probr0-bo~') &&
            !h.includes('?fi=') &&
            /~\d+$/.test(h)
          )
    );

    console.log(`➕ Found ${businessLinks.length} businesses`);

    // ================= BUSINESS LOOP =================
    for (const url of businessLinks) {
      if (visited.has(url)) {
        console.log(`⏩ Skip (saved): ${url}`);
        continue;
      }

      console.log(`🏢 Visiting: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      // ===== EXTRACT + MAP section#business =====
      const data = await page.evaluate(() => {
        const section = document.querySelector('section#business');
        if (!section) return null;

        const result = {};

        const cells = Array.from(section.querySelectorAll('.hui-cell'));

        const getByLabel = (label) => {
          for (const cell of cells) {
            const h3 = cell.querySelector('h3');
            if (h3 && h3.innerText.trim() === label) {
              const p = cell.querySelector('p');
              return p ? p.innerText.replace(/\s+/g, ' ').trim() : '';
            }
          }
          return '';
        };

        result.business_name = getByLabel('Business Name');
        result.phone = getByLabel('Phone Number');
        result.address = getByLabel('Address');
        result.typical_job_cost = getByLabel('Typical Job Cost');
        result.license_number = getByLabel('License Number');
        result.followers = getByLabel('Followers');

        // Website (main)
        const websiteCell = cells.find(
          c => c.querySelector('h3')?.innerText.trim() === 'Website'
        );
        result.website = websiteCell?.querySelector('a')?.innerText.trim() || '';

        // Socials
        result.facebook =
          section.querySelector('a[aria-label*="Facebook"]')?.href || '';
        result.linkedin =
          section.querySelector('a[aria-label*="Linkedin"]')?.href || '';
        result.other_website =
          section.querySelector('a[aria-label*="blog or other site"]')?.href || '';

        return result;
      });

      if (data) {
        const row = { url, ...data };
        results.push(row);
        visited.add(url);

        // Save JSON incrementally
        fs.writeFileSync(
          OUTPUT_JSON,
          JSON.stringify(results, null, 2),
          'utf-8'
        );

        console.log('   ✅ Business mapped & saved');
      } else {
        console.log('   ⚠️ section#business not found');
      }

      await page.waitForTimeout(BUSINESS_SLEEP_MS);
    }

    console.log(`⏸ Sleep ${PAGE_SLEEP_MS / 1000}s`);
    await page.waitForTimeout(PAGE_SLEEP_MS);
  }

  // ================= CREATE EXCEL =================
  console.log('\n📊 Creating Excel file');

  const rows = results.map((r, i) => ({
    No: i + 1,
    URL: r.url,
    'Business Name': r.business_name,
    Phone: r.phone,
    Website: r.website,
    Address: r.address,
    'Typical Job Cost': r.typical_job_cost,
    'License Number': r.license_number,
    Followers: r.followers,
    Facebook: r.facebook,
    LinkedIn: r.linkedin,
    'Other Website': r.other_website
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 }, { wch: 80 }, { wch: 30 }, { wch: 20 },
    { wch: 40 }, { wch: 50 }, { wch: 20 }, { wch: 20 },
    { wch: 15 }, { wch: 40 }, { wch: 40 }, { wch: 40 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Houzz Businesses');
  XLSX.writeFile(wb, OUTPUT_XLSX);

  console.log(`✅ Excel created: ${OUTPUT_XLSX}`);
  console.log('🏁 DONE');

  await browser.close();
})();
