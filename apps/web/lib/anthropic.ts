import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): TokenUsage {
  let inputRate = 0; // per token
  let outputRate = 0; // per token

  if (model.includes("sonnet")) {
    inputRate = 3.0 / 1_000_000;
    outputRate = 15.0 / 1_000_000;
  } else if (model.includes("haiku")) {
    inputRate = 1.0 / 1_000_000;
    outputRate = 5.0 / 1_000_000;
  } else {
    inputRate = 1.0 / 1_000_000;
    outputRate = 5.0 / 1_000_000;
  }

  const costUsd = (inputTokens * inputRate) + (outputTokens * outputRate);
  return {
    inputTokens,
    outputTokens,
    costUsd,
  };
}

export interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  hobbies?: string;
  personalNotes?: string;
  referenceName?: string;
  referencePhone?: string;
  referenceLinkedin?: string;
}

function findEmailInText(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function findPhoneInText(text: string): string | null {
  // Try to grab phone numbers from the contact details block first
  const blockMatch = text.match(/(?:Phone Numbers:|Phones:)\s*([^\n]+)/i);
  if (blockMatch && blockMatch[1]) {
    const firstPhone = blockMatch[1].split(",")[0].trim();
    if (firstPhone) return firstPhone;
  }

  // Fallback to finding general phone numbers (e.g. +31 20 494 7777 or 06-12345678)
  const generalMatch = text.match(/(?:\+?\d{1,4}[-.\s]?)?\(?0?\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}/);
  if (generalMatch) {
    const cleaned = generalMatch[0].trim();
    if (cleaned.length >= 10 && cleaned.length <= 20) return cleaned;
  }

  return null;
}

export function extractTextAfterAboutTheJob(text: string): string {
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

export function detectLanguage(text: string, title?: string): "nl" | "en" {
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
  
  // Uniquely Dutch words and structural Dutch terms
  const dutchWords = [
    'de', 'het', 'een', 'van', 'en', 'in', 'op', 'te', 'met', 'voor', 'zijn', 'dat', 'die',
    'je', 'jouw', 'bent', 'hebt', 'werkt', 'ons', 'onze', 'vacature', 'solliciteer', 'solliciteren',
    'bieden', 'gezocht', 'wij', 'bij', 'over', 'naar', 'uit', 'door', 'functie', 'arbeidsvoorwaarden',
    'ervaring', 'werk', 'zoekt', 'zoeken', 'graag', 'samen', 'om', 'als', 'ook', 'niet', 'wel'
  ];
  
  const englishWords = [
    'the', 'of', 'and', 'to', 'in', 'for', 'with', 'on', 'at', 'by', 'from', 'this', 'that',
    'you', 'your', 'we', 'our', 'job', 'position', 'vacancy', 'apply', 'requirements', 'description',
    'looking', 'candidate', 'skills', 'role', 'joining', 'responsibilities', 'will', 'have', 'are'
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
  
  // Strong Dutch markers that almost NEVER exist in English text
  const strongDutchMarkers = [
    'het', 'een', 'jouw', 'bent', 'hebt', 'werkt', 'ons', 'onze', 'vacature', 'solliciteren',
    'solliciteer', 'bieden', 'gezocht', 'arbeidsvoorwaarden', 'werkzaamheden', 'wij'
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

export async function detectLanguageWithAI(text: string, title?: string): Promise<"nl" | "en"> {
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

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: `You are a language detector for job postings.
Below is the text of a job posting taken specifically AFTER the section header "About the job" / "Over de functie".
Analyze the main job description paragraphs (responsibilities, requirements, tasks, role details).

What language is this main job description written in?
Return ONLY JSON: {"language": "nl"} if Dutch, or {"language": "en"} if English.

Job description text after "About the job":
${bodyText.slice(0, 3000)}`,
        },
      ],
    });

    const textRes = (msg.content[0] as { type: string; text: string }).text.trim();
    const parsed = safeParseJson<{ language: "nl" | "en" }>(textRes);
    if (parsed && (parsed.language === "nl" || parsed.language === "en")) {
      return parsed.language;
    }
  } catch (e) {
    console.error("[detectLanguageWithAI] AI detection failed, falling back to rule-based:", e);
  }

  return detectLanguage(bodyText, title);
}

