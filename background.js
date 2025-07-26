// background.js - This script runs in the background of your Chrome extension.

console.log("Automation Scout background script loaded!");

// --- Configuration ---
const REPORT_FREQUENCY_DAILY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const REPORT_FREQUENCY_WEEKLY_MS = 7 * REPORT_FREQUENCY_DAILY_MS; // 7 days in milliseconds
const DATA_RETENTION_MS = REPORT_FREQUENCY_WEEKLY_MS * 2; // Keep data for 2 weeks to ensure weekly reports are accurate

// --- Vercel Backend Configuration (IMPORTANT: Replace with your actual values!) ---
const VERCEL_API_ENDPOINT = 'https://automation-scout-backend.vercel.app/api/send-report'; // Example: 'https://automation-scout-backend-abcd.vercel.app/api/send-report'
const EXTENSION_SHARED_SECRET = 'big_little_secret_flag_monster_192403839_kYZ'; // MUST match the secret set in Vercel environment variables
const SENDGRID_VERIFIED_SENDER_EMAIL = 'max@mbstern.com'; // The 'FROM' email address you verified in SendGrid


// --- Helper Function: Get clean URL ---
function getCleanUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove query parameters and hash for cleaner tracking of base pages
    urlObj.search = '';
    urlObj.hash = '';
    return urlObj.toString();
  } catch (e) {
    console.error("Invalid URL:", url, e);
    return null; // Return null for invalid URLs
  }
}

// --- Tracking Logic ---
async function trackPageVisit(url, title) {
  if (!url || !url.startsWith('http')) {
    return; // Only track http(s) pages
  }

  const cleanUrl = getCleanUrl(url);
  if (!cleanUrl) return;

  const now = Date.now(); // Current timestamp

  chrome.storage.local.get('trackedPages', (data) => {
    const trackedPages = data.trackedPages || {};

    if (!trackedPages[cleanUrl]) {
      trackedPages[cleanUrl] = {
        title: title || cleanUrl, // Use tab title if available, otherwise clean URL
        visits: [], // Store timestamps of visits
        firstVisit: now,
        lastVisit: now
      };
    }

    // Add current timestamp to visits
    trackedPages[cleanUrl].visits.push(now);

    // Update last visit timestamp
    trackedPages[cleanUrl].lastVisit = now;

    // Filter out visits older than our data retention period
    trackedPages[cleanUrl].visits = trackedPages[cleanUrl].visits.filter(
      (timestamp) => now - timestamp < DATA_RETENTION_MS
    );

    chrome.storage.local.set({ trackedPages }, () => {
      // console.log("Tracked page:", cleanUrl, "Current count:", trackedPages[cleanUrl].visits.length);
    });
  });
}

// Listener for when a tab is updated (e.g., URL changes, page finishes loading)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // We only care about tabs that have finished loading and have a valid URL
  if (changeInfo.status === 'complete' && tab.url) {
    trackPageVisit(tab.url, tab.title);
  }
});

// Listener for when the active tab changes (ensures we catch newly activated tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url) {
      trackPageVisit(tab.url, tab.title);
    }
  });
});

// --- Report Scheduling Logic ---
function scheduleNextReport() {
  chrome.storage.local.get(['reportFrequency', 'lastReportSentTime'], (result) => {
    const frequency = result.reportFrequency || 'weekly'; // Default to weekly
    const lastReportSentTime = result.lastReportSentTime || 0;
    let intervalMs = REPORT_FREQUENCY_WEEKLY_MS; // Default for weekly

    if (frequency === 'daily') {
      intervalMs = REPORT_FREQUENCY_DAILY_MS;
    }

    const now = Date.now();
    let nextReportTime = lastReportSentTime + intervalMs;

    // If the next report time is in the past, schedule it for the next interval from *now*
    // This handles cases where the browser might have been closed for a while
    if (nextReportTime < now) {
      nextReportTime = now + intervalMs; // Schedule for one full interval from now
    }
    
    // Clear any existing alarms to prevent duplicates
    chrome.alarms.clear('sendReportAlarm');

    // Schedule the alarm
    // The 'when' property is the time in milliseconds since the epoch.
    // Ensure it's at least 1 minute from now to give the browser time to process.
    const when = Math.max(now + 60000, nextReportTime); 

    chrome.alarms.create('sendReportAlarm', { when: when });
    console.log(`Automation Scout: Report scheduled for: ${new Date(when).toLocaleString()}`);
  });
}

