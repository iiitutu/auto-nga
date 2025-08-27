// popup.js
document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyButton = document.getElementById('save-key');
    const statusDiv = document.getElementById('status');
    
    // Load saved API key
    chrome.storage.local.get(['ngaApiKey'], function(result) {
        if (result.ngaApiKey) {
            apiKeyInput.value = result.ngaApiKey;
        }
    });
    
    // Save API key
    saveKeyButton.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ngaApiKey: apiKey}, function() {
                statusDiv.textContent = 'API key saved successfully!';
                statusDiv.style.color = 'green';
                // Clear status after 2 seconds
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 2000);
            });
        } else {
            statusDiv.textContent = 'Please enter a valid API key.';
            statusDiv.style.color = 'red';
        }
    });
});