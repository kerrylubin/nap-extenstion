import { chromium } from "playwright";

export async function scrapeJobUrl(url: string): Promise<string> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    // Block images/fonts/media to speed up loading
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    } catch {
      // networkidle timeout is fine — page may still have content
    }

    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      // 1. Scan contact info from the entire DOM before any cleanup
      const contactInfo = {
        emails: [] as string[],
        phones: [] as string[],
      };

      // Scan all mailto: and tel: links
      document.querySelectorAll("a[href]").forEach((el) => {
        const href = el.getAttribute("href") || "";
        if (href.startsWith("mailto:")) {
          const email = href.replace(/^mailto:/i, "").split("?")[0].trim();
          if (email) contactInfo.emails.push(email);
        } else if (href.startsWith("tel:")) {
          const phone = href.replace(/^tel:/i, "").trim();
          if (phone) contactInfo.phones.push(phone);
        }
      });

      // Scan entire page body text for email addresses
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const bodyText = document.body?.innerText || "";
      const emailMatches = bodyText.match(emailRegex);
      if (emailMatches) {
        emailMatches.forEach((email) => contactInfo.emails.push(email.trim()));
      }

      // Scan entire page body text for phone number patterns
      const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?0?\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}/g;
      const phoneMatches = bodyText.match(phoneRegex);
      if (phoneMatches) {
        phoneMatches.forEach((phone) => {
          const cleaned = phone.trim();
          // Keep strings that look like actual phone numbers (between 10 and 20 chars long)
          if (cleaned.length >= 10 && cleaned.length <= 20) {
            contactInfo.phones.push(cleaned);
          }
        });
      }

      // Deduplicate contact details
      contactInfo.emails = Array.from(new Set(contactInfo.emails));
      contactInfo.phones = Array.from(new Set(contactInfo.phones));

      // 2. Perform DOM noise cleanup
      document
        .querySelectorAll(
          "nav, footer, header, script, style, noscript, " +
          "[class*='cookie'], [class*='banner'], [id*='cookie'], " +
          "[class*='popup'], [class*='modal'], [class*='sidebar'], " +
          "[class*='related'], [class*='recommend'], [class*='similar']"
        )
        .forEach((el) => el.remove());

      // 3. Extract main description text
      const selectors = [
        "#jobDescriptionText",
        "[data-testid='jobsearch-jobDescriptionText']",
        ".description__text",
        ".show-more-less-html__markup",
        "[class*='job-description']",
        "[class*='jobDescription']",
        "[class*='JobDescription']",
        "[class*='vacancy-description']",
        "[class*='vacancyDescription']",
        "[class*='job-detail']",
        "[class*='jobDetail']",
        "[class*='job-content']",
        "[itemprop='description']",
        "article",
        "main",
        ".content",
        "#content",
      ];

      let description = "";
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent && el.textContent.trim().length > 150) {
          description = el.textContent.trim();
          break;
        }
      }

      if (!description) {
        description = document.body?.textContent?.trim() ?? "";
      }

      const pageTitle = document.title || "";
      const h1Text = document.querySelector("h1")?.textContent?.trim() || "";

      return { contactInfo, description, pageTitle, h1Text };
    });

    const { contactInfo, description, pageTitle, h1Text } = result;

    if (!description || description.length < 100) {
      throw new Error(
        "Page loaded but no job content found. The site may block scrapers — paste the text manually."
      );
    }

    let finalScrapedText = description;
    
    const metaBlock = [
      pageTitle ? `Webpage Title: ${pageTitle}` : "",
      h1Text ? `Page Heading (H1): ${h1Text}` : "",
    ].filter(Boolean).join("\n");

    if (metaBlock) {
      finalScrapedText = metaBlock + "\n\n" + finalScrapedText;
    }
    if (contactInfo.emails.length > 0 || contactInfo.phones.length > 0) {
      const contactBlock = [
        "\n\n--- EXTRACTED CONTACT INFORMATION ---",
        contactInfo.emails.length > 0 ? `Emails: ${contactInfo.emails.join(", ")}` : "",
        contactInfo.phones.length > 0 ? `Phone Numbers: ${contactInfo.phones.join(", ")}` : "",
        "-------------------------------------\n\n",
      ]
        .filter(Boolean)
        .join("\n");
      finalScrapedText = contactBlock + finalScrapedText;
    }

    return finalScrapedText.slice(0, 10000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Re-throw with a clear message
    throw new Error(msg);
  } finally {
    if (browser) await browser.close();
  }
}

export async function getJobTitleFromUrl(url: string): Promise<string> {
  // 1. Try quick HTTP fetch first (fastest, lightweight)
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3000), // 3 seconds timeout
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (match && match[1]) {
        const title = cleanTitle(match[1].trim());
        if (title && title.length > 3) return title;
      }
    }
  } catch (e) {
    console.warn("[getJobTitleFromUrl] fetch failed:", e);
  }

  // 2. Fall back to Playwright if fetch failed or returned nothing (more robust but slower)
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    // Abort media to make it fast
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
    const pageTitle = await page.title();
    const title = cleanTitle(pageTitle);
    if (title && title.length > 3) return title;
  } catch (e) {
    console.warn("[getJobTitleFromUrl] playwright failed:", e);
  } finally {
    if (browser) await browser.close();
  }

  // 3. Fall back to URL parsing slug as last resort
  return getSlugFallback(url);
}

function cleanTitle(title: string): string {
  let clean = title
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

  const suffixes = [
    /\s*\|\s*Indeed\.com/i,
    /\s*-\s*Indeed/i,
    /\s*\|\s*LinkedIn/i,
    /\s*-\s*LinkedIn/i,
    /\s*\|\s*Glassdoor/i,
    /\s*-\s*Glassdoor/i,
    /\s*\|\s*Jobbird/i,
    /\s*-\s*Jobbird/i,
    /\s*\|\s*Intermediair/i,
    /\s*-\s*Intermediair/i,
    /\s*\|\s*Talent\.com/i,
    /\s*-\s*Talent\.com/i,
    /\s*\|\s*Magnet\.me/i,
  ];

  for (const regex of suffixes) {
    clean = clean.replace(regex, "");
  }

  return clean.trim();
}

function getSlugFallback(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) return "Job Posting";

    let last = pathParts[pathParts.length - 1];

    if (/^\d+$/.test(last) && pathParts.length > 1) {
      last = pathParts[pathParts.length - 2];
    }

    let cleaned = last
      .replace(/[-_]+/g, " ")
      .replace(/\b\d+\b/g, "")
      .trim();

    cleaned = cleaned
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
      .trim();

    return cleaned || "Job Posting";
  } catch {
    return "Job Posting";
  }
}
