const logsDiv = document.getElementById('logs');
const statusDiv = document.getElementById('status');

function addLog(message, type = 'log') {
    const logEntry = document.createElement('div');
    logEntry.className = `log ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsDiv.appendChild(logEntry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
    console.log(message);
}

function updateStatus(message, type = 'log') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

document.getElementById('clear-btn').addEventListener('click', () => {
    logsDiv.innerHTML = '';
    updateStatus('Logs cleared');
});

document.getElementById('test-btn').addEventListener('click', async () => {
    updateStatus('Testing FFmpeg via offscreen document...', 'warning');
    addLog('=== Starting Offscreen FFmpeg Test ===');
    
    try {
        // Check if we're in extension context
        if (typeof chrome === 'undefined' || !chrome.runtime) {
            throw new Error('Not running in Chrome extension context. Load this as part of the extension.');
        }

        addLog('✓ Running in Chrome extension context');

        // Test if offscreen document exists
        addLog('Checking for offscreen document...');
        const contexts = await chrome.runtime.getContexts({
            contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
        });
        
        if (contexts.length === 0) {
            addLog('No offscreen document found, creating one...');
            
            try {
                await chrome.offscreen.createDocument({
                    url: chrome.runtime.getURL('offscreen.html'),
                    reasons: [chrome.offscreen.Reason.BLOBS],
                    justification: 'FFmpeg processing for media files'
                });
                addLog('✓ Offscreen document created successfully', 'success');
            } catch (createError) {
                addLog(`✗ Failed to create offscreen document: ${createError.message}`, 'error');
                throw createError;
            }
        } else {
            addLog('✓ Offscreen document already exists', 'success');
        }

        // Wait a moment for offscreen document to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Set up message listener for FFmpeg status updates
        const messagePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                chrome.runtime.onMessage.removeListener(messageListener);
                reject(new Error('FFmpeg test timed out after 60 seconds'));
            }, 60000);

            const messageListener = (message, sender) => {
                if (message.type === 'ffmpegStatusOffscreen') {
                    const { payload } = message;
                    addLog(`[Offscreen] ${payload.status}`, payload.progress === 'error' ? 'error' : 'log');
                    
                    if (payload.progress === 'complete') {
                        clearTimeout(timeout);
                        chrome.runtime.onMessage.removeListener(messageListener);
                        addLog('✓ FFmpeg loaded successfully in offscreen document!', 'success');
                        resolve();
                    } else if (payload.progress === 'error') {
                        clearTimeout(timeout);
                        chrome.runtime.onMessage.removeListener(messageListener);
                        reject(new Error(`FFmpeg load failed: ${payload.error || payload.status}`));
                    }
                }
            };

            chrome.runtime.onMessage.addListener(messageListener);
        });

        // Send message to load FFmpeg in offscreen document
        addLog('Requesting FFmpeg load in offscreen document...');
        chrome.runtime.sendMessage({
            target: 'offscreen-ffmpeg',
            type: 'loadFFmpegOffscreen'
        });

        // Wait for FFmpeg to load
        await messagePromise;

        // Test basic FFmpeg operation
        addLog('Testing basic FFmpeg operation...');
        updateStatus('Testing FFmpeg operation...', 'warning');

        const operationPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('FFmpeg operation timed out'));
            }, 30000);

            // Send a simple test command
            chrome.runtime.sendMessage({
                target: 'offscreen-ffmpeg',
                type: 'runFFmpeg',
                payload: {
                    operationId: Date.now(),
                    command: ['-version'],
                    outputFileName: 'version.txt'
                }
            }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (response && response.success === false) {
                    reject(new Error(response.error || 'FFmpeg operation failed'));
                } else {
                    addLog('✓ FFmpeg -version command executed successfully', 'success');
                    resolve(response);
                }
            });
        });

        await operationPromise;

        addLog('=== All Tests Passed! ===', 'success');
        updateStatus('All tests passed! FFmpeg is working correctly via offscreen document.', 'success');

    } catch (error) {
        addLog(`✗ Error: ${error.message}`, 'error');
        updateStatus(`Test failed: ${error.message}`, 'error');
        console.error(error);
    }
}); 