export function safeParseJson<T = any>(rawText: string): T {
  if (!rawText || !rawText.trim()) {
    throw new SyntaxError("Empty response text passed to safeParseJson");
  }

  let text = rawText.trim();

  // Strip markdown code block wrappers if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim();
  }

  // 1. Attempt direct JSON.parse
  try {
    return JSON.parse(text);
  } catch {
    // Proceed to extraction if direct parse fails due to prose or extra text
  }

  // 2. Locate first and last JSON boundaries ({...} or [...])
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");

  let candidate = "";
  const isObject = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);
  const isArray = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);

  if (isObject && lastBrace > firstBrace) {
    candidate = text.slice(firstBrace, lastBrace + 1);
  } else if (isArray && lastBracket > firstBracket) {
    candidate = text.slice(firstBracket, lastBracket + 1);
  }

  if (candidate) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 3. Clean up common JSON syntax issues (e.g. trailing commas before } or ])
      const cleaned = candidate
        .replace(/,\s*([\}\]])/g, "$1")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
      return JSON.parse(cleaned);
    }
  }

  // Fallback: strip trailing commas on full text
  const cleanedRaw = text.replace(/,\s*([\}\]])/g, "$1");
  return JSON.parse(cleanedRaw);
}

export async function extractJobInfo(jobDescription: string): Promise<{
  jobTitle: string;
  company: string;
  recruiterEmail?: string;
  recruiterPhone?: string;
  contactName?: string;
  language: "nl" | "en";
  usage?: TokenUsage;
}> {
  let parsed: any = {};
  let usage: TokenUsage | undefined;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Extract the following from this job posting as a clean JSON object (no markdown, no extra text outside JSON):
- jobTitle: string
- company: string
- recruiterEmail: string or null — look carefully for any email address in the text
- recruiterPhone: string or null — look carefully for any phone number in the text
- contactName: string or null — the name of the recruiter or contact person if mentioned
- language: Detect the language of the BODY of the job description — meaning the sections that describe responsibilities, requirements, tasks, what you will be doing, and what the company offers. IGNORE the job title (Dutch companies often use English job titles like "Data Engineer" for Dutch-language vacancies), ignore website navigation, cookie banners, "Apply" buttons, and any other surrounding boilerplate. If the actual description paragraphs are in Dutch, return "nl". If in English, return "en".

Job posting (full text):
${jobDescription.slice(0, 8000)}`,
        },
      ],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    parsed = safeParseJson(text);
    usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
  } catch (err) {
    console.error("[extractJobInfo] Failed to extract or parse JSON from AI response:", err);
  }

  const normalized = {
    jobTitle: parsed.jobTitle || parsed.job_title || parsed.jobtitle || parsed.title || "",
    company: parsed.company || parsed.company_name || parsed.companyName || "",
    recruiterEmail: parsed.recruiterEmail || parsed.recruiter_email || parsed.recruiteremail || parsed.email || undefined,
    recruiterPhone: parsed.recruiterPhone || parsed.recruiter_phone || parsed.recruiterphone || parsed.phone || parsed.telephone || undefined,
    contactName: parsed.contactName || parsed.contact_name || parsed.contactname || parsed.contact || undefined,
    language: (parsed.language === "nl" || parsed.language === "en") ? parsed.language : detectLanguage(jobDescription),
  };

  if (!normalized.recruiterEmail) {
    normalized.recruiterEmail = findEmailInText(jobDescription) ?? undefined;
  }

  if (!normalized.recruiterPhone) {
    normalized.recruiterPhone = findPhoneInText(jobDescription) ?? undefined;
  }

  return { ...normalized, usage };
}

export async function scoreMatch(jobDescription: string, cvText?: string): Promise<{ score: number; usage?: TokenUsage }> {
  let score = 75;
  let usage: TokenUsage | undefined;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Given this candidate profile:
${cvText ?? "No CV provided."}

And this job description:
${jobDescription.slice(0, 2000)}

Return ONLY a JSON object: {"score": <0-100>}
Score based on skills match, experience level fit, and location. No explanation.`,
        },
      ],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const parsed = safeParseJson(text);
    if (typeof parsed.score === "number") {
      score = Math.min(100, Math.max(0, parsed.score));
    }
    usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
  } catch (err) {
    console.warn("[scoreMatch] JSON parse failed, returning fallback score 75:", err);
  }

  return { score, usage };
}

