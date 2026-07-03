"use client";
import { useState, useEffect } from "react";
import { ProcessJobResult, JobApplication } from "@/types";
import { ScrapedJob } from "@/app/api/search-jobs/route";

interface Props {
  onResult?: (result: ProcessJobResult) => void;
  applications?: JobApplication[];
  onLike?: (job: ScrapedJob) => void;
  onUnlike?: (appId: string) => void;
}

const NL_LOCATIONS = [
  "Heel Nederland",
  "Amsterdam",
  "Rotterdam",
  "Den Haag",
  "Utrecht",
  "Eindhoven",
  "Tilburg",
  "Groningen",
  "Almere",
  "Breda",
  "Nijmegen",
  "Arnhem",
  "Haarlem",
  "Enschede",
  "Apeldoorn",
  "Leiden",
  "Maastricht",
  "Amersfoort",
  "Dordrecht",
  "Zaandam",
];

const SOURCE_COLORS: Record<string, string> = {
  "Indeed":       "bg-blue-50 text-blue-600",
  "Jobbird":      "bg-purple-50 text-purple-600",
  "LinkedIn":     "bg-sky-50 text-sky-600",
  "Magnet.me":    "bg-orange-50 text-orange-600",
  "Talent.com":   "bg-teal-50 text-teal-600",
  "Intermediair": "bg-indigo-50 text-indigo-600",
};

function MatchBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-100 text-green-700" :
                score >= 40 ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-600";
  return <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${color}`}>{score}%</span>;
}

function Spinner({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export function JobSearchPanel({ applications = [], onLike, onUnlike }: Props) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Heel Nederland");
  const [jobs, setJobs] = useState<ScrapedJob[]>([]);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [hasCv, setHasCv] = useState(true);
  const [activeSource, setActiveSource] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<"All" | "en" | "nl">("All");
  const [searchUsage, setSearchUsage] = useState<{ tokensUsed: number; costUsd: number } | null>(null);
  const [suggestionUsage, setSuggestionUsage] = useState<{ tokensUsed: number; costUsd: number } | null>(null);

  const FALLBACK_SUGGESTIONS = ["Junior developer", "Data analyst", "Business IT", "Full stack", "Python", "Power BI"];

  useEffect(() => {
    fetch("/api/search-suggestions")
      .then((r) => r.json())
      .then((d) => {
        setSuggestions(d.suggestions?.length ? d.suggestions : FALLBACK_SUGGESTIONS);
        setHasCv(d.hasCv !== false);
        setSuggestionUsage(d.usage ?? null);
      })
      .catch(() => { setSuggestions(FALLBACK_SUGGESTIONS); })
      .finally(() => setLoadingSuggestions(false));
  }, []);

  const coreSources = ["All", "Indeed", "LinkedIn", "Talent.com", "Magnet.me", "Intermediair"];
  const sources = Array.from(new Set([...coreSources, ...jobs.map((j) => j.source)]));
  const filtered = activeSource === "All" ? jobs : jobs.filter((j) => j.source === activeSource);
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  async function search(overrideQuery?: string, forceLang?: "All" | "en" | "nl") {
    const q = (overrideQuery ?? query).trim();
    const loc = location === "Heel Nederland" ? "" : location;
    const targetLang = forceLang ?? activeLanguage;
    setError("");
    setLoading(true);
    setSearched(true);
    setSelectedIds(new Set());
    setActiveSource("All");
    setCurrentPage(1);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (loc) params.set("location", loc);
      if (targetLang !== "All") params.set("lang", targetLang);
      const res = await fetch(`/api/search-jobs${params.toString() ? `?${params}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setJobs(data.jobs ?? []);
      setSearchUsage(data.usage ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    const q = query.trim();
    const loc = location === "Heel Nederland" ? "" : location;
    const nextPage = currentPage + 1;
    setLoadingPage(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (loc) params.set("location", loc);
      if (activeLanguage !== "All") params.set("lang", activeLanguage);
      params.set("page", String(nextPage));
      const res = await fetch(`/api/search-jobs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Load more failed");
      const newJobs: ScrapedJob[] = data.jobs ?? [];
      const existingIds = new Set(jobs.map((j) => j.id));
      const fresh = newJobs.filter((j) => !existingIds.has(j.id));
      setJobs((prev) => [...prev, ...fresh]);
      setCurrentPage(nextPage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPage(false);
    }
  }

  async function likeSelected() {
    const targets = filtered.filter((j) => selectedIds.has(j.id));
    if (targets.length === 0) return;
    for (const target of targets) {
      const savedApp = applications.find((a) => a.jobUrl === target.link);
      if (!savedApp) {
        onLike?.(target);
      }
    }
    setSelectedIds(new Set());
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map((j) => j.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }



  return (
    <div className="bg-white rounded-3xl border border-brand-900/10 shadow-sm p-6 mb-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-brand-900" />
      <div className="mb-4">
        <h2 className="text-sm font-extrabold text-brand-900 uppercase tracking-wider">Job Search</h2>
        <p className="text-xs text-gray-700 mt-0.5 font-medium">Searches Indeed, Talent.com, LinkedIn, Magnet.me & Intermediair</p>
      </div>

      {/* No-CV warning */}
      {!loadingSuggestions && !hasCv && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span>No CV uploaded — match scores require a CV.</span>
          <a href="/profile" className="underline font-medium hover:text-amber-900">Upload in Profile →</a>
        </div>
      )}

      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && search()}
          placeholder="Role or keyword…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
        />
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-44 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900"
        >
          {NL_LOCATIONS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select
          value={activeLanguage}
          onChange={(e) => {
            const nextLang = e.target.value as "All" | "en" | "nl";
            setActiveLanguage(nextLang);
            if (searched || query.trim()) {
              search(undefined, nextLang);
            }
          }}
          className="w-36 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900"
        >
          <option value="All">All Languages</option>
          <option value="en">English 🇬🇧</option>
          <option value="nl">Dutch 🇳🇱</option>
        </select>
        <button
          onClick={() => search()}
          disabled={loading}
          className="px-4 py-2 bg-brand-900 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          {loading ? <><Spinner className="h-4 w-4" /> Searching…</> : <><span>🔍</span> Find Jobs</>}
        </button>
      </div>

      {/* CV-based suggestions */}
      <div className="flex flex-wrap gap-1.5 mb-4 min-h-[28px] items-center">
        {loadingSuggestions ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
            <Spinner className="h-3 w-3" /> Loading suggestions from CV…
          </div>
        ) : (
          <>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); search(s); }}
                disabled={loading}
                className="text-xs px-2.5 py-1 rounded-full border border-brand-900/20 text-brand-900 hover:border-brand-900 hover:bg-brand-900/5 bg-white font-bold transition-all disabled:opacity-40 cursor-pointer"
              >
                {s}
              </button>
            ))}
            {suggestionUsage && (
              <span className="text-[10px] text-gray-600 font-semibold font-mono ml-2" title={`${suggestionUsage.tokensUsed.toLocaleString()} tokens`}>
                (AI suggestions cost: ${suggestionUsage.costUsd.toFixed(5)})
              </span>
            )}
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {!searched && !loading && (
        <div className="text-center py-6 text-gray-600 text-sm font-medium">
          Type a keyword or click <strong className="text-gray-900 font-semibold">Find Jobs</strong> to search.
        </div>
      )}

      {searched && !loading && jobs.length === 0 && !error && (
        <div className="text-center py-6 text-gray-600 text-sm font-medium">
          No jobs found. Try a different keyword or location.
        </div>
      )}

      {jobs.length > 0 && (
        <>
          {/* Source filter + result count */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-1 flex-wrap">
              {sources.map((src) => (
                <button
                  key={src}
                  onClick={() => { setActiveSource(src); setSelectedIds(new Set()); }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    activeSource === src
                      ? "bg-brand-900 text-white border-brand-900 font-bold"
                      : "border-gray-200 text-gray-700 hover:border-gray-400 font-semibold"
                  }`}
                >
                  {src}
                  {src === "All"
                    ? ` (${jobs.length})`
                    : ` (${jobs.filter((j) => j.source === src).length})`}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-700 font-bold flex items-center gap-2">
              {filtered.length} results
              {searchUsage && (
                <span className="text-[10px] text-purple-600 font-mono bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 font-medium" title={`${searchUsage.tokensUsed.toLocaleString()} tokens`}>
                  AI Match Score Cost: ${searchUsage.costUsd.toFixed(5)}
                </span>
              )}
            </span>
          </div>

          {/* Select all + batch */}
          <div className="flex items-center gap-3 mb-2 px-1">
            <label className="flex items-center gap-2 text-xs text-gray-700 font-bold cursor-pointer select-none">
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                className="rounded border-gray-300 text-gray-900 focus:ring-0" />
              Select all
            </label>
            {selectedIds.size > 0 && (
              <button onClick={likeSelected}
                className="ml-auto text-xs px-3 py-1.5 bg-brand-900 text-white rounded-lg hover:bg-brand-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
                <span>❤️</span> Like Selected ({selectedIds.size})
              </button>
            )}
          </div>

          {/* Results */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
            {filtered.map((job) => {
              const savedApp = applications.find((a) => a.jobUrl === job.link);
              const isLiked = savedApp?.status === "liked";
              const isApplied = savedApp && savedApp.status !== "liked";

              return (
                <div key={job.id}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    selectedIds.has(job.id) ? "border-gray-400 bg-gray-50" : "border-gray-100 hover:border-gray-300"
                  }`}
                >
                  <input type="checkbox" checked={selectedIds.has(job.id)} onChange={() => toggleOne(job.id)}
                    className="mt-1 rounded border-gray-300 text-gray-900 focus:ring-0 cursor-pointer flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{job.title}</span>
                      {job.matchScore !== undefined && <MatchBadge score={job.matchScore} />}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[job.source] ?? "bg-gray-100 text-gray-500"}`}>
                        {job.source}
                      </span>
                      {job.language && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          job.language === "en" ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-orange-50 text-orange-600 border border-orange-100"
                        }`}>
                          {job.language === "en" ? "🇬🇧 EN" : "🇳🇱 NL"}
                        </span>
                      )}
                      {savedApp && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          savedApp.emailBody || savedApp.letterBase64 ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {savedApp.emailBody || savedApp.letterBase64 ? "Prepared ✅" : "Saved 💾"} on {new Date(savedApp.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-700 mt-1 font-medium">
                      <span className="text-gray-900 font-bold">{job.company}</span> · <span className="text-gray-700 font-semibold">{job.location}</span>
                    </div>
                    {job.snippet && (
                      <p className="text-xs text-gray-700 mt-1 line-clamp-2 font-medium leading-relaxed">{job.snippet.replace(/<[^>]*>/g, "").trim()}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a href={job.link} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-gray-700 hover:text-gray-900 font-semibold mr-1">View ↗</a>
                    
                    {/* Like Toggle Button */}
                    <button
                      onClick={() => {
                        if (isApplied) return;
                        if (isLiked && savedApp) {
                          onUnlike?.(savedApp.id);
                        } else {
                          onLike?.(job);
                        }
                      }}
                      className={`p-1.5 rounded-lg border transition-all ${
                        isApplied
                          ? "text-blue-500 bg-blue-50 border-blue-100 cursor-default"
                          : isLiked
                          ? "text-rose-500 bg-rose-50 border-rose-100 hover:bg-rose-100"
                          : "text-gray-600 bg-white border-gray-300 hover:text-rose-500 hover:border-rose-200"
                      }`}
                      title={isApplied ? "Already applied / processing" : isLiked ? "Unlike vacancy" : "Like vacancy"}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill={isLiked || isApplied ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        {isApplied ? (
                          <path d="M20 6L9 17l-5-5" />
                        ) : (
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        )}
                      </svg>
                    </button>


                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {searched && !loading && jobs.length > 0 && (
            <button
              onClick={loadMore}
              disabled={loadingPage}
              className="mt-3 w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingPage ? <><Spinner className="h-3 w-3" /> Loading more…</> : "Load more results"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
