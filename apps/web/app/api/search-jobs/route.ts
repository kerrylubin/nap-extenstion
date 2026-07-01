import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { requireUser } from "@/lib/supabase/server";
import { getCVForLanguage, downloadCVBuffer } from "@/lib/storage";
import Anthropic from "@anthropic-ai/sdk";
import { calculateCost } from "@/lib/anthropic";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium: stealthChromium } = require("playwright-extra");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
stealthChromium.use(StealthPlugin());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });


export interface ScrapedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  snippet: string;
  link: string;
  source: string;
  matchScore?: number;
  language?: "nl" | "en";
}

function detectLanguage(title: string, snippet: string): "nl" | "en" {
  const text = `${title} ${snippet}`.toLowerCase();
  
  // Dutch stop words and common terms
  const dutchWords = [
    " en ", " de ", " het ", " een ", " van ", " ik ", " je ", " met ", " voor ", " op ", 
    " te ", " zijn ", " is ", " was ", " dat ", " die ", " in ", " op ", " om ", " ter ", 
    " aan ", " door ", " over ", " bij ", " tot ", " uit ", " naar ", " als ", 
    " solliciteer ", " sollicitatie ", " vacature ", " werkzaamheden ", " functie ", 
    " vereisten ", " profiel ", " bieden ", " zoeken ", " team ", " ervaring ", " gezocht ",
    " recruitment ", " solliciteren ", " wij ", " ons ", " onze ", " jouw ", " bent "
  ];
  
  // English stop words and common terms
  const englishWords = [
    " and ", " the ", " of ", " a ", " to ", " in ", " for ", " with ", " on ", " at ", 
    " by ", " from ", " this ", " that ", " you ", " we ", " our ", " your ", " job ", 
    " position ", " vacancy ", " apply ", " requirements ", " description ", " offer ",
    " looking ", " candidate ", " skills ", " role ", " team ", " joining ", " responsibilities "
  ];

  let dutchCount = 0;
  let englishCount = 0;

  for (const word of dutchWords) {
    if (text.includes(word)) {
      dutchCount += text.split(word).length - 1;
    }
  }

  for (const word of englishWords) {
    if (text.includes(word)) {
      englishCount += text.split(word).length - 1;
    }
  }

  // Add specific keyword boosts
  if (text.includes("solliciteren") || text.includes("vacature") || text.includes("gezocht")) dutchCount += 3;
  if (text.includes("hiring") || text.includes("vacancy") || text.includes("apply now")) englishCount += 3;

  return dutchCount >= englishCount ? "nl" : "en";
}

const PROFILE_QUERIES = [
  "junior software developer",
  "data analyst",
  "business IT",
  "junior developer Python",
  "IT consultant junior",
];

async function searchJSearch(query: string, location?: string, pageNum = 1): Promise<ScrapedJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return [];

  // Query both Indeed and LinkedIn in a single optimized API request to preserve quota
  const params = new URLSearchParams({
    query: location ? `${query}, ${location}` : `${query}, NL`,
    page: String(pageNum),
    num_pages: "1",
    country: "NL",
  });

  const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  });

  if (!res.ok) {
    console.error(`[jsearch] HTTP ${res.status}:`, await res.text().catch(() => ""));
    return [];
  }
  const data = await res.json();
  console.log(`[jsearch] status=${data.status} results=${data.data?.length ?? 0}`);

  return (data.data ?? []).slice(0, 15).map((job: {
    job_id: string;
    job_title: string;
    employer_name: string;
    job_city?: string;
    job_country?: string;
    job_description?: string;
    job_apply_link?: string;
    job_publisher?: string;
  }, i: number) => {
    let source = "LinkedIn";
    if (job.job_publisher) {
      if (/indeed/i.test(job.job_publisher)) {
        source = "Indeed";
      } else if (/linkedin/i.test(job.job_publisher)) {
        source = "LinkedIn";
      }
    }
    return {
      id: `${source === "Indeed" ? "indeed" : "jsearch"}-p${pageNum}-${i}`,
      title: job.job_title ?? "",
      company: job.employer_name ?? "",
      location: [job.job_city, job.job_country].filter(Boolean).join(", ") || "Netherlands",
      snippet: (job.job_description ?? "").slice(0, 200),
      link: job.job_apply_link ?? "",
      source: source,
      language: detectLanguage(job.job_title ?? "", job.job_description ?? ""),
    };
  }).filter((j: ScrapedJob) => j.title && j.link);
}

