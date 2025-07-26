// popup.js - This script handles the UI and logic for the extension's popup.

document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('emailInput');
  const frequencySelect = document.getElementById('frequencySelect');
  const saveButton = document.getElementById('saveSettingsButton');
  const statusMessage = document.getElementById('statusMessage');

  // Load saved settings when the popup opens
  chrome.storage.local.get(['userEmail', 'reportFrequency'], (result) => {
    if (result.userEmail) {
      emailInput.value = result.userEmail;
    }
    if (result.reportFrequency) {
      frequencySelect.value = result.reportFrequency;
    }
  });

  // Save settings when the button is clicked
  saveButton.addEventListener('click', () => {
    const userEmail = emailInput.value.trim();
    const reportFrequency = frequencySelect.value;

    if (!userEmail) {
      statusMessage.textContent = 'Please enter a valid email address.';
      statusMessage.classList.remove('success');
      return;
    }

    // Save to Chrome local storage
    chrome.storage.local.set({ userEmail, reportFrequency }, () => {
      statusMessage.textContent = 'Settings saved successfully!';
      statusMessage.classList.add('success');
      console.log('Settings saved:', { userEmail, reportFrequency });

      // Send a message to the background script to update its scheduling logic
      chrome.runtime.sendMessage({ type: "settingsUpdated" });
    });
  });
});