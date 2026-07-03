import React from 'react';
import { createRoot } from 'react-dom/client';
import { LikeButton } from './components/LikeButton';
import { detectApplicationForm } from './utils/formDetector';
import { AutofillButton } from './components/AutofillButton';

console.log("NAPAI Extension Content Script loaded");

// Only inject UI if the user has an active session
chrome.runtime.sendMessage({ type: 'CHECK_SESSION' }, (response: any) => {
  if (chrome.runtime.lastError || !response?.hasSession) {
    console.log("NAPAI Extension: No active session or error, skipping UI injection.");
    return;
  }

  // Create a container for our React app (Like Button)
  const container = document.createElement('div');
  container.id = 'napai-extension-root';
  document.body.appendChild(container);

  // Render the LikeButton
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <LikeButton />
    </React.StrictMode>
  );

  // Detect application form and inject Autofill button
  setTimeout(() => {
    const form = detectApplicationForm();
    if (form) {
      console.log("NAPAI Extension: Application form detected", form);
      
      // Inject autofill button container right before the form
      const autofillContainer = document.createElement('div');
      autofillContainer.id = 'napai-autofill-root';
      form.parentNode?.insertBefore(autofillContainer, form);
      
      const autofillRoot = createRoot(autofillContainer);
      autofillRoot.render(
        <React.StrictMode>
          <AutofillButton form={form} />
        </React.StrictMode>
      );
    }
  }, 2000); // Wait 2s for SPA to finish rendering the form
});

