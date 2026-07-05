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

export async function extractJobInfo(jobDescription: string): Promise<{
  jobTitle: string;
  company: string;
  recruiterEmail?: string;
  recruiterPhone?: string;
  contactName?: string;
  language: "nl" | "en";
  usage?: TokenUsage;
}> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Extract the following from this job posting as JSON (no markdown, no extra keys):
- jobTitle: string
- company: string
- recruiterEmail: string or null — look carefully for any email address in the text (especially in the "EXTRACTED CONTACT INFORMATION" block if present)
- recruiterPhone: string or null — look carefully for any phone number in the text (especially in the "EXTRACTED CONTACT INFORMATION" block if present)
- contactName: string or null — the name of the recruiter or contact person if mentioned
- language: "nl" if the posting is in Dutch, "en" if English

Job posting (full text):
${jobDescription}`,
      },
    ],
  });

  const text = (msg.content[0] as { type: string; text: string }).text.trim();
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  const normalized = {
    jobTitle: parsed.jobTitle || parsed.job_title || parsed.jobtitle || parsed.title || "",
    company: parsed.company || parsed.company_name || parsed.companyName || "",
    recruiterEmail: parsed.recruiterEmail || parsed.recruiter_email || parsed.recruiteremail || parsed.email || undefined,
    recruiterPhone: parsed.recruiterPhone || parsed.recruiter_phone || parsed.recruiterphone || parsed.phone || parsed.telephone || undefined,
    contactName: parsed.contactName || parsed.contact_name || parsed.contactname || parsed.contact || undefined,
    language: parsed.language || "nl",
  };

  if (!normalized.recruiterEmail) {
    normalized.recruiterEmail = findEmailInText(jobDescription) ?? undefined;
  }

  if (!normalized.recruiterPhone) {
    normalized.recruiterPhone = findPhoneInText(jobDescription) ?? undefined;
  }

  const usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
  return { ...normalized, usage };
}

export async function scoreMatch(jobDescription: string, cvText?: string): Promise<{ score: number; usage?: TokenUsage }> {
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
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  const score = Math.min(100, Math.max(0, parsed.score));
  const usage = calculateCost("claude-haiku-4-5-20251001", msg.usage.input_tokens, msg.usage.output_tokens);
  return { score, usage };
}

export async function generateEmailBody(params: {
  jobTitle: string;
  company: string;
  contactName?: string;
  language: "nl" | "en";
  masterTemplate?: string;
  userProfile: UserProfile;
}): Promise<{ emailBody: string; usage?: TokenUsage }> {
  const { jobTitle, company, contactName, language, masterTemplate, userProfile } = params;
  const { name, email, phone } = userProfile;
  const contact = phone ? `${email}\n${phone}` : email;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Write a short job application email body in ${language === "nl" ? "Dutch" : "English"}.

Candidate: ${name}
Applying for: ${jobTitle} at ${company}
${contactName ? `Contact: ${contactName}` : ""}
${masterTemplate ? `\nUse this as your style and tone reference (adapt content for this specific job, do NOT copy verbatim):\n---\n${masterTemplate}\n---\n` : ""}
Output EXACTLY this structure — no dashes, no extra paragraphs, no subject line:

${language === "nl" ? `Beste ${contactName ?? "recruiter"},

In de bijlage vindt u mijn CV en motivatiebrief voor de [jobTitle] bij [company]. Ik ben enthousiast over de mogelijkheid om mee te werken aan [one specific thing from the role], en ik geloof dat mijn achtergrond en projecten goed aansluiten.

Mocht u verdere informatie nodig hebben, hoor ik het graag.

Alvast bedankt voor uw tijd. Ik kijk uit naar uw reactie.

Met vriendelijke groet,
${name}

${contact}` : `Dear ${contactName ?? "Hiring Manager"},

Please find attached my CV and motivation letter for the [jobTitle] position at [company]. I am excited about the opportunity to contribute to [one specific thing from the role], and I believe my background aligns well with what you are looking for.

Should you require any further information, please do not hesitate to contact me.

Thank you for your time. I look forward to hearing from you.

Kind regards,
${name}

${contact}`}

Rules:
- Replace [jobTitle], [company], and [one specific thing] with real values — no brackets in output
- Do NOT use em dashes, hyphens as dashes, or any special punctuation
- Keep it exactly this length, no extra sentences`,
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
  const { name, email, phone, address, hobbies } = userProfile;
  const addressLine = address ?? "Netherlands";
  const contact = phone ? `${email}\n${phone}` : email;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `Write a professional 1-page motivation letter in ${language === "nl" ? "Dutch" : "English"}.

Candidate profile:
${cvText ?? `Name: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ""}${address ? `\nAddress: ${address}` : ""}`}
${hobbies ? `Hobbies & Interests: ${hobbies}\n` : ""}

Applying for: ${jobTitle} at ${company}
${contactName ? `Contact: ${contactName}` : ""}

Job description summary:
${jobDescription.slice(0, 1500)}

${masterTemplate ? `\nIMPORTANT: The candidate has provided a Master Template. You MUST use this as your primary style, tone, and structure reference:\n---\n${masterTemplate}\n---\n\nRequirements:\n- Adapt the content to match the specific job description and company.\n- Maintain the EXACT tone, flow, and structural layout of the Master Template.\n- Do NOT invent experiences or skills that are not in the candidate's profile or CV.\n- No markdown (no **, no ---, no # headers) — plain text only.\n` : `Requirements:
- Professional but warm tone — sounds like a real person, not a cover-letter template
- Reference relevant experience from the candidate's CV — be specific, not generic
- DO NOT invent or hallucinate any experience, skills, or projects not mentioned in the CV/Profile.
- Mention concrete skills that match the job based ONLY on the provided candidate profile.
- Exactly 4 short paragraphs + 1 standalone closing sentence (structure below)
- Each paragraph: 2-3 sentences, 40-70 words MAX. Total body text: 220-250 words.
- NO em-dashes, NO hyphens used as dashes, NO semicolons — use plain sentences
- No placeholders, no [brackets]
- No markdown (no **, no ---, no # headers) — plain text only
${hobbies ? `- YOU MUST write exactly 1 warm, personal sentence in P4 that first explicitly mentions what the candidate's hobbies are ("${hobbies}"), and then connects what they take from those hobbies to the workplace (e.g., analytical thinking, teamwork, discipline). Ensure it flows naturally as a single sentence.` : ""}

Paragraph structure:
  P1 (opening, ~55 words): Hook on something specific about the company or role, then connect it to the candidate's personal drive
  P2 (experience, ~70 words): Concrete things from the candidate's experience that directly match what the job asks for. Do not invent experience.
  P3 (fit, ~50 words): What specifically appeals about this company + one clear tie to the candidate's passion
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
${contact}`,
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
