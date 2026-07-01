"use client";
import { useState } from "react";
import { ProcessJobResult } from "@/types";

interface JobProgress {
  url: string;
  status: "queued" | "processing" | "done" | "error";
  result?: ProcessJobResult;
  error?: string;
}

interface Props {
  onClose: () => void;
  onResults: (results: ProcessJobResult[]) => void;
}

export function BulkImportModal({ onClose, onResults }: Props) {
  const [raw, setRaw] = useState("");
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  function parseUrls(): string[] {
    return raw
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http"));
  }

  async function processAll() {
    const urls = parseUrls();
    if (urls.length === 0) return;

    const initial: JobProgress[] = urls.map((url) => ({
      url,
      status: "queued",
    }));
    setJobs(initial);
    setRunning(true);
    setDone(false);

    const completed: ProcessJobResult[] = [];

    // Process sequentially to avoid hammering servers
    for (let i = 0; i < urls.length; i++) {
      setJobs((prev) =>
        prev.map((j, idx) =>
          idx === i ? { ...j, status: "processing" } : j
        )
      );

      try {
        const res = await fetch("/api/process-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobUrl: urls[i] }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "Failed");

        completed.push(data as ProcessJobResult);
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i ? { ...j, status: "done", result: data } : j
          )
        );
      } catch (e: unknown) {
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i
              ? { ...j, status: "error", error: e instanceof Error ? e.message : String(e) }
              : j
          )
        );
      }
    }

    setRunning(false);
    setDone(true);
    onResults(completed);
  }

  const counts = {
    queued: jobs.filter((j) => j.status === "queued").length,
    processing: jobs.filter((j) => j.status === "processing").length,
    done: jobs.filter((j) => j.status === "done").length,
    error: jobs.filter((j) => j.status === "error").length,
  };
  const progress = jobs.length > 0 ? Math.round(((counts.done + counts.error) / jobs.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import Jobs</h2>
            <p className="text-xs text-gray-700 mt-0.5 font-medium">Paste multiple job URLs — AI processes them all</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {!running && !done && (
          <>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Job URLs — one per line (or comma-separated)
            </label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={10}
              placeholder={`https://nl.indeed.com/viewjob?jk=abc123\nhttps://www.werkenbij.nl/vacature/xyz\nhttps://jobs.philips.com/...`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-700 mt-1.5 font-medium">
              {parseUrls().length} URL{parseUrls().length !== 1 ? "s" : ""} detected
              {" · "}Tip: for LinkedIn, paste text instead using &quot;Add Job&quot;
            </p>
          </>
        )}

        {(running || done) && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-700 mb-1 font-semibold">
                <span>{counts.done + counts.error} / {jobs.length} processed</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-brand-300 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {done && (
                <p className="text-xs text-green-600 mt-1.5 font-medium">
                  Done! {counts.done} job{counts.done !== 1 ? "s" : ""} added to your review queue.
                  {counts.error > 0 && ` ${counts.error} failed.`}
                </p>
              )}
            </div>

            {jobs.map((job, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-gray-100 px-4 py-3"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {job.status === "queued" && (
                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                      {i + 1}
                    </span>
                  )}
                  {job.status === "processing" && (
                    <svg className="animate-spin h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  {job.status === "done" && (
                    <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs text-green-600">✓</span>
                  )}
                  {job.status === "error" && (
                    <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs text-red-500">✕</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {job.result ? (
                    <>
                      <div className="text-sm font-bold text-gray-900">{job.result.jobTitle}</div>
                      <div className="text-xs text-gray-700 font-semibold">{job.result.company} · Match: {job.result.matchScore}%</div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-700 font-medium truncate">{job.url}</div>
                  )}
                  {job.error && (
                    <div className="text-xs text-red-600 font-semibold mt-0.5">{job.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            {done ? "Close" : "Cancel"}
          </button>
          {!running && !done && (
            <button
              onClick={processAll}
              disabled={parseUrls().length === 0}
              className="px-4 py-2 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
            >
              Process {parseUrls().length} Job{parseUrls().length !== 1 ? "s" : ""} with AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
