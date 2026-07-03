import { supabase } from '../lib/supabase';

console.log("NAPAI Extension Background Service Worker loaded");

chrome.runtime.onInstalled.addListener(() => {
  console.log("NAPAI Extension installed.");
});

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  if (message.type === 'IMPORT_JOB') {
    const job = message.payload;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        sendResponse({ success: false, reason: 'Not logged in' });
        return;
      }

      supabase.from('applications').insert({
        user_id: session.user.id,
        job_url: job.url,
        job_title: job.title,
        company: job.company,
        job_description: job.description,
        status: 'liked'
      }).then(({ error }) => {
        if (error) {
          sendResponse({ success: false, reason: error.message });
        } else {
          sendResponse({ success: true });
        }
      });
    });
    return true; 
  } else if (message.type === 'GET_ACTIVE_APPLICATION') {
    const currentUrl = message.url;
    
    chrome.storage.local.get(['active_application_id'], (result) => {
      const appId = result.active_application_id;

      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) {
          sendResponse({ success: false, reason: 'Not logged in' });
          return;
        }

        try {
          let appData = null;

          // Fetch Application by ID if available
          if (appId) {
            const { data, error } = await supabase
              .from('applications')
              .select('*')
              .eq('id', appId)
              .maybeSingle();
            
            if (error) throw error;
            appData = data;
          }

          // Fallback: Fetch by URL if ID lookup failed or wasn't set
          if (!appData && currentUrl) {
            const { data, error } = await supabase
              .from('applications')
              .select('*')
              .eq('user_id', session.user.id)
              .eq('job_url', currentUrl)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (error) throw error;
            appData = data;
          }

          if (!appData) {
            sendResponse({ success: false, reason: "Application not found in database." });
            return;
          }

          // Fetch Profile
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('name, email, phone')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileError) throw profileError;

          sendResponse({ 
            success: true, 
            application: appData, 
            profile: profileData 
          });
        } catch (error: any) {
          console.error("Error fetching active application data:", error);
          sendResponse({ success: false, reason: error.message });
        }
      });
    });
    return true; // Indicates async response
  } else if (message.type === 'CHECK_SESSION') {
    supabase.auth.getSession().then(({ data: { session } }) => {
      sendResponse({ hasSession: !!session });
    });
    return true;
  } else if (message.type === 'CHECK_JOB_ONLINE') {
    const jobUrl = message.url;
    fetch(jobUrl, { method: 'HEAD' })
      .then(res => {
        // Many job boards return 404 or redirect when closed. 
        // 200 means it's generally still active, though some soft-404.
        sendResponse({ isOnline: res.ok, status: res.status });
      })
      .catch(err => {
        sendResponse({ isOnline: false, error: err.message });
      });
    return true;
  }
});
