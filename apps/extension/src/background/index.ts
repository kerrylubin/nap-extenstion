console.log("NAPAI Extension Background Service Worker loaded");

chrome.runtime.onInstalled.addListener(() => {
  console.log("NAPAI Extension installed.");
});