export async function generateEmailBody(params: {
  jobTitle: string;
  company: string;
  contactName?: string;
  language: "nl" | "en";
  jobDescription: string;
  masterTemplate?: string;
  userProfile: UserProfile;
}): Promise<{ emailBody: string; usage?: TokenUsage }> {
  const { jobTitle, company, contactName, language, jobDescription, masterTemplate, userProfile } = params;
  const { name, email, phone } = userProfile;
  const contact = phone ? `${email}\n${phone}` : email;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    temperature: 0.85,
    messages: [
      {
        role: "user",
        content: `Write a short, professional job application email body in ${language === "nl" ? "Dutch" : "English"}.

Candidate: ${name}
Applying for: ${jobTitle} at ${company}
${contactName ? `Contact person: ${contactName}` : ""}
${masterTemplate ? `\nTone reference (use as inspiration for tone only, do NOT copy structure or sentences):\n${masterTemplate}\n` : ""}

Full job description:
${jobDescription.slice(0, 8000)}

Instructions:
- Read the job description carefully. Pick 1-2 SPECIFIC details from it (e.g. a technology, a responsibility, a team, a product, or a company value) and weave them naturally into the email to show genuine interest.
- State that the candidate's CV and motivation letter are attached.
- Keep it concise: greeting + 2 short paragraphs + polite closing + sign-off.
- Every email you write must feel UNIQUE to this specific job. Do NOT use generic phrases like "I believe my background aligns well" or "I am excited about the opportunity to contribute". Instead, mention something concrete from the job description.
- Professional but warm and human tone.
- NO subject line in the output.
- NO placeholders, no brackets ([...]) in the output.
- End with:

${language === "nl" ? "Met vriendelijke groet" : "Kind regards"},
${name}
${contact}`,
      },
    ],
  });

  const emailBody = (msg.content[0] as { type: string; text: string }).text.trim();
  const usage = calculateCost("claude-sonnet-4-6", msg.usage.input_tokens, msg.usage.output_tokens);
  return { emailBody, usage };
}

export async function generateMotivationLetter(params: {
  jobTitle: string;
  company: string;
  contactName?: string;
  jobDescription: string;
  language: "nl" | "en";
  cvText?: string;
  masterTemplate?: string;
  userProfile: UserProfile;
}): Promise<{ letterText: string; usage?: TokenUsage }> {
  const { jobTitle, company, contactName, jobDescription, language, cvText, masterTemplate, userProfile } = params;
  const { name, email, phone, address, hobbies, personalNotes, referenceName, referencePhone, referenceLinkedin } = userProfile;
  const addressLine = address ?? "Netherlands";
  const contact = phone ? `${email}\n${phone}` : email;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    temperature: 0.8,
    messages: [
      {
        role: "user",
        content: `Write a professional 1-page motivation letter in ${language === "nl" ? "Dutch" : "English"}.

Candidate profile:
${cvText ?? `Name: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ""}${address ? `\nAddress: ${address}` : ""}`}
${hobbies ? `Hobbies & Interests: ${hobbies}\n` : ""}
${personalNotes ? `Extra personal notes / drive about candidate (integrate these naturally to make the letter feel personal and warm): ${personalNotes}\n` : ""}
${referenceName ? `Reference: ${referenceName}${referencePhone ? ` | tel: ${referencePhone}` : ""}${referenceLinkedin ? ` | LinkedIn: ${referenceLinkedin}` : ""}\n` : ""}

Applying for: ${jobTitle} at ${company}
${contactName ? `Contact: ${contactName}` : ""}

Job description summary:
${jobDescription.slice(0, 3000)}

${masterTemplate ? `\nIMPORTANT: The candidate has provided a Master Template. You MUST use this as your primary style, tone, and structure reference:\n---\n${masterTemplate}\n---\n\nRequirements:\n- You MUST write the final letter in ${language === "nl" ? "Dutch" : "English"} ONLY. Under no circumstances should the letter be in any other language. If the Master Template is in a different language, you MUST translate its style, structural layout, and tone into ${language === "nl" ? "Dutch" : "English"} for the output. No words, labels, or formatting should remain in the template's original language.\n- Adapt the content to match the specific job description and company.\n- Maintain the EXACT structural layout, paragraph count, and general flow of the Master Template, but translate all text and sentences into ${language === "nl" ? "Dutch" : "English"}.\n- You MUST integrate the candidate's extra personal details (e.g. language transitions, educational drive, or process philosophy) naturally into the paragraphs of the template.\n- Do NOT invent experiences or skills that are not in the candidate's profile or CV.\n- No markdown (no **, no ---, no # headers) — plain text only.\n` : `Requirements:
- Professional but warm tone — sounds like a real person, not a cover-letter template
- You MUST weave in the provided "Extra personal notes / drive about candidate" (such as language transitions, career drive, or specific achievements) across the letter's body paragraphs to make the narrative uniquely human.
- Reference relevant experience from the candidate's CV — be specific, not generic
- DO NOT invent or hallucinate any experience, skills, or projects not mentioned in the CV/Profile.
- Mention concrete skills that match the job based ONLY on the provided candidate profile.
- Exactly 4 short paragraphs + 1 standalone closing sentence (structure below)
- Each paragraph: 2-3 sentences, 40-70 words MAX. Total body text: 220-250 words.
- NO em-dashes, NO hyphens used as dashes, NO semicolons — use plain sentences
- No placeholders, no [brackets]
- No markdown (no **, no ---, no # headers) — plain text only
${hobbies ? `- YOU MUST write exactly 1 warm, personal sentence in P4 that first explicitly mentions what the candidate's hobbies are ("${hobbies}"), and then connects what they take from those hobbies to the workplace (e.g., analytical thinking, teamwork, discipline). Ensure it flows naturally as a single sentence.` : ""}
${referenceName ? `- You may optionally mention the reference ("${referenceName}") in the closing paragraph if it fits naturally.` : ""}

Paragraph structure:
  P1 (opening, ~55 words): Hook on something specific about the company or role, then connect it to the candidate's personal drive (incorporating personal notes if applicable)
  P2 (experience, ~70 words): Concrete things from the candidate's experience that directly match what the job asks for. Do not invent experience.
  P3 (fit, ~50 words): What specifically appeals about this company + one clear tie to the candidate's passion (weaving in personal details if relevant)
  P4 (closing, ~50 words): 2 sentences — first sentence MUST start by mentioning the candidate's hobbies and then connect them to professional character; second sentence expresses enthusiasm for this specific company
  Closing line (~13 words, standalone): ${language === "nl" ? '"Graag kom ik langs om mijn motivatie en ervaring verder toe te lichten."' : '"I would welcome the opportunity to discuss my motivation and experience in person."'}
`}

Output the letter in EXACTLY this structure (use real double line breaks between blocks):

${name}
${addressLine}
${new Date().toLocaleDateString(language === "nl" ? "nl-NL" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}

${contactName ?? "Recruitment Team"}
${company}
[City], NL

${language === "nl" ? `Betreft: Sollicitatie ${jobTitle}` : `Re: Application for ${jobTitle}`}

[Greeting],

[Body Paragraphs based on requirements above]

${masterTemplate ? "" : `[Closing line]\n`}
${language === "nl" ? "Met vriendelijke groet," : "Kind regards,"}

${name}
${contact}${referenceName ? `\n\n${language === "nl" ? "Referentie" : "Reference"}:\n${referenceName}${referencePhone ? ` | tel: ${referencePhone}` : ""}${referenceLinkedin ? ` | ${referenceLinkedin}` : ""}` : ""}`,
      },
    ],
  });

  const letterText = (msg.content[0] as { type: string; text: string }).text.trim();
  const usage = calculateCost("claude-sonnet-4-6", msg.usage.input_tokens, msg.usage.output_tokens);
  return { letterText, usage };
}

