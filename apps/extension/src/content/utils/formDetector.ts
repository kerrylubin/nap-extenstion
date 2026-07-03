export interface FormField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  type: string;
  name: string;
  id: string;
}

export const detectApplicationForm = (): HTMLFormElement | null => {
  // Common keywords in job application form fields
  const applicationKeywords = ['firstname', 'lastname', 'email', 'phone', 'resume', 'cv', 'coverletter', 'linkedin', 'github', 'portfolio'];
  
  const forms = Array.from(document.querySelectorAll('form'));
  
  for (const form of forms) {
    const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
    let matchCount = 0;
    
    for (const input of inputs) {
      const name = input.getAttribute('name')?.toLowerCase() || '';
      const id = input.getAttribute('id')?.toLowerCase() || '';
      const type = input.getAttribute('type')?.toLowerCase() || '';
      
      const combinedAttributes = `${name} ${id} ${type}`;
      
      if (applicationKeywords.some(keyword => combinedAttributes.includes(keyword))) {
        matchCount++;
      }
    }
    
    // If a form has multiple fields matching application keywords, it's highly likely to be a job application
    if (matchCount >= 2) {
      return form;
    }
  }
  
  return null;
};
