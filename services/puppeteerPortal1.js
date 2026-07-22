import { writeFileSync } from 'fs';
import { launch } from 'puppeteer';
import Session from '../models/Session';

// Active In-Memory Map to preserve open browser tabs during OTP waiting state
const activeLoginSessions = new Map();

const PUPPETEER_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
  '--window-size=1366,768',
];

const getBrowser = async () => {
  const options = {
    headless: 'new',
    args: PUPPETEER_FLAGS,
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  return await launch(options);
};

const setupPageOptimization = async (page) => {
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
};

const sanitizeCookies = (rawCookies) => {
  if (!Array.isArray(rawCookies)) return [];
  return rawCookies
    .filter((c) => c && c.name && c.value)
    .map((c) => ({
      name: String(c.name),
      value: String(c.value),
      domain: c.domain ? String(c.domain) : 'services.livpartner.com',
      path: c.path ? String(c.path) : '/',
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
    }));
};

const applyCookiesSafely = async (page, rawCookies) => {
  const cleanCookies = sanitizeCookies(rawCookies);
  for (const cookie of cleanCookies) {
    try {
      await page.setCookie(cookie);
    } catch (e) {
      console.warn(`[Portal 1 Cookie Warning] Skipping cookie ${cookie.name}: ${e.message}`);
    }
  }
};

/**
 * Navigate to Pending Cases (KitchenApp) via Direct URL on active authenticated tab
 */
const navigateAndScrapePendingCases = async (page) => {
  console.log('[Portal 1] Navigating to Pending Cases via Direct URL...');

  try {
    const targetUrl = 'https://services.livpartner.com/ci_service/index.php/my_cases/pending_case?type=KitchenApp';

    console.log(`[Portal 1] Loading URL directly: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });

    console.log('[Portal 1] Waiting for table data to load and stabilize...');
    await new Promise((r) => setTimeout(r, 6000));

    // ==========================================
    // DEBUGGING BLOCK: Save screenshot & HTML dump
    // ==========================================
    console.log('[Portal 1 DEBUG] Saving screenshot and HTML to project folder...');
    await page.screenshot({ path: 'debug_portal.png', fullPage: true }).catch(() => null);
    const pageHTML = await page.content();
    writeFileSync('debug_html.txt', pageHTML);
    console.log('[Portal 1 DEBUG] Screenshot (debug_portal.png) and HTML (debug_html.txt) saved!');
    // ==========================================

    // Set "Show entries" dropdown to max (100)
    await page.evaluate(() => {
      const lengthSelect = document.querySelector('select[name*="length"], .dataTables_length select');
      if (lengthSelect) {
        const lastOption = lengthSelect.options[lengthSelect.options.length - 1];
        if (lastOption) {
          lengthSelect.value = lastOption.value;
          lengthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    await new Promise((r) => setTimeout(r, 3000));

    // Extract all rows from target DataTables table
    const cases = await page.evaluate(() => {
      const table = document.querySelector('table.dataTable, table#pending_cases, table.table-striped, table[id*="table"], table');
      if (!table) return [];

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const results = [];

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td')).map((c) => c.innerText.trim());
        if (
          cells.length < 5 ||
          cells[0].toLowerCase().includes('no data') ||
          cells[0].toLowerCase().includes('loading') ||
          cells[0].toLowerCase().includes('no matching records')
        ) {
          continue;
        }

        results.push({
          jobSheet: cells[0] || 'N/A',
          escalated: cells[1] || 'No',
          productModel: cells[2] || 'N/A',
          customerName: cells[3] || 'N/A',
          contactNo: cells[4] ? cells[4].replace(/Call/gi, '').trim() : 'N/A',
          address: cells[5] || 'N/A',
          caseType: cells[6] || 'N/A',
          businessType: cells[7] || 'N/A',
          caseStatus: cells[8] || 'N/A',
          caseSubType: cells[9] || 'N/A',
          descriptionName: cells[10] || 'N/A',
          purchaseDate: cells[11] || 'N/A',
          caseCreateDate: cells[12] || 'N/A',
          enggAssignDate: cells[13] || 'N/A',
          enggName: cells[14] ? cells[14].replace(/--Select--/gi, '').trim() : 'N/A',
        });
      }

      return results;
    });

    console.log(`[Portal 1] Successfully extracted ${cases.length} pending cases`);
    return cases;
  } catch (err) {
    console.error('[Portal 1 Scrape Error]:', err.message);
    throw new Error('Failed to extract table data: ' + err.message);
  }
};

/**
 * Main function: Login & Scrape Livpure Partner Portal
 */
const initiatePortal1Login = async () => {
  let browser;
  let keepBrowserOpen = false;

  try {
    const portalUrl = process.env.PORTAL1_URL || 'https://services.livpartner.com/ci_service/index.php/Login';
    const username = process.env.PORTAL1_USERNAME || '141000620';
    const password = process.env.PORTAL1_PASSWORD || 'Sar@123';

    // 1. Try DB Cookies first
    const sessionDoc = await Session.findOne({ portal: 'PORTAL1' });
    if (sessionDoc && sessionDoc.cookies && sessionDoc.cookies.length > 0) {
      if (!sessionDoc.expiresAt || new Date() < sessionDoc.expiresAt) {
        console.log('[Portal 1] Testing saved session cookies from DB...');
        browser = await getBrowser();
        const page = await browser.newPage();
        await setupPageOptimization(page);

        try {
          await applyCookiesSafely(page, sessionDoc.cookies);
          const cases = await navigateAndScrapePendingCases(page);
          if (cases.length > 0) {
            keepBrowserOpen = false;
            return { success: true, complaints: cases, otpRequired: false };
          }
        } catch (cookieErr) {
          console.warn('[Portal 1 Cookie Warning]:', cookieErr.message);
        }
        await Session.deleteOne({ portal: 'PORTAL1' });
      }
    }

    if (browser) {
      await browser.close();
      browser = null;
    }

    // 2. Fresh Login
    console.log(`[Portal 1] Performing fresh login for user: ${username}`);
    browser = await getBrowser();
    const page = await browser.newPage();
    await setupPageOptimization(page);

    await page.goto(portalUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const userInputSelector = '#username, #user_id, input[name="username"], input[name="user_id"], input[name="login_id"], input[type="text"]';
    const passInputSelector = '#password, input[name="password"], input[type="password"]';

    await page.waitForSelector(userInputSelector, { timeout: 10000 });
    await page.type(userInputSelector, username);
    await page.type(passInputSelector, password);

    const loginBtnSelector = 'button[type="submit"], input[type="submit"], #btn-login, .btn-login, input[name="submit"]';
    const loginBtn = await page.$(loginBtnSelector);

    if (loginBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
        loginBtn.click(),
      ]);
    }

    const otpSelector = '#otp, input[name="otp"], input[placeholder*="OTP"], input[name="otp_code"]';
    const hasOtpField = await page.$(otpSelector).catch(() => null);

    if (hasOtpField) {
      console.log('[Portal 1] OTP requirement detected! Keeping browser open in background...');
      activeLoginSessions.set('PORTAL1', { browser, page });
      keepBrowserOpen = true;
      return { otpRequired: true, message: 'OTP verification required' };
    }

    const cookies = await page.cookies();
    await saveSessionCookies(cookies);

    const cases = await navigateAndScrapePendingCases(page);
    return { success: true, complaints: cases, otpRequired: false };
  } catch (error) {
    console.error('[Portal 1 Error]:', error.message);
    throw error;
  } finally {
    if (browser && !keepBrowserOpen) {
      await browser.close();
      console.log('[Portal 1] Browser closed cleanly in finally block');
    }
  }
};

/**
 * Submit OTP using kept-alive active browser session
 */
const verifyOtpAndScrape = async (otpInput) => {
  const session = activeLoginSessions.get('PORTAL1');

  if (!session || !session.page || !session.browser) {
    throw new Error('No active login session found. Browser might have closed. Please send /pending again.');
  }

  const { browser, page } = session;

  try {
    console.log(`[Portal 1] Entering OTP "${otpInput}" on active page...`);

    const otpSelector = '#otp, input[name="otp"], input[placeholder*="OTP"], input[name="otp_code"]';
    const otpElement = await page.$(otpSelector);

    if (!otpElement) {
      throw new Error('OTP input box disappeared. Session expired.');
    }

    await otpElement.type(otpInput.trim());

    const submitBtn = await page.$(
      'button[type="submit"], input[type="submit"], #btn-verify-otp, #btn-login, .btn-login, input[value*="Submit"], input[value*="Login"]'
    );
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => null),
        submitBtn.click(),
      ]);
    }

    const currentUrl = page.url();
    if (currentUrl.includes('Login')) {
      throw new Error('Invalid OTP. Portal rejected it and redirected back to Login page.');
    }

    const cookies = await page.cookies();
    await saveSessionCookies(cookies);

    // Perform direct URL navigation on active tab
    const cases = await navigateAndScrapePendingCases(page);
    return { success: true, complaints: cases };
  } catch (error) {
    console.error('[Portal 1 OTP Verification Error]:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      activeLoginSessions.delete('PORTAL1');
      console.log('[Portal 1] Active OTP browser session closed and memory cleared.');
    }
  }
};

/**
 * Save session cookies to MongoDB
 */
const saveSessionCookies = async (cookies) => {
  await Session.findOneAndUpdate(
    { portal: 'PORTAL1' },
    {
      portal: 'PORTAL1',
      cookies,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
      updatedAt: new Date(),
    },
    { upsert: true }
  );
};

export default {
  initiatePortal1Login,
  verifyOtpAndScrape,
  scrapePendingComplaints: async () => {
    const res = await initiatePortal1Login();
    return res.complaints || [];
  },
};
