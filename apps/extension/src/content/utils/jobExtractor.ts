export interface JobDetails {
  title: string;
  company: string;
  url: string;
  description: string;
}

export const extractJobDetails = (): JobDetails => {
  // 1. URL
  const url = window.location.href;

  // 2. Title
  // Try to find open graph title or standard title
  let title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') 
           || document.title;
  
  // Refine title if it has company name appended (e.g., "Software Engineer at Google")
  if (title.includes(' at ')) {
    title = title.split(' at ')[0].trim();
  } else if (title.includes(' | ')) {
    title = title.split(' | ')[0].trim();
  }

  // 3. Company
  // Heuristics: search for common classes or meta tags
  let company = '';
  const companyElement = 
    document.querySelector('.topcard__flavor') || // LinkedIn
    document.querySelector('.jobsearch-CompanyAvatar-companyLink') || // Indeed
    document.querySelector('[data-ui="company-name"]'); // Generic

  if (companyElement && companyElement.textContent) {
    company = companyElement.textContent.trim();
  } else {
    // Fallback: extract from title if possible
    const fullTitle = document.title;
    if (fullTitle.includes(' at ')) {
      company = fullTitle.split(' at ')[1].split(' ')[0].trim();
    } else if (fullTitle.includes(' | ')) {
      company = fullTitle.split(' | ')[1].trim();
    } else {
      company = "Unknown Company";
    }
  }

  // 4. Description
  let description = '';
  const descElement = 
    document.querySelector('.description__text') || // LinkedIn
    document.querySelector('#jobDescriptionText') || // Indeed
    document.querySelector('.job-description') || // Generic
    document.querySelector('article');

  if (descElement && descElement.textContent) {
    // Get text, trim it, and possibly truncate if too long
    description = descElement.textContent.trim().substring(0, 5000); 
  } else {
    description = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || "No description found";
  }

  return { title, company, url, description };
};
