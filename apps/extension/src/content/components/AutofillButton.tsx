import React, { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

interface AutofillButtonProps {
  form: HTMLFormElement;
}

export const AutofillButton: React.FC<AutofillButtonProps> = ({ form }) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleAutofill = (e: React.MouseEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_APPLICATION', url: window.location.href }, (response: any) => {
      if (chrome.runtime.lastError) {
        console.error("Autofill communication error:", chrome.runtime.lastError);
        alert("Auto-Fill Failed: Extension communication error.");
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
        return;
      }
      
      if (!response || !response.success) {
        console.error("Autofill error:", response?.reason);
        alert("Auto-Fill Failed: " + (response?.reason || "Unknown error"));
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
        return;
      }

      const { application, profile } = response;
      
      const inputs = form.querySelectorAll('input, textarea, select');
      inputs.forEach((el) => {
        const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const name = (input.name || input.id || input.getAttribute('placeholder') || '').toLowerCase();
        
        // Handle Radio & Checkbox
        if (input.tagName.toLowerCase() === 'input' && ((input as HTMLInputElement).type === 'checkbox' || (input as HTMLInputElement).type === 'radio')) {
          // If it's asking for terms, agree, conditions, privacy - check it
          if (name.includes('terms') || name.includes('agree') || name.includes('privacy') || name.includes('conditions')) {
            (input as HTMLInputElement).checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return;
        }

        let valueToSet = '';
        if (name.includes('first') && profile?.name) {
          valueToSet = profile.name.split(' ')[0];
        } else if (name.includes('last') && profile?.name) {
          const parts = profile.name.split(' ');
          valueToSet = parts.length > 1 ? parts.slice(1).join(' ') : '';
        } else if (name.includes('name') && profile?.name) {
          valueToSet = profile.name;
        } else if (name.includes('email') && profile?.email) {
          valueToSet = profile.email;
        } else if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
          valueToSet = profile?.phone || '';
        } else if (input.tagName.toLowerCase() === 'textarea' && application?.email_body) {
          valueToSet = application.email_body;
        }

        if (input.tagName.toLowerCase() === 'select' && valueToSet) {
          // Try to select an option that matches the valueToSet
          const select = input as HTMLSelectElement;
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].text.toLowerCase().includes(valueToSet.toLowerCase()) || 
                select.options[i].value.toLowerCase().includes(valueToSet.toLowerCase())) {
              select.selectedIndex = i;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        } else if (valueToSet && 'value' in input) {
          input.value = valueToSet;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
      
      // Tell background script to update application status to 'sent'? Maybe wait for form submit.
    });
  };

  return (
    <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f7f9', border: '1px solid #bbe1e7', borderRadius: '8px' }}>
      <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#34718a', fontWeight: '500' }}>
        NAPAI Extension is active on this form.
      </p>
      <button
        onClick={handleAutofill}
        disabled={status === 'loading'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          backgroundColor: status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#418ca3',
          color: 'white',
          borderRadius: '6px',
          fontWeight: '600',
          fontSize: '14px',
          border: 'none',
          cursor: status === 'loading' ? 'default' : 'pointer',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          transition: 'all 0.2s',
          opacity: status === 'loading' ? 0.7 : 1,
        }}
      >
        {status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : 
         status === 'success' ? <CheckCircle2 size={16} /> : 
         <Sparkles size={16} />} 
        {status === 'loading' ? 'Fetching data...' : 
         status === 'success' ? 'Auto-Filled Successfully!' : 
         status === 'error' ? 'Error (Check Console)' :
         'Auto-Fill Application'}
      </button>
      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#6b7280' }}>
        Note: You will still need to manually attach your CV/Resume file.
      </p>
    </div>
  );
};