// Listen for alarm to send report
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sendReportAlarm') {
    console.log("Automation Scout: Time to send report!");
    sendAutomationReport(); 
  }
});

// Listen for messages from popup.js (e.g., when settings are updated)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "settingsUpdated") {
    console.log("Automation Scout: Settings updated, rescheduling report.");
    scheduleNextReport(); 
  } else if (request.type === "viewTrackedData") { // View Data from popup
    chrome.storage.local.get('trackedPages', (data) => {
      sendResponse({ data: data.trackedPages });
    });
    return true; // Indicates you will send a response asynchronously
  } else if (request.type === "clearTrackedData") { // Clear Data from popup
    chrome.storage.local.remove('trackedPages', () => {
      console.log("Automation Scout: All tracked data cleared.");
      sendResponse({ success: true });
    });
    return true; // Indicates you will send a response asynchronously
  }
});

// Initial scheduling when the service worker starts
scheduleNextReport();

// --- Helper for Smarter Suggestions ---
const COMMON_BUSINESS_APPS = [
  'salesforce.com', 'hubspot.com', 'zendesk.com', 'servicenow.com', // CRM/Support
  'jira.com', 'asana.com', 'trello.com', 'monday.com', 'clickup.com', // Project Management
  'slack.com', 'teams.microsoft.com', 'zoom.us', 'meet.google.com', // Communication/Meetings
  'mail.google.com', 'outlook.live.com', // Email
  'drive.google.com', 'docs.google.com', 'sheets.google.com', 'onedrive.live.com', // Cloud Storage/Docs
  'aws.amazon.com', 'console.cloud.google.com', 'portal.azure.com', // Cloud Consoles
  'linkedin.com/salesnavigator', 'outreach.io', 'salesloft.com' // Sales Tools
];

function getBusinessAppType(url) {
  if (url.includes('salesforce.com') || url.includes('hubspot.com')) return 'CRM';
  if (url.includes('zendesk.com') || url.includes('servicenow.com')) return 'Customer Support';
  if (url.includes('jira.com') || url.includes('asana.com') || url.includes('trello.com') || url.includes('monday.com') || url.includes('clickup.com')) return 'Project Management';
  if (url.includes('slack.com') || url.includes('teams.microsoft.com') || url.includes('zoom.us') || url.includes('meet.google.com')) return 'Communication/Meetings';
  if (url.includes('mail.google.com') || url.includes('outlook.live.com')) return 'Email/Calendar';
  if (url.includes('drive.google.com') || url.includes('docs.google.com') || url.includes('sheets.google.com') || url.includes('onedrive.live.com')) return 'Document/Cloud Storage';
  if (url.includes('aws.amazon.com') || url.includes('console.cloud.google.com') || url.includes('portal.azure.com')) return 'Cloud Console';
  if (url.includes('linkedin.com/salesnavigator') || url.includes('outreach.io') || url.includes('salesloft.com')) return 'Sales Engagement';
  // Add more specific checks if needed
  return null;
}

