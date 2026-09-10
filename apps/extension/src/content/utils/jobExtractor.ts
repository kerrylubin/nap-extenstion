export interface JobDetails {
  title: string;
  company: string;
  url: string;
  description: string;
  language: "nl" | "en";
}

function extractTextAfterAboutTheJob(text: string): string {
  if (!text || !text.trim()) return text;

  const sectionHeaders = [
    /about the job/i,
    /about the role/i,
    /about the position/i,
    /over de functie/i,
    /over de rol/i,
    /functieomschrijving/i,
    /vacatureomschrijving/i,
    /job description/i,
    /about the company & role/i,
  ];

  for (const headerRegex of sectionHeaders) {
    const match = text.match(headerRegex);
    if (match && match.index !== undefined) {
      const afterHeader = text.slice(match.index + match[0].length).trim();
      if (afterHeader.length > 20) {
        return afterHeader;
      }
    }
  }

  return text;
}

function detectLanguage(text: string, title?: string): "nl" | "en" {
  if (!text || !text.trim()) return "nl";

  const contentAfterAbout = extractTextAfterAboutTheJob(text);
  let bodyText = contentAfterAbout;
  if (title && title.trim()) {
    const cleanTitle = title.trim().toLowerCase();
    const idx = bodyText.toLowerCase().indexOf(cleanTitle);
    if (idx !== -1) {
      bodyText = bodyText.slice(idx + cleanTitle.length);
    }
  }
  if (!bodyText.trim()) bodyText = text;

  const cleanText = bodyText.toLowerCase();

  const dutchWords = [
    'de', 'het', 'een', 'van', 'en', 'in', 'op', 'te', 'met', 'voor', 'zijn', 'dat', 'die',
    'je', 'jouw', 'bent', 'hebt', 'werkt', 'ons', 'onze', 'vacature', 'solliciteer', 'solliciteren',
    'bieden', 'gezocht', 'wij', 'bij', 'over', 'naar', 'uit', 'door', 'functie', 'arbeidsvoorwaarden',
    'ervaring', 'werk', 'zoekt', 'zoeken', 'graag', 'samen', 'om', 'als', 'ook', 'niet', 'wel'
  ];

  const englishWords = [
    'the', 'of', 'and', 'to', 'in', 'for', 'with', 'on', 'are', 'you', 'your', 'we', 'our',
    'job', 'position', 'vacancy', 'apply', 'requirements', 'description', 'looking', 'candidate',
    'skills', 'role', 'joining', 'responsibilities', 'will', 'have', 'from', 'this', 'that'
  ];

  let englishCount = 0;
  let dutchCount = 0;

  englishWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = cleanText.match(regex);
    if (matches) englishCount += matches.length;
  });

  dutchWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = cleanText.match(regex);
    if (matches) dutchCount += matches.length;
  });

  const strongDutchMarkers = [
    'het', 'een', 'jouw', 'bent', 'hebt', 'werkt', 'ons', 'onze', 'vacature', 'solliciteren',
    'solliciteer', 'bieden', 'gezocht', 'arbeidsvoorwaarden', 'werkzaamheden', 'wij', 'jij', 'sta'
  ];
  let strongDutchCount = 0;
  strongDutchMarkers.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = cleanText.match(regex);
    if (matches) strongDutchCount += matches.length;
  });

  if (strongDutchCount >= 1) {
    return "nl";
  }

  if (dutchCount > 0 && dutchCount * 1.3 >= englishCount) {
    return "nl";
  }

  return englishCount > dutchCount ? "en" : "nl";
}

function getCleanBodyText(): string {
  try {
    // Clone body to avoid side effects on the active DOM
    const clone = document.body.cloneNode(true) as HTMLElement;
    
    // Remove non-content elements
    const toRemove = clone.querySelectorAll('script, style, nav, header, footer, noscript, iframe, svg, button');
    toRemove.forEach(el => el.remove());
    
    // Get text and replace multiple spaces/newlines with a single space
    return clone.textContent?.replace(/\s+/g, ' ').trim() || '';
  } catch (e) {
    console.error("Error extracting clean body text:", e);
    return "";
  }
}

export const extractJobDetails = (): JobDetails => {
  const url = window.location.href;

  // 1. Title Extraction
  const titleSelectors = [
    'meta[property="og:title"]',
    'h1', // Most job portals put the job title in h1
    '#job-title',
    '.job-title',
    '[class*="jobTitle"]',
    '[class*="job-title"]',
  ];

  let title = '';
  for (const selector of titleSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.tagName === 'META' ? el.getAttribute('content') : el.textContent?.trim();
      if (text && text.length > 3) {
        title = text;
        break;
      }
    }
  }
  if (!title) title = document.title;

  // Refine title if it has company name appended (e.g., "Software Engineer at Google")
  if (title.includes(' at ')) {
    title = title.split(' at ')[0].trim();
  } else if (title.includes(' | ')) {
    title = title.split(' | ')[0].trim();
  } else if (title.includes(' - ')) {
    title = title.split(' - ')[0].trim();
  }

  // 2. Company Extraction
  const companySelectors = [
    '.topcard__flavor', // LinkedIn
    '.jobsearch-CompanyAvatar-companyLink', // Indeed
    '[data-ui="company-name"]', // Generic
    '.company-name',
    '[class*="companyName"]',
    '[class*="company-name"]',
    '.company',
  ];

  let company = '';
  for (const selector of companySelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim();
      if (text && text.length > 1) {
        company = text;
        break;
      }
    }
  }

  if (!company) {
    // Fallback: extract from document title
    const docTitle = document.title;
    if (docTitle.includes(' at ')) {
      company = docTitle.split(' at ')[1].split(' ')[0].trim();
    } else if (docTitle.includes(' | ')) {
      company = docTitle.split(' | ')[1].trim();
    } else if (docTitle.includes(' - ')) {
      company = docTitle.split(' - ')[1].trim();
    } else {
      company = "Unknown Company";
    }
  }

  // 3. Description Extraction
  const descSelectors = [
    '.description__text', // LinkedIn
    '#jobDescriptionText', // Indeed
    '.job-description', // Generic
    '#job-description', // BambooHR / Generic
    '.job-post', // Greenhouse
    '#content', // Greenhouse fallback
    '.section-wrapper', // Lever
    '[data-automation-id="jobPostingDescription"]', // Workday
    '[class*="job-description"]', // Workday generic
    '[class*="JobDescription"]', // Workday camelCase
    '.job-sections', // SmartRecruiters
    '.job-detail', // Breezy
    '.description', // Generic description
    'article', // Semantic article
  ];

  let description = '';
  for (const selector of descSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim() || '';
      if (text.length > 200) {
        description = text.substring(0, 5000);
        break;
      }
    }
  }

  // Final fallback: extract clean body text
  if (!description || description === "No description found") {
    const cleanBody = getCleanBodyText();
    if (cleanBody && cleanBody.length > 200) {
      description = cleanBody.substring(0, 5000);
    } else {
      description = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || "No description found";
    }
  }

  const language = detectLanguage(description, title);
  return { title, company, url, description, language };
};
