import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { extractJobDetails } from '../utils/jobExtractor';

export const LikeButton: React.FC = () => {
  const [liked, setLiked] = useState(false);

  const handleLike = () => {
    if (liked) return;
    
    const jobDetails = extractJobDetails();
    console.log("Saving job:", jobDetails);
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'IMPORT_JOB',
      payload: jobDetails
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Extension communication error:", chrome.runtime.lastError);
        alert("Failed to save job: Extension communication error.");
        return;
      }
      if (!response || !response.success) {
        console.error("Failed to save job:", response?.reason);
        alert("Failed to save job: " + (response?.reason || "Unknown error"));
        return;
      }
      
      setLiked(true);
      setTimeout(() => setLiked(false), 2000); // Reset after 2 seconds for visual feedback
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999]" style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 9999 }}>
      <button
        onClick={handleLike}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
          borderRadius: '9999px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.3s ease',
          backgroundColor: liked ? '#22c55e' : '#418ca3',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          transform: liked ? 'scale(1.1)' : 'scale(1)'
        }}
        title="Save Job to NAPAI"
      >
        <Heart size={24} fill={liked ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
};
