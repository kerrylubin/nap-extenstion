import { useState, useEffect } from 'react';
import { Briefcase, ExternalLink, Trash2, LogOut, ChevronDown, CheckCircle2, Sparkles, Send, Layers, RotateCcw, Calendar, Percent, Loader2, Eye, Search } from 'lucide-react';
import { supabase } from './lib/supabase';
import './App.css';

interface Job {
  id: string;
  job_url: string;
  job_title: string;
  company: string;
  created_at: string;
  status: string;
  email_body?: string;
  recruiter_email?: string;
  match_score?: number;
  email_sent_date?: string;
  follow_up_date?: string;
  letter_base64?: string;
  letter_path?: string;
  letter_text?: string;
  tokens_used?: number;
  cost_usd?: number;
  contact_name?: string;
  recruiter_phone?: string;
  language?: string;
  job_description?: string;
}

type FilterOption = 'All' | 'Liked' | 'Liked w/ Email' | 'Pending' | 'Sent' | 'Interview' | 'No Answer' | 'Rejected' | 'Contact' | 'Follow Up';

import ReviewModal from './components/ReviewModal';

function App() {
  const [session, setSession] = useState<any>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reviewApp, setReviewApp] = useState<Job | null>(null);
  const [filter, setFilter] = useState<FilterOption>('All');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preparingIds, setPreparingIds] = useState<Set<string>>(new Set());
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [checkingStatusIds, setCheckingStatusIds] = useState<Set<string>>(new Set());
  const [autoCheckedIds, setAutoCheckedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; message: string } | null>(null);

  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchJobs();
      fetch('http://localhost:3000/api/auth/status')
        .then(res => res.json())
        .then(data => setGmailConnected(data.connected))
        .catch(console.error);
    }
  }, [session]);

  useEffect(() => {
    if (jobs.length === 0) return;
    
    // Automatically check online status in the background for jobs that aren't rejected or already offline
    const jobsToCheck = jobs.filter(j => 
      j.status !== 'Rejected' && 
      !j.company.includes('[OFFLINE]') &&
      !autoCheckedIds.has(j.id) &&
      j.job_url
    );

    if (jobsToCheck.length > 0) {
      setAutoCheckedIds(prev => new Set([...prev, ...jobsToCheck.map(j => j.id)]));
      
      jobsToCheck.forEach(async (job) => {
        const isOnline = await checkJobOnline(job.job_url);
        if (!isOnline && !job.company.includes('[OFFLINE]')) {
          const newCompany = `[OFFLINE] ${job.company}`;
          await supabase.from('applications').update({ company: newCompany }).eq('id', job.id);
          setJobs(prevJobs => prevJobs.map(j => j.id === job.id ? { ...j, company: newCompany } : j));
        }
      });
    }
  }, [jobs, autoCheckedIds]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['napai_filter'], (result) => {
        if (result.napai_filter) {
          setFilter(result.napai_filter as FilterOption);
        }
      });
    }
  }, []);

  const handleSetFilter = (newFilter: FilterOption) => {
    setFilter(newFilter);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ napai_filter: newFilter });
    }
  };

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from('applications')
      .select('id, job_url, job_title, company, created_at, status, email_body, recruiter_email, match_score, email_sent_date, follow_up_date, letter_base64, letter_path, letter_text, tokens_used, cost_usd, contact_name, recruiter_phone, language, job_description')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setJobs(data as Job[]);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const removeJob = async (id: string) => {
    setJobs(jobs.filter(j => j.id !== id));
    await supabase.from('applications').delete().eq('id', id);
  };

  const updateJobStatus = async (id: string, newStatus: string) => {
    setJobs(jobs.map(j => j.id === id ? { ...j, status: newStatus } : j));
    const { error } = await supabase.from('applications').update({ status: newStatus }).eq('id', id);
    if (error) {
      alert("Failed to update status: " + error.message);
      fetchJobs();
    }
  };

  const handleView = (url: string) => {
    if (url) window.open(url, '_blank');
  };

  const handleApply = async (job: Job) => {
    await chrome.storage.local.set({ active_application_id: job.id });
    if (job.job_url) window.open(job.job_url, '_blank');
  };

  const handlePrepare = async (job: Job) => {
    if (preparingIds.has(job.id)) return;
    
    setPreparingIds(prev => {
      const next = new Set(prev);
      next.add(job.id);
      return next;
    });
    
    try {
      const apiUrl = 'http://localhost:3000/api/process-job';
      
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobUrl: job.job_url || undefined,
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process job');
      
      // Update local db via supabase
      const { data: updatedApp, error } = await supabase.from('applications').update({
        job_title: data.jobTitle || job.job_title,
        company: data.company || job.company,
        email_body: data.emailBody,
        letter_base64: data.letterBase64,
        letter_path: data.letterFilename,
        letter_text: data.letterText,
        match_score: data.matchScore,
        recruiter_email: data.recruiterEmail ?? job.recruiter_email,
        recruiter_phone: data.recruiterPhone,
        contact_name: data.contactName,
        language: data.language,
        status: 'pending',
      }).eq('id', job.id).select().single();
      
      if (error) throw error;
      
      // Update local jobs array
      setJobs(prevJobs => prevJobs.map(j => j.id === job.id ? updatedApp as Job : j));
      
    } catch (err: any) {
      alert(`Preparation failed for ${job.company}: ` + err.message);
    } finally {
      setPreparingIds(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handlePrepareSelected = async () => {
    const targets = jobs.filter(j => selectedJobIds.has(j.id));
    if (targets.length === 0) return;
    
    setBulkProgress({ done: 0, total: targets.length, message: `Preparing 1 of ${targets.length}...` });
    
    let currentDone = 0;
    for (const job of targets) {
      setBulkProgress({ done: currentDone, total: targets.length, message: `Preparing ${currentDone + 1} of ${targets.length}...` });
      await handlePrepare(job);
      currentDone++;
    }
    
    setBulkProgress(null);
    setSelectedJobIds(new Set());
  };

  const checkJobOnline = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime) return resolve(true);
      chrome.runtime.sendMessage({ type: 'CHECK_JOB_ONLINE', url }, (res) => {
        if (!res) resolve(true);
        else resolve(res.isOnline);
      });
    });
  };

  const handleCheckStatus = async (job: Job) => {
    if (!job.job_url) return;
    setCheckingStatusIds(prev => new Set(prev).add(job.id));
    const isOnline = await checkJobOnline(job.job_url);
    
    if (!isOnline && !job.company.includes('[OFFLINE]')) {
      const newCompany = `[OFFLINE] ${job.company}`;
      await supabase.from('applications').update({ company: newCompany }).eq('id', job.id);
      setJobs(prevJobs => prevJobs.map(j => j.id === job.id ? { ...j, company: newCompany } : j));
    } else if (isOnline && job.company.includes('[OFFLINE]')) {
      const newCompany = job.company.replace('[OFFLINE] ', '');
      await supabase.from('applications').update({ company: newCompany }).eq('id', job.id);
      setJobs(prevJobs => prevJobs.map(j => j.id === job.id ? { ...j, company: newCompany } : j));
    }
    
    setCheckingStatusIds(prev => {
      const next = new Set(prev);
      next.delete(job.id);
      return next;
    });
  };

  const handleCheckStatusSelected = async () => {
    const targets = jobs.filter(j => selectedJobIds.has(j.id));
    if (targets.length === 0) return;
    
    setBulkProgress({ done: 0, total: targets.length, message: `Checking 1 of ${targets.length}...` });
    
    let currentDone = 0;
    for (const job of targets) {
      setBulkProgress({ done: currentDone, total: targets.length, message: `Checking ${currentDone + 1} of ${targets.length}...` });
      await handleCheckStatus(job);
      currentDone++;
    }
    
    setBulkProgress(null);
    setSelectedJobIds(new Set());
  };

  const handleOpenWebApp = () => {
    window.open('http://localhost:3000', '_blank'); // Opens the web app
  };

  const isFollowUpDue = (dateStr?: string) => {
    if (!dateStr) return false;
    const today = new Date();
    const followUp = new Date(dateStr);
    return followUp <= today;
  };

  const counts = {
    'All': jobs.length,
    'Liked': jobs.filter(j => j.status === 'liked' && !j.recruiter_email).length,
    'Liked w/ Email': jobs.filter(j => j.status === 'liked' && !!j.recruiter_email).length,
    'Pending': jobs.filter(j => j.status === 'pending').length,
    'Sent': jobs.filter(j => j.status === 'sent').length,
    'Interview': jobs.filter(j => j.status === 'interview').length,
    'No Answer': jobs.filter(j => j.status === 'no_answer').length,
    'Rejected': jobs.filter(j => j.status === 'rejected').length,
    'Contact': jobs.filter(j => j.status === 'contact').length,
    'Follow Up': jobs.filter(j => !!j.follow_up_date).length,
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'All') return true;
    if (filter === 'Liked') return job.status === 'liked' && !job.recruiter_email;
    if (filter === 'Liked w/ Email') return job.status === 'liked' && !!job.recruiter_email;
    if (filter === 'Follow Up') return !!job.follow_up_date;
    if (filter === 'No Answer') return job.status === 'no_answer';
    return job.status === filter.toLowerCase();
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'liked': return 'bg-pink-100 text-pink-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'sent': return 'bg-blue-100 text-blue-700';
      case 'interview': return 'bg-green-100 text-green-700';
      case 'no_answer': return 'bg-orange-100 text-orange-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      case 'contact': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="w-[400px] bg-white flex items-center justify-center h-[500px]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="w-[400px] bg-gray-50 flex flex-col h-[500px] p-6 justify-center">
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">NAPAI Extension</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in to sync your saved jobs.</p>
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              className="w-full bg-brand-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] bg-white flex flex-col h-[600px]">
      <header className="p-4 border-b border-gray-100 flex items-center justify-between bg-brand-50 text-brand-900">
        <div className="flex items-center gap-3">
          <Briefcase className="text-brand-500" />
          <h1 className="text-lg font-semibold tracking-tight">NAPAI Saved Jobs</h1>
        </div>
        <button onClick={handleLogout} className="text-gray-500 hover:text-gray-900 transition-colors" title="Sign out">
          <LogOut size={16} />
        </button>
      </header>

      {gmailConnected === false && (
        <div className="bg-red-50 px-4 py-2 border-b border-red-100 flex items-center justify-between">
          <span className="text-xs text-red-700 font-medium flex items-center gap-1.5"><LogOut size={12} className="rotate-180" /> Gmail not connected</span>
          <a
            href="http://localhost:3000/api/auth/connect"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] bg-red-600 text-white px-2.5 py-1 rounded hover:bg-red-700 font-bold tracking-wide uppercase transition-colors"
            onClick={() => {
              // Optimistically check again after 10 seconds
              setTimeout(() => {
                fetch('http://localhost:3000/api/auth/status')
                  .then(res => res.json())
                  .then(data => setGmailConnected(data.connected))
                  .catch(console.error);
              }, 10000);
            }}
          >
            Connect
          </a>
        </div>
      )}

      <div className="bg-white border-b border-gray-100 p-3">
        <div className="relative">
          <select 
            className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            value={filter}
            onChange={(e) => {
              handleSetFilter(e.target.value as FilterOption);
              setSelectedJobIds(new Set());
            }}
          >
            <option value="All">All ({counts['All']})</option>
            <option value="Liked">Liked ❤️ ({counts['Liked']})</option>
            <option value="Liked w/ Email">Liked w/ Email ✉️ ({counts['Liked w/ Email']})</option>
            <option value="Pending">Pending ({counts['Pending']})</option>
            <option value="Sent">Sent ({counts['Sent']})</option>
            <option value="Interview">Interview ({counts['Interview']})</option>
            <option value="No Answer">No Answer ({counts['No Answer']})</option>
            <option value="Rejected">Rejected ({counts['Rejected']})</option>
            <option value="Contact">Contact ({counts['Contact']})</option>
            <option value="Follow Up">Follow Up ⏰ ({counts['Follow Up']})</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>
        
        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={filteredJobs.length > 0 && selectedJobIds.size === filteredJobs.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedJobIds(new Set(filteredJobs.map(j => j.id)));
                } else {
                  setSelectedJobIds(new Set());
                }
              }}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Select All</span>
          </label>

          {selectedJobIds.size > 0 && (
            <div className="flex gap-2">
                <button
                  onClick={handleCheckStatusSelected}
                  disabled={bulkProgress !== null}
                  className="flex items-center justify-center p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-70"
                  title="Verify Online Status"
                >
                  {bulkProgress && bulkProgress.message.includes('Checking') ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                </button>
              <button
                onClick={handlePrepareSelected}
                disabled={bulkProgress !== null}
                className="flex items-center justify-center p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-70"
                title={Array.from(selectedJobIds).some(id => jobs.find(j => j.id === id)?.email_body) ? 'Re-Prepare Selected' : 'Prepare Selected'}
              >
                {bulkProgress && bulkProgress.message.includes('Preparing') ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
              </button>
            </div>
          )}
        </div>

        {filter === 'Follow Up' && counts['Follow Up'] > 0 && (
          <button
            onClick={handleOpenWebApp}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Layers size={16} /> Bulk Follow-Up / Re-Apply ({counts['Follow Up']})
          </button>
        )}
      </div>

      <main className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 gap-3">
            <div className="bg-gray-100 p-4 rounded-full">
              <Briefcase size={32} className="text-gray-400" />
            </div>
            <p className="text-sm">No jobs found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <div key={job.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3 relative group">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0 pr-2">
                      <input 
                        type="checkbox"
                        checked={selectedJobIds.has(job.id)}
                        onChange={(e) => {
                          const next = new Set(selectedJobIds);
                          if (e.target.checked) next.add(job.id);
                          else next.delete(job.id);
                          setSelectedJobIds(next);
                        }}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800 text-sm truncate" title={job.job_title}>{job.job_title}</span>
                            <div 
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${job.company.includes('[OFFLINE]') ? 'bg-red-500' : 'bg-green-500'}`} 
                              title={job.company.includes('[OFFLINE]') ? "Job is Offline" : "Job is Online"} 
                            />
                          </div>
                          <div className="text-xs text-gray-500 font-medium truncate" title={job.company.replace('[OFFLINE] ', '').replace('[OFFLINE]', '')}>
                            {job.company.replace('[OFFLINE] ', '').replace('[OFFLINE]', '')}
                          </div>
                        </div>
                      </div>
                    </div>
                    <select
                      value={job.status}
                      onChange={(e) => updateJobStatus(job.id, e.target.value)}
                      className={`appearance-none cursor-pointer text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-center ${getStatusColor(job.status)}`}
                      style={{ textAlignLast: 'center' }}
                    >
                      <option value="liked">LIKED</option>
                      <option value="pending">PENDING</option>
                      <option value="sent">SENT</option>
                      <option value="interview">INTERVIEW</option>
                      <option value="no_answer">NO ANSWER</option>
                      <option value="rejected">REJECTED</option>
                      <option value="contact">CONTACT</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {job.match_score !== undefined && job.match_score > 0 && (
                    <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
                      <Percent size={10} /> {job.match_score}% Match
                    </span>
                  )}
                  {job.email_sent_date && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Send size={10} /> {new Date(job.email_sent_date).toLocaleDateString()}
                    </span>
                  )}
                  {job.follow_up_date && (
                    <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 font-medium ${isFollowUpDue(job.follow_up_date) ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
                      <Calendar size={10} /> Follow Up: {new Date(job.follow_up_date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-center mt-2 border-t border-gray-50 pt-3">
                  <span className={`text-xs font-medium ${job.email_body ? 'text-green-600' : 'text-gray-400'}`}>
                    {job.email_body ? 'Prepared ✅' : 'Saved 💾'} on {new Date(job.created_at).toLocaleDateString()}
                  </span>
                  
                  <div className="flex gap-1">
                    {job.status === 'liked' && !job.email_body && (
                      <button 
                        onClick={() => handlePrepare(job)}
                        disabled={preparingIds.has(job.id)}
                        className="flex items-center justify-center p-2 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-60"
                        title="Prepare Application"
                      >
                        {preparingIds.has(job.id) ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      </button>
                    )}
                    
                    {(job.status === 'pending' || (job.status === 'liked' && job.email_body)) ? (
                      <button 
                        onClick={() => handleApply(job)}
                        className="flex items-center justify-center p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                        title="Auto-Fill Application"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    ) : (job.status === 'sent' || job.status === 'no_answer') ? (
                      <button 
                        onClick={() => handleApply(job)}
                        className="flex items-center justify-center p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Auto-Fill again"
                      >
                        <RotateCcw size={16} />
                      </button>
                    ) : null}
                    
                    {job.email_body && (
                      <button 
                        onClick={() => setReviewApp(job)}
                        className="flex items-center justify-center p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                        title="Review Motivation Letter"
                      >
                        <Eye size={16} />
                      </button>
                    )}
                    
                    <button 
                      onClick={() => handleView(job.job_url)}
                      className="flex items-center justify-center p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title="View External"
                    >
                      <ExternalLink size={16} />
                    </button>
                    <button 
                      onClick={() => handleCheckStatus(job)}
                      disabled={checkingStatusIds.has(job.id)}
                      className="flex items-center justify-center p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-60"
                      title="Verify if job is still online"
                    >
                      {checkingStatusIds.has(job.id) ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    </button>
                    <button 
                      onClick={() => removeJob(job.id)}
                      className="flex items-center justify-center p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {reviewApp && (
        <ReviewModal
          app={reviewApp}
          session={session}
          onClose={() => setReviewApp(null)}
          onSent={(id) => {
            setJobs(jobs => jobs.map(j => j.id === id ? { ...j, status: 'sent', email_sent_date: new Date().toISOString() } : j));
          }}
          onLetterUpdated={(id, updates) => {
            setJobs(jobs => jobs.map(j => j.id === id ? { ...j, ...updates } : j));
          }}
        />
      )}
    </div>
  );
}

export default App;