// --- Main Report Sending Function ---
async function sendAutomationReport() {
  console.log("Automation Scout: Preparing to send automation report...");

  const now = Date.now();
  
  let reportPeriodStart = now - REPORT_FREQUENCY_WEEKLY_MS;
  
  const settings = await new Promise(resolve => 
    chrome.storage.local.get(['userEmail', 'reportFrequency'], resolve)
  );

  const recipientEmail = settings.userEmail;
  const frequency = settings.reportFrequency || 'weekly';

  if (frequency === 'daily') {
    reportPeriodStart = now - REPORT_FREQUENCY_DAILY_MS;
  }

  if (!recipientEmail) {
    console.warn("Automation Scout: No recipient email set. Report not sent.");
    chrome.storage.local.set({ lastReportSentTime: now }, () => {
      scheduleNextReport();
    });
    return;
  }

  const data = await new Promise(resolve => 
    chrome.storage.local.get('trackedPages', resolve)
  );
  const trackedPages = data.trackedPages || {};

  const reportContent = [];
  const updatedTrackedPages = {}; 

  for (const url in trackedPages) {
    const pageData = trackedPages[url];
    const visitsInPeriod = pageData.visits.filter(
      (timestamp) => timestamp >= reportPeriodStart && timestamp <= now
    );

    if (visitsInPeriod.length > 0) {
      let suggestion = '';
      const lowerUrl = url.toLowerCase();
      const appType = getBusinessAppType(lowerUrl);
      const visitCount = visitsInPeriod.length;

      // --- Enhanced Suggestion Logic ---
      if (appType) {
          if (visitCount >= 20) {
              suggestion = `You are *heavily* using this ${appType} tool. Look for integrations, macros, or API calls to automate repetitive tasks within it (e.g., data entry, reporting, notifications).`;
          } else if (visitCount >= 10) {
              suggestion = `You frequently interact with this ${appType} tool. Consider automating recurring actions like data retrieval, updates, or communication triggers.`;
          }
      } else if (lowerUrl.includes('google.com/search') || lowerUrl.includes('bing.com/search') || lowerUrl.includes('duckduckgo.com')) {
          if (visitCount >= 15) {
              suggestion = "You're doing a lot of searching. Could you automate repetitive research queries or data gathering from search results?";
          }
      } else if (lowerUrl.includes('form') && visitCount >= 5) {
          suggestion = "You frequently fill out a form on this page. Consider using an autofill tool, browser extension, or a simple script to automate data entry.";
      } else if (lowerUrl.includes('dashboard') && visitCount >= 10) {
          suggestion = "This dashboard is a frequent stop for you. Automate data refreshes, report generation, or alerts based on key metrics.";
      } else if (lowerUrl.includes('linkedin.com/in/') && visitCount >= 8) {
          suggestion = "You're often viewing LinkedIn profiles. Consider automating data scraping, connection requests, or personalized outreach.";
      } else if (visitCount >= 25) { // Very high general frequency
          suggestion = "This page is a major hub for you. Identify common actions you take here and explore ways to streamline them with browser macros or specific integrations.";
      } else if (visitCount >= 10) { // High general frequency
          suggestion = "You visit this page quite often. Are there any routine tasks or information you consistently check that could be automated?";
      }

      reportContent.push({
        url: url,
        title: pageData.title,
        count: visitCount,
        suggestion: suggestion 
      });
    }

    pageData.visits = pageData.visits.filter(
      (timestamp) => timestamp < reportPeriodStart || now - timestamp > DATA_RETENTION_MS
    );

    if (pageData.visits.length > 0) {
      updatedTrackedPages[url] = pageData;
    }
  }

  reportContent.sort((a, b) => b.count - a.count);

  console.log("Automation Scout: Report content prepared:", reportContent);

  try {
    const response = await fetch(VERCEL_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shared-secret': EXTENSION_SHARED_SECRET
      },
      body: JSON.stringify({
        recipientEmail: recipientEmail,
        reportContent: reportContent,
        senderEmail: SENDGRID_VERIFIED_SENDER_EMAIL
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Automation Scout: Report sent successfully!', result);
      
      chrome.storage.local.set({ 
        trackedPages: updatedTrackedPages, 
        lastReportSentTime: now 
      }, () => {
        console.log("Automation Scout: Tracked data cleaned and last report time updated.");
        scheduleNextReport(); 
      });

    } else {
      const errorResult = await response.json();
      console.error('Automation Scout: Failed to send report:', response.status, errorResult);
      chrome.storage.local.set({ lastReportSentTime: now }, () => {
        scheduleNextReport();
      });
    }
  } catch (error) {
    console.error('Automation Scout: Network or unknown error sending report:', error);
    chrome.storage.local.set({ lastReportSentTime: now }, () => {
      scheduleNextReport();
    });
  }
}