export async function generateFollowUpEmail(params: {
  jobTitle: string;
  company: string;
  contactName?: string;
  language: "nl" | "en";
  emailSentDate?: string;
  userProfile: UserProfile;
}): Promise<{ emailBody: string; usage?: TokenUsage }> {
  const { jobTitle, company, contactName, language, emailSentDate, userProfile } = params;
  const { name, email, phone } = userProfile;
  const contact = phone ? `${email}\n${phone}` : email;
  const sentDateStr = emailSentDate
    ? new Date(emailSentDate).toLocaleDateString(language === "nl" ? "nl-NL" : "en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : undefined;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    temperature: 0.8,
    messages: [
      {
        role: "user",
        content: `Write a short, warm, and highly personalized follow-up email in ${language === "nl" ? "Dutch" : "English"} from a job applicant who has not heard back yet.

Candidate: ${name}
Applied for: ${jobTitle} at ${company}
${contactName ? `Contact: ${contactName}` : ""}
${sentDateStr ? `Application sent on: ${sentDateStr}` : ""}
Candidate Contact Info:
${contact}

Requirements:
- Make it sound human, polite, and conversational. Do not sound like a robot or a stiff template.
- Vary the phrasing and structure so it doesn't look like a boilerplate follow-up. Be natural and genuine.
- Keep it brief (3 to 4 short sentences): a warm greeting to the contact (or Hiring Team), a quick mention of the application and continued enthusiasm for the role, and a polite inquiry about the timeline or next steps.
- Professional but warm tone.
- NO subject line — output the body only.
- NO placeholders or brackets in the output.
- Sign off gracefully with the candidate's name and the exact contact info provided above.`,
      },
    ],
  });

  const emailBody = (msg.content[0] as { type: string; text: string }).text.trim();
  const usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
  return { emailBody, usage };
}
