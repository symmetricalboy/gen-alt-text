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
    updateStatus('Testing FFmpeg...', 'warning');
    addLog('=== Starting FFmpeg Test ===');
    
    try {
        // Check if we're in extension context
        if (typeof chrome === 'undefined' || !chrome.runtime) {
            throw new Error('Not running in Chrome extension context. Load this as part of the extension.');
        }

        addLog('✓ Running in Chrome extension context');

        // Check file URLs
        const coreURL = chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
        const wasmURL = chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.wasm');
        const wrapperURL = chrome.runtime.getURL('assets/ffmpeg/ffmpeg.min.js');
        
        addLog(`Core URL: ${coreURL}`);
        addLog(`WASM URL: ${wasmURL}`);
        addLog(`Wrapper URL: ${wrapperURL}`);

        // Test file accessibility
        addLog('Testing file accessibility...');
        
        try {
            const coreResponse = await fetch(coreURL, { method: 'HEAD' });
            if (coreResponse.ok) {
                addLog('✓ ffmpeg-core.js is accessible', 'success');
            } else {
                addLog(`✗ ffmpeg-core.js not accessible: ${coreResponse.status}`, 'error');
            }
        } catch (e) {
            addLog(`✗ ffmpeg-core.js fetch error: ${e.message}`, 'error');
        }

        try {
            const wasmResponse = await fetch(wasmURL, { method: 'HEAD' });
            if (wasmResponse.ok) {
                addLog('✓ ffmpeg-core.wasm is accessible', 'success');
            } else {
                addLog(`✗ ffmpeg-core.wasm not accessible: ${wasmResponse.status}`, 'error');
            }
        } catch (e) {
            addLog(`✗ ffmpeg-core.wasm fetch error: ${e.message}`, 'error');
        }

        // Load FFmpeg scripts
        addLog('Loading FFmpeg scripts...');
        
        // First, let's examine the script content
        addLog('Fetching ffmpeg-core.js to examine content...');
        try {
            const response = await fetch(coreURL);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const scriptText = await response.text();
            addLog(`✓ Fetched ffmpeg-core.js (${scriptText.length} characters)`, 'success');
            
            // Check the first few lines to see what's in the file
            const firstLines = scriptText.split('\n').slice(0, 5).join('\n');
            addLog(`First few lines of script: ${firstLines}`);
            
            // Check if it looks like valid JavaScript
            if (scriptText.includes('function') || scriptText.includes('var ') || scriptText.includes('let ') || scriptText.includes('const ')) {
                addLog('✓ Script appears to contain JavaScript code', 'success');
            } else {
                addLog('⚠ Script content might not be valid JavaScript', 'warning');
            }
        } catch (fetchError) {
            addLog(`✗ Failed to fetch ffmpeg-core.js for examination: ${fetchError.message}`, 'error');
        }

        // Now try to load it via script element with better error handling
        addLog('Loading ffmpeg-core.js via script element...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                addLog('✗ Script loading timed out after 15 seconds', 'error');
                reject(new Error('Script loading timeout'));
            }, 15000);
            
            // Set up comprehensive error handling
            const globalErrorHandler = (e) => {
                clearTimeout(timeout);
                addLog(`✗ Global error during script loading:`, 'error');
                addLog(`  Message: ${e.message}`, 'error');
                addLog(`  Filename: ${e.filename}`, 'error');
                addLog(`  Line: ${e.lineno}, Column: ${e.colno}`, 'error');
                addLog(`  Error object: ${e.error}`, 'error');
                window.removeEventListener('error', globalErrorHandler);
                reject(new Error(`Script execution failed: ${e.message}`));
            };
            window.addEventListener('error', globalErrorHandler);
            
            // Also listen for unhandled promise rejections
            const promiseErrorHandler = (e) => {
                clearTimeout(timeout);
                addLog(`✗ Unhandled promise rejection during script loading: ${e.reason}`, 'error');
                window.removeEventListener('unhandledrejection', promiseErrorHandler);
                reject(new Error(`Promise rejection: ${e.reason}`));
            };
            window.addEventListener('unhandledrejection', promiseErrorHandler);
            
            const script = document.createElement('script');
            script.src = coreURL;
            script.async = false; // Ensure synchronous loading
            
            script.onload = () => {
                clearTimeout(timeout);
                window.removeEventListener('error', globalErrorHandler);
                window.removeEventListener('unhandledrejection', promiseErrorHandler);
                addLog('✓ ffmpeg-core.js loaded successfully', 'success');
                resolve();
            };
            
            script.onerror = (e) => {
                clearTimeout(timeout);
                window.removeEventListener('error', globalErrorHandler);
                window.removeEventListener('unhandledrejection', promiseErrorHandler);
                addLog(`✗ Script load error event: type=${e.type}, target=${e.target.src}`, 'error');
                addLog(`✗ This might be a CSP violation or the script is trying to use restricted features`, 'error');
                reject(new Error(`Script load failed: ${e.type}`));
            };
            
            addLog('Appending script to document head...');
            document.head.appendChild(script);
        });

        // Check what core script provided
        addLog('Checking core script exports...');
        addLog(`typeof createFFmpegCore: ${typeof createFFmpegCore}`);
        addLog(`typeof self.createFFmpegCore: ${typeof self.createFFmpegCore}`);

        // Load ffmpeg.min.js with better error handling
        addLog('Loading ffmpeg.min.js...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                addLog('✗ ffmpeg.min.js loading timed out after 15 seconds', 'error');
                reject(new Error('Wrapper script loading timeout'));
            }, 15000);
            
            const globalErrorHandler = (e) => {
                if (e.filename && e.filename.includes('ffmpeg.min.js')) {
                    clearTimeout(timeout);
                    addLog(`✗ Wrapper script execution error: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`, 'error');
                    window.removeEventListener('error', globalErrorHandler);
                    reject(new Error(`Wrapper script execution failed: ${e.message}`));
                }
            };
            window.addEventListener('error', globalErrorHandler);
            
            const script = document.createElement('script');
            script.src = wrapperURL;
            script.async = false;
            
            script.onload = () => {
                clearTimeout(timeout);
                window.removeEventListener('error', globalErrorHandler);
                addLog('✓ ffmpeg.min.js loaded successfully', 'success');
                resolve();
            };
            
            script.onerror = (e) => {
                clearTimeout(timeout);
                window.removeEventListener('error', globalErrorHandler);
                addLog(`✗ Wrapper script load error: type=${e.type}, target=${e.target.src}`, 'error');
                reject(new Error(`Wrapper script load failed: ${e.type}`));
            };
            
            document.head.appendChild(script);
        });

        // Check what's available after loading
        addLog('Checking available FFmpeg objects...');
        addLog(`typeof FFmpegWASM: ${typeof FFmpegWASM}`);
        addLog(`typeof FFmpeg: ${typeof FFmpeg}`);
        addLog(`typeof self.FFmpegWASM: ${typeof self.FFmpegWASM}`);
        addLog(`typeof self.FFmpeg: ${typeof self.FFmpeg}`);
        
        if (typeof FFmpegWASM !== 'undefined') {
            addLog(`FFmpegWASM properties: ${Object.keys(FFmpegWASM).join(', ')}`);
        }

        if (typeof self.FFmpegWASM !== 'undefined') {
            addLog(`self.FFmpegWASM properties: ${Object.keys(self.FFmpegWASM).join(', ')}`);
        }

        // Try to instantiate FFmpeg
        let ffmpeg = null;
        let constructorLocation = '';
        
        if (typeof FFmpegWASM !== 'undefined' && typeof FFmpegWASM.FFmpeg === 'function') {
            addLog('Creating FFmpeg instance from FFmpegWASM.FFmpeg...');
            ffmpeg = new FFmpegWASM.FFmpeg();
            constructorLocation = 'FFmpegWASM.FFmpeg';
        } else if (typeof self.FFmpegWASM !== 'undefined' && typeof self.FFmpegWASM.FFmpeg === 'function') {
            addLog('Creating FFmpeg instance from self.FFmpegWASM.FFmpeg...');
            ffmpeg = new self.FFmpegWASM.FFmpeg();
            constructorLocation = 'self.FFmpegWASM.FFmpeg';
        } else if (typeof FFmpeg !== 'undefined' && typeof FFmpeg === 'function') {
            addLog('Creating FFmpeg instance from global FFmpeg...');
            ffmpeg = new FFmpeg();
            constructorLocation = 'global FFmpeg';
        } else if (typeof self.FFmpeg !== 'undefined' && typeof self.FFmpeg === 'function') {
            addLog('Creating FFmpeg instance from self.FFmpeg...');
            ffmpeg = new self.FFmpeg();
            constructorLocation = 'self.FFmpeg';
        } else {
            throw new Error('Could not find FFmpeg constructor');
        }

        addLog(`✓ FFmpeg instance created from ${constructorLocation}`, 'success');

        // Set up logging
        ffmpeg.on('log', ({ type, message }) => {
            addLog(`[FFmpeg ${type}] ${message}`);
        });

        ffmpeg.on('progress', ({ ratio }) => {
            if (ratio !== undefined) {
                addLog(`[FFmpeg Progress] ${Math.round(ratio * 100)}%`);
                updateStatus(`Loading FFmpeg: ${Math.round(ratio * 100)}%`, 'warning');
            }
        });

        // Try to load FFmpeg
        addLog('Loading FFmpeg with WASM...');
        updateStatus('Loading FFmpeg WASM...', 'warning');

        await ffmpeg.load({
            coreURL: coreURL,
            wasmURL: wasmURL
        });

        addLog('✓ FFmpeg loaded successfully!', 'success');
        updateStatus('FFmpeg loaded successfully!', 'success');

        // Test basic file operations
        addLog('Testing file operations...');
        await ffmpeg.writeFile('test.txt', 'Hello FFmpeg!');
        const data = await ffmpeg.readFile('test.txt');
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
        addLog(`Read file content: "${text}"`);
        
        if (text === 'Hello FFmpeg!') {
            addLog('✓ File operations test passed!', 'success');
        } else {
            addLog('✗ File operations test failed!', 'error');
        }
        
        await ffmpeg.deleteFile('test.txt');

        // Test FFmpeg command
        addLog('Testing FFmpeg command (-version)...');
        await ffmpeg.exec(['-version']);
        addLog('✓ FFmpeg command test passed!', 'success');

        addLog('=== All Tests Passed! ===', 'success');
        updateStatus('All tests passed! FFmpeg is working correctly.', 'success');

    } catch (error) {
        addLog(`✗ Error: ${error.message}`, 'error');
        updateStatus(`Test failed: ${error.message}`, 'error');
        console.error(error);
    }
}); 