async function scrapeTalent(query: string, pageNum = 1, location?: string): Promise<ScrapedJob[]> {
  const browser = await chromium.launch({ headless: true });
  const jobs: ScrapedJob[] = [];
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      extraHTTPHeaders: { "Accept-Language": "nl-NL,nl;q=0.9" },
    });
    const encoded = encodeURIComponent(query);
    const loc = location ? encodeURIComponent(location) : "nederland";
    await page.goto(
      `https://nl.talent.com/jobs?k=${encoded}&l=${loc}&p=${pageNum}`,
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );
    await page.waitForTimeout(4000);

    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("article[class*='JobCard_card']"));
      
      return cards.map((card) => {
        const titleEl = card.querySelector("[class*='JobCard_title']");
        const companyEl = card.querySelector("[class*='JobCard_company']");
        const locationEl = card.querySelector("[class*='JobCard_location']");
        const snippetEl = card.querySelector("[class*='JobCard_body']");
        const linkEl = card.querySelector("a[href*='/view?id=']");
        
        const rawSnippet = snippetEl?.textContent?.trim() ?? "";
        const cleanSnippet = rawSnippet
          .replace(/Laat meer zien/gi, "")
          .replace(/Quick Apply/gi, "")
          .replace(/\s+/g, " ")
          .trim();

        const href = linkEl?.getAttribute("href") ?? "";
        const fullLink = href.startsWith("http") ? href : href ? `https://nl.talent.com${href}` : "";

        return {
          title: titleEl?.textContent?.trim() ?? "",
          company: companyEl?.textContent?.trim() ?? "",
          location: locationEl?.textContent?.trim() ?? "Netherlands",
          snippet: cleanSnippet,
          link: fullLink,
        };
      }).filter((j) => j.title && j.link);
    });

    results.forEach((j: { title: string; company: string; location: string; snippet: string; link: string }, i: number) =>
      jobs.push({ ...j, id: `talent-${query}-p${pageNum}-${i}`, source: "Talent.com", language: detectLanguage(j.title, j.snippet) })
    );
  } catch (err) {
    console.error("[talent] Scrape failed:", err);
  } finally {
    await browser.close();
  }
  return jobs;
}

async function scrapeMagnet(query: string, pageNum = 1, location?: string): Promise<ScrapedJob[]> {
  const browser = await chromium.launch({ headless: true });
  const jobs: ScrapedJob[] = [];
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      extraHTTPHeaders: { "Accept-Language": "nl-NL,nl;q=0.9" },
    });
    const searchQuery = location ? `${query} ${location}` : query;
    const encoded = encodeURIComponent(searchQuery);
    await page.goto(
      `https://magnet.me/nl-NL/vacatures?query=${encoded}&page=${pageNum}`,
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );
    await page.waitForTimeout(4000);

    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("[data-monitoring='discover-jobcard']")).filter((el) => {
        const hasLink = el.querySelector("a[href*='/vacature/']");
        return hasLink;
      });

      return cards.slice(0, 15).map((card) => {
        const linkEl = card.querySelector("a[href*='/vacature/']");
        const href = (linkEl as HTMLAnchorElement)?.href ?? "";
        const title = linkEl?.textContent?.trim() ?? "";

        const imgEl = card.querySelector("img[alt^='Logo '], img[alt*='Logo']");
        let company = "";
        if (imgEl) {
          company = imgEl.getAttribute("alt")?.replace(/^Logo\s+/, "")?.trim() ?? "";
        }
        if (!company) {
          const textEls = Array.from(card.querySelectorAll("div, span, p"))
            .map(el => el.textContent?.trim())
            .filter(Boolean);
          company = textEls[0] ?? "";
        }

        const lis = Array.from(card.querySelectorAll("li")).map(el => el.textContent?.trim() ?? "");
        let location = "Netherlands";
        const metaTexts: string[] = [];

        for (const text of lis) {
          if (!text) continue;
          if (/liken|solliciteren|openen/i.test(text)) continue;
          
          metaTexts.push(text);

          if (location === "Netherlands") {
            if (/deadline|binnen|dag|uuid|uur|verloopt/i.test(text)) continue;
            if (/ervaring|experience|jaar|year/i.test(text)) continue;
            if (/MBO|HBO|WO|bachelor|master|wo\b|hbo\b|mbo\b/i.test(text)) continue;
            if (/part-time|full-time|traineeship|stage|internship|vast|tijdelijk|werkstudent/i.test(text)) continue;
            if (/€|salary|salaris|maand|per/i.test(text)) continue;
            location = text;
          }
        }

        const snippetParts = [company];
        if (location && location !== "Netherlands") snippetParts.push(location);
        snippetParts.push(...metaTexts.filter(t => t !== company && t !== location));
        const snippet = snippetParts.join(" · ");

        return {
          title,
          company,
          location,
          snippet,
          link: href.startsWith("http") ? href : href ? `https://magnet.me${href}` : "",
        };
      }).filter((j) => j.title && j.link);
    });

    results.forEach((j: { title: string; company: string; location: string; snippet: string; link: string }, i: number) =>
      jobs.push({ ...j, id: `magnet-${query}-p${pageNum}-${i}`, source: "Magnet.me", language: detectLanguage(j.title, j.snippet) })
    );
  } catch (err) {
    console.error("[magnet] Scrape failed:", err);
  } finally {
    await browser.close();
  }
  return jobs;
}

function relaxQuery(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const stopWords = new Set([
    "developer", "software", "engineer", "junior", "senior",
    "lead", "medior", "programmer", "dev", "designer", "specialist", "analyst"
  ]);
  const filtered = words.filter(w => !stopWords.has(w));
  if (filtered.length > 0) {
    return filtered.join(" ");
  }
  return words[0] || query;
}

async function scrapeIntermediair(query: string, pageNum = 1, location?: string): Promise<ScrapedJob[]> {
  const browser = await chromium.launch({ headless: true });
  const jobs: ScrapedJob[] = [];
  try {
    const page = await browser.newPage();
    let encoded = encodeURIComponent(query);
    const loc = location ? `&location=${encodeURIComponent(location)}` : "";
    await page.goto(
      `https://www.intermediair.nl/vacature/zoeken?query=${encoded}${loc}&page=${pageNum}`,
      { timeout: 20000 }
    );
    await page.waitForTimeout(5000);

    let results = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[class*='iol_searchResult']"));
      
      return links.map((link) => {
        const href = link.getAttribute("href") ?? "";
        const fullLink = href.startsWith("http") ? href : `https://www.intermediair.nl${href}`;
        
        const container = link.closest("li") || link.parentElement;
        
        let company = "";
        let location = "";
        let title = "";
        
        if (container) {
          const companyEl = container.querySelector("strong[class*='companyName']");
          company = companyEl?.textContent?.trim() ?? "";
          
          const locationEl = container.querySelector("strong[class*='companyName'] + span");
          location = locationEl?.textContent?.trim() ?? "Netherlands";
          
          const titleEl = container.querySelector("h2");
          title = titleEl?.textContent?.trim() ?? "";
        }
        
        const attrs = Array.from(container?.querySelectorAll("div[class*='iol_attribute__']") || [])
          .map(el => el.textContent?.trim())
          .filter(Boolean);
          
        const timeEl = container?.querySelector("div.iol_belowBottom__ZHVZh > div");
        const postedTime = timeEl?.textContent?.trim() ?? "";

        const snippet = [company, location, ...attrs, postedTime].filter(Boolean).join(" · ");

        return {
          title,
          company,
          location,
          snippet,
          link: fullLink
        };
      }).filter((j) => j.title && j.link);
    });

    if (results.length === 0) {
      const relaxed = relaxQuery(query);
      if (relaxed !== query.toLowerCase()) {
        console.log(`[intermediair] 0 results for "${query}". Trying relaxed query: "${relaxed}"`);
        encoded = encodeURIComponent(relaxed);
        await page.goto(
          `https://www.intermediair.nl/vacature/zoeken?query=${encoded}${loc}&page=${pageNum}`,
          { timeout: 20000 }
        );
        await page.waitForTimeout(5000);

        results = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll("a[class*='iol_searchResult']"));
          
          return links.map((link) => {
            const href = link.getAttribute("href") ?? "";
            const fullLink = href.startsWith("http") ? href : `https://www.intermediair.nl${href}`;
            
            const container = link.closest("li") || link.parentElement;
            
            let company = "";
            let location = "";
            let title = "";
            
            if (container) {
              const companyEl = container.querySelector("strong[class*='companyName']");
              company = companyEl?.textContent?.trim() ?? "";
              
              const locationEl = container.querySelector("strong[class*='companyName'] + span");
              location = locationEl?.textContent?.trim() ?? "Netherlands";
              
              const titleEl = container.querySelector("h2");
              title = titleEl?.textContent?.trim() ?? "";
            }
            
            const attrs = Array.from(container?.querySelectorAll("div[class*='iol_attribute__']") || [])
              .map(el => el.textContent?.trim())
              .filter(Boolean);
              
            const timeEl = container?.querySelector("div.iol_belowBottom__ZHVZh > div");
            const postedTime = timeEl?.textContent?.trim() ?? "";

            const snippet = [company, location, ...attrs, postedTime].filter(Boolean).join(" · ");

            return {
              title,
              company,
              location,
              snippet,
              link: fullLink
            };
          }).filter((j) => j.title && j.link);
        });
      }
    }

    results.forEach((j: { title: string; company: string; location: string; snippet: string; link: string }, i: number) =>
      jobs.push({ ...j, id: `intermediair-${query}-p${pageNum}-${i}`, source: "Intermediair", language: detectLanguage(j.title, j.snippet) })
    );
  } catch (err) {
    console.error("[intermediair] Scrape failed:", err);
  } finally {
    await browser.close();
  }
  return jobs;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const customQuery = searchParams.get("q")?.trim();
  const location = searchParams.get("location")?.trim() || undefined;
  const pageNum = parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const langFilter = searchParams.get("lang")?.trim() || "All";

  let baseQuery = customQuery ?? PROFILE_QUERIES[0];
  if (langFilter === "en" && !/english|engels/i.test(baseQuery)) {
    baseQuery = `${baseQuery} English`;
  } else if (langFilter === "nl" && !/dutch|nederlands/i.test(baseQuery)) {
    baseQuery = `${baseQuery} Nederlands`;
  }

  const talentQuery = baseQuery;
  const jsearchQuery = baseQuery;
  const magnetQuery = baseQuery;
  const intermediairQuery = baseQuery;

  try {
    let cvText: string | undefined;
    try {
      const { supabase, user } = await requireUser();
      const cv = await getCVForLanguage(supabase, user.id, "nl") ??
                 await getCVForLanguage(supabase, user.id, "en");
      if (cv) {
        const buf = await downloadCVBuffer(supabase, cv.storagePath);
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buf });
        const result = await parser.getText();
        cvText = result.text.slice(0, 3000);
        await parser.destroy();
      }
    } catch (e) { console.error("[search-jobs] CV fetch failed:", e); }

    const [talentResults, jsearchResults, magnetResults, intermediairResults] = await Promise.allSettled([
      scrapeTalent(talentQuery, pageNum, location),
      searchJSearch(jsearchQuery, location, pageNum),
      scrapeMagnet(magnetQuery, pageNum, location),
      scrapeIntermediair(intermediairQuery, pageNum, location),
    ]);

    console.log(`[search-jobs] talent=${talentResults.status}(${talentResults.status === "fulfilled" ? talentResults.value.length : String(talentResults.reason).slice(0, 80)})`);
    console.log(`[search-jobs] jsearch=${jsearchResults.status}(${jsearchResults.status === "fulfilled" ? jsearchResults.value.length : String(jsearchResults.reason).slice(0, 80)})`);
    console.log(`[search-jobs] magnet=${magnetResults.status}(${magnetResults.status === "fulfilled" ? magnetResults.value.length : String(magnetResults.reason).slice(0, 80)})`);
    console.log(`[search-jobs] intermediair=${intermediairResults.status}(${intermediairResults.status === "fulfilled" ? intermediairResults.value.length : String(intermediairResults.reason).slice(0, 80)})`);

    const allJobs: ScrapedJob[] = [
      ...(talentResults.status === "fulfilled" ? talentResults.value : []),
      ...(jsearchResults.status === "fulfilled" ? jsearchResults.value : []),
      ...(magnetResults.status === "fulfilled" ? magnetResults.value : []),
      ...(intermediairResults.status === "fulfilled" ? intermediairResults.value : []),
    ];

    // Deduplicate
    const seen = new Set<string>();
    let deduped = allJobs.filter((j) => {
      const key = `${j.title}-${j.company}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Strict location filtering
    if (location) {
      const locLower = location.toLowerCase();
      if (locLower !== "nederland" && locLower !== "netherlands" && locLower !== "nl") {
        deduped = deduped.filter((j) => {
          const jobLoc = j.location.toLowerCase();
          if (jobLoc.includes(locLower)) return true;
          if (jobLoc.includes("remote") || jobLoc.includes("thuiswer") || jobLoc.includes("nederland") || jobLoc.includes("netherlands") || jobLoc.includes("nl") || jobLoc.includes("nationwide") || jobLoc.includes("landelijk")) return true;
          return false;
        });
      }
    }

    // Strict language filtering
    if (langFilter === "en") {
      deduped = deduped.filter((j) => j.language === "en");
    } else if (langFilter === "nl") {
      deduped = deduped.filter((j) => j.language === "nl");
    }

    // Score all jobs against CV in a single API call to avoid rate limits
    console.log(`[search-jobs] cvText=${cvText ? cvText.length + " chars" : "undefined"}, jobs=${deduped.length}`);
    let jobs: ScrapedJob[] = deduped;
    let searchUsage: { tokensUsed: number; costUsd: number } | undefined;

    if (cvText && deduped.length > 0) {
      try {
        const jobsText = deduped.map((j, i) =>
          `[${i}] ${j.title} at ${j.company}: ${(j.snippet ?? "").slice(0, 150)}`
        ).join("\n");
        const msg = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Score how well this candidate's CV matches each job (0-100).

CV:
${cvText.slice(0, 2000)}

Jobs:
${jobsText}

Return ONLY a JSON array of integer scores in the same order: [score0, score1, ...]
No explanation, no markdown.`,
          }],
        });
        const raw = (msg.content[0] as { type: string; text: string }).text.trim();
        const scores: number[] = JSON.parse(raw.replace(/```json|```/g, "").trim());
        jobs = deduped.map((job, i) => ({
          ...job,
          matchScore: typeof scores[i] === "number" ? Math.min(100, Math.max(0, scores[i])) : undefined,
        }));

        const usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
        searchUsage = {
          tokensUsed: usage.inputTokens + usage.outputTokens,
          costUsd: usage.costUsd,
        };
      } catch (e) {
        console.error("[search-jobs] Batch scoring failed:", e);
      }
    }

    // Drop obvious non-job pages (city/location pages scraped from Magnet.me navigation)
    jobs = jobs.filter((j) => !/^vacatures in \w/i.test(j.title.trim()));

    // Sort by score descending
    jobs.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    return NextResponse.json({ jobs, ...(searchUsage && { usage: searchUsage }) });
  } catch (err) {
    return NextResponse.json({ error: "Search failed: " + String(err) }, { status: 500 });
  }
}
