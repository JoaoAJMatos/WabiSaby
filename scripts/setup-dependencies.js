#!/usr/bin/env bun
/**
 * Setup Dependencies Script
 * Automatically installs yt-dlp, FFmpeg, and MPV (optional but recommended) via package managers or downloads binaries
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const readline = require('readline');
const AdmZip = require('adm-zip');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const PLATFORM = process.platform;
const IS_WINDOWS = PLATFORM === 'win32';
const IS_MACOS = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Prompt user for input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's response
 */
function askUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

/**
 * Check if running with administrator privileges (Windows only)
 * @returns {boolean} True if running as administrator
 */
function isRunningAsAdmin() {
    if (!IS_WINDOWS) {
        // On Unix systems, check if we're root
        return process.getuid && process.getuid() === 0;
    }
    
    try {
        // Try to write to a protected directory
        // This is a common way to check admin rights on Windows
        execSync('net session', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Get instructions for running with admin rights
 */
function getAdminInstructions() {
    if (IS_WINDOWS) {
        return {
            title: 'Run with Administrator Rights',
            instructions: [
                '1. Close this terminal',
                '2. Right-click on your terminal/PowerShell/Command Prompt',
                '3. Select "Run as Administrator"',
                '4. Navigate to this directory:',
                `   cd "${process.cwd()}"`,
                '5. Run: bun run setup',
                '',
                'Alternatively, you can run:',
                '   powershell -Command "Start-Process bun -ArgumentList \'run setup\' -Verb RunAs"'
            ]
        };
    } else if (IS_MACOS || IS_LINUX) {
        return {
            title: 'Run with sudo',
            instructions: [
                'Run the setup script with sudo:',
                '   sudo bun run setup',
                '',
                'Or install dependencies manually:',
                IS_MACOS 
                    ? '   brew install yt-dlp ffmpeg'
                    : '   sudo apt-get install yt-dlp ffmpeg'
            ]
        };
    }
    return null;
}

/**
 * Check if a command is available in PATH
 */
function isCommandAvailable(command) {
    try {
        if (IS_WINDOWS) {
            execSync(`where ${command}`, { stdio: 'ignore' });
        } else {
            execSync(`which ${command}`, { stdio: 'ignore' });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if binary exists in local bin directory
 */
function isLocalBinaryAvailable(binaryName) {
    const binaryPath = path.join(BIN_DIR, IS_WINDOWS ? `${binaryName}.exe` : binaryName);
    return fs.existsSync(binaryPath);
}

/**
 * Create bin directory if it doesn't exist
 */
function ensureBinDir() {
    if (!fs.existsSync(BIN_DIR)) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
        log(`Created bin directory: ${BIN_DIR}`, 'green');
    }
}

/**
 * Download a file from URL with progress
 */
function downloadFile(url, dest, showProgress = true) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle redirects
                return downloadFile(response.headers.location, dest, showProgress).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            if (showProgress && totalSize) {
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\r  Downloading... ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                });
            }
            
            response.pipe(file);
            file.on('finish', () => {
                if (showProgress && totalSize) {
                    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear progress line
                }
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
            }
            reject(err);
        });
    });
}

/**
 * Get latest yt-dlp release URL for Windows
 */
async function getYtDlpWindowsUrl() {
    try {
        const https = require('https');
        return new Promise((resolve, reject) => {
            https.get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
                headers: { 'User-Agent': 'WabiSaby-Setup' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const release = JSON.parse(data);
                        const asset = release.assets.find(a => 
                            a.name.includes('yt-dlp.exe') && !a.name.includes('min')
                        );
                        if (asset) {
                            resolve(asset.browser_download_url);
                        } else {
                            reject(new Error('yt-dlp.exe not found in latest release'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    } catch (error) {
        // Fallback URL
        return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    }
}

/**
 * Install yt-dlp
 */
async function installYtDlp() {
    log('\n📦 Checking yt-dlp...', 'cyan');
    
    // Check if already available
    if (isCommandAvailable('yt-dlp')) {
        try {
            const version = execSync('yt-dlp --version', { encoding: 'utf-8' }).trim();
            log(`✓ yt-dlp is already installed (${version})`, 'green');
            return true;
        } catch {
            // Continue with installation
        }
    }
    
    // Check local binary
    if (isLocalBinaryAvailable('yt-dlp')) {
        log('✓ yt-dlp found in local bin directory', 'green');
        return true;
    }
    
    log('Installing yt-dlp...', 'yellow');
    
    // Try package managers first
    if (IS_WINDOWS && isCommandAvailable('choco')) {
        if (!isRunningAsAdmin()) {
            log('  ⚠ Chocolatey requires admin rights', 'yellow');
            const answer = await askUser('  Do you want to (e)levate to use Chocolatey, or (d)ownload binary? [E/d]: ');
            
            if (answer === 'e' || answer === 'elevate' || answer === '') {
                log('  🔐 Attempting to elevate with admin rights...', 'blue');
                log('  ⏳ A UAC prompt will appear - please approve it', 'blue');
                try {
                    // Try to elevate using PowerShell
                    const elevateCmd = `powershell -Command "Start-Process choco -ArgumentList 'install yt-dlp -y' -Verb RunAs -Wait"`;
                    log('  📦 Installing yt-dlp via Chocolatey (this may take a minute)...', 'blue');
                    execSync(elevateCmd, { stdio: 'inherit' });
                    log('  ✓ yt-dlp installed via Chocolatey', 'green');
                    return true;
                } catch (error) {
                    log('  ✗ Elevation failed or cancelled', 'red');
                    log('  Falling back to binary download...', 'yellow');
                    // Continue to fallback
                }
            } else {
                log('  📥 Using binary download (no admin needed)...', 'blue');
                // Continue to fallback
            }
        } else {
            try {
                log('  📦 Installing via Chocolatey...', 'blue');
                execSync('choco install yt-dlp -y', { stdio: 'inherit' });
                log('  ✓ yt-dlp installed via Chocolatey', 'green');
                return true;
            } catch (error) {
                log('  ✗ Chocolatey installation failed', 'red');
                log('  Falling back to binary download...', 'yellow');
            }
        }
    }
    
    if (IS_MACOS && isCommandAvailable('brew')) {
        try {
            log('  Trying Homebrew...', 'blue');
            execSync('brew install yt-dlp', { stdio: 'inherit' });
            log('✓ yt-dlp installed via Homebrew', 'green');
            return true;
        } catch (error) {
            log('  Homebrew installation failed, trying fallback...', 'yellow');
        }
    }
    
    if (IS_LINUX) {
        // Try different package managers
        const packageManagers = [
            { cmd: 'apt-get', install: 'sudo apt-get update && sudo apt-get install -y yt-dlp' },
            { cmd: 'yum', install: 'sudo yum install -y yt-dlp' },
            { cmd: 'dnf', install: 'sudo dnf install -y yt-dlp' },
            { cmd: 'pacman', install: 'sudo pacman -S --noconfirm yt-dlp' }
        ];
        
        for (const pm of packageManagers) {
            if (isCommandAvailable(pm.cmd)) {
                try {
                    log(`  Trying ${pm.cmd}...`, 'blue');
                    execSync(pm.install, { stdio: 'inherit' });
                    log(`✓ yt-dlp installed via ${pm.cmd}`, 'green');
                    return true;
                } catch (error) {
                    log(`  ${pm.cmd} installation failed, trying next...`, 'yellow');
                }
            }
        }
    }
    
    // Fallback: Download binary
    log('  📥 Downloading yt-dlp binary...', 'blue');
    try {
        ensureBinDir();
        const binaryName = IS_WINDOWS ? 'yt-dlp.exe' : 'yt-dlp';
        const binaryPath = path.join(BIN_DIR, binaryName);
        
        let downloadUrl;
        if (IS_WINDOWS) {
            log('  🔍 Getting latest release URL...', 'blue');
            downloadUrl = await getYtDlpWindowsUrl();
        } else {
            // For Unix systems, download the standalone binary
            downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
        }
        
        log(`  📡 Downloading from: ${downloadUrl}`, 'blue');
        await downloadFile(downloadUrl, binaryPath);
        
        // Make executable on Unix systems
        if (!IS_WINDOWS) {
            log('  🔧 Making executable...', 'blue');
            fs.chmodSync(binaryPath, 0o755);
        }
        
        log(`  ✓ yt-dlp downloaded to ${binaryPath}`, 'green');
        return true;
    } catch (error) {
        log(`  ✗ Failed to download yt-dlp: ${error.message}`, 'red');
        log('  Please install manually: https://github.com/yt-dlp/yt-dlp/releases/latest', 'yellow');
        return false;
    }
}

/**
 * Install FFmpeg
 */
async function installFFmpeg() {
    log('\n📦 Checking FFmpeg...', 'cyan');
    
    // Check if already available
    if (isCommandAvailable('ffmpeg')) {
        try {
            const version = execSync('ffmpeg -version', { encoding: 'utf-8' }).split('\n')[0];
            log(`✓ FFmpeg is already installed (${version})`, 'green');
            return true;
        } catch {
            // Continue with installation
        }
    }
    
    // Check local binary
    if (isLocalBinaryAvailable('ffmpeg')) {
        log('✓ FFmpeg found in local bin directory', 'green');
        return true;
    }
    
    log('Installing FFmpeg...', 'yellow');
    
    // Try package managers first
    if (IS_WINDOWS && isCommandAvailable('choco')) {
        if (!isRunningAsAdmin()) {
            log('  ⚠ Chocolatey requires admin rights', 'yellow');
            const answer = await askUser('  Do you want to (e)levate to use Chocolatey, or (d)ownload binary? [E/d]: ');
            
            if (answer === 'e' || answer === 'elevate' || answer === '') {
                log('  🔐 Attempting to elevate with admin rights...', 'blue');
                log('  ⏳ A UAC prompt will appear - please approve it', 'blue');
                try {
                    // Try to elevate using PowerShell
                    const elevateCmd = `powershell -Command "Start-Process choco -ArgumentList 'install ffmpeg -y' -Verb RunAs -Wait"`;
                    log('  📦 Installing FFmpeg via Chocolatey (this may take a few minutes)...', 'blue');
                    execSync(elevateCmd, { stdio: 'inherit' });
                    log('  ✓ FFmpeg installed via Chocolatey', 'green');
                    return true;
                } catch (error) {
                    log('  ✗ Elevation failed or cancelled', 'red');
                    log('  Falling back to binary download...', 'yellow');
                    // Continue to fallback
                }
            } else {
                log('  📥 Using binary download (no admin needed)...', 'blue');
                // Continue to fallback
            }
        } else {
            try {
                log('  📦 Installing via Chocolatey...', 'blue');
                execSync('choco install ffmpeg -y', { stdio: 'inherit' });
                log('  ✓ FFmpeg installed via Chocolatey', 'green');
                return true;
            } catch (error) {
                log('  ✗ Chocolatey installation failed', 'red');
                log('  Falling back to binary download...', 'yellow');
            }
        }
    }
    
    if (IS_MACOS && isCommandAvailable('brew')) {
        try {
            log('  Trying Homebrew...', 'blue');
            execSync('brew install ffmpeg', { stdio: 'inherit' });
            log('✓ FFmpeg installed via Homebrew', 'green');
            return true;
        } catch (error) {
            log('  Homebrew installation failed, trying fallback...', 'yellow');
        }
    }
    
    if (IS_LINUX) {
        // Try different package managers
        const packageManagers = [
            { cmd: 'apt-get', install: 'sudo apt-get update && sudo apt-get install -y ffmpeg' },
            { cmd: 'yum', install: 'sudo yum install -y ffmpeg' },
            { cmd: 'dnf', install: 'sudo dnf install -y ffmpeg' },
            { cmd: 'pacman', install: 'sudo pacman -S --noconfirm ffmpeg' }
        ];
        
        for (const pm of packageManagers) {
            if (isCommandAvailable(pm.cmd)) {
                try {
                    log(`  Trying ${pm.cmd}...`, 'blue');
                    execSync(pm.install, { stdio: 'inherit' });
                    log(`✓ FFmpeg installed via ${pm.cmd}`, 'green');
                    return true;
                } catch (error) {
                    log(`  ${pm.cmd} installation failed, trying next...`, 'yellow');
                }
            }
        }
    }
    
    // Fallback: Download binary (Windows only - other platforms need package manager)
    if (IS_WINDOWS) {
        log('  📥 Downloading FFmpeg binary...', 'blue');
        try {
            ensureBinDir();
            
            // Download FFmpeg from gyan.dev (popular Windows builds)
            // This is a zip file, so we need to download and extract it
            const ffmpegZipPath = path.join(BIN_DIR, 'ffmpeg.zip');
            const ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
            
            log('  📡 Downloading FFmpeg archive (this may take a few minutes)...', 'blue');
            log(`  🔗 Source: ${ffmpegUrl}`, 'blue');
            await downloadFile(ffmpegUrl, ffmpegZipPath);
            
            // Extract the zip file
            log('  📦 Extracting FFmpeg archive...', 'blue');
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(ffmpegZipPath);
            
            // Find the bin directory in the zip
            const zipEntries = zip.getEntries();
            let binEntry = null;
            for (const entry of zipEntries) {
                if (entry.entryName.includes('bin/ffmpeg.exe') && !entry.isDirectory) {
                    binEntry = entry;
                    break;
                }
            }
            
            if (!binEntry) {
                throw new Error('Could not find ffmpeg.exe in downloaded archive');
            }
            
            // Extract ffmpeg.exe, ffplay.exe, and ffprobe.exe
            log('  🔧 Extracting binaries...', 'blue');
            const binaries = ['ffmpeg.exe', 'ffplay.exe', 'ffprobe.exe'];
            for (const binary of binaries) {
                const binaryEntry = zipEntries.find(e => 
                    e.entryName.includes(`bin/${binary}`) && !e.isDirectory
                );
                if (binaryEntry) {
                    const binaryPath = path.join(BIN_DIR, binary);
                    fs.writeFileSync(binaryPath, binaryEntry.getData());
                    log(`    ✓ Extracted ${binary}`, 'green');
                }
            }
            
            // Clean up zip file
            log('  🧹 Cleaning up temporary files...', 'blue');
            fs.unlinkSync(ffmpegZipPath);
            
            log('  ✓ FFmpeg downloaded to bin directory', 'green');
            return true;
        } catch (error) {
            log(`  ✗ Failed to download FFmpeg: ${error.message}`, 'red');
            log('\n  Please install FFmpeg manually:', 'yellow');
            log('    - Download from: https://www.gyan.dev/ffmpeg/builds/', 'yellow');
            log('    - Or use: choco install ffmpeg (requires admin)', 'yellow');
            return false;
        }
    } else {
        // For macOS and Linux, package manager is required
        log('✗ FFmpeg installation via package manager failed', 'red');
        log('\n  Please install FFmpeg manually:', 'yellow');
        if (IS_MACOS) {
            log('    - Run: brew install ffmpeg', 'yellow');
        } else {
            log('    - Run: sudo apt-get install ffmpeg (or equivalent for your distro)', 'yellow');
        }
        return false;
    }
}

/**
 * Install MPV (optional but recommended for seamless audio effects)
 */
async function installMPV() {
    log('\n📦 Checking MPV (recommended for seamless effects)...', 'cyan');
    
    // Check if already available
    if (isCommandAvailable('mpv')) {
        try {
            const version = execSync('mpv --version', { encoding: 'utf-8' }).split('\n')[0];
            log(`✓ MPV is already installed (${version})`, 'green');
            log('  🎵 You\'ll have seamless audio effect changes!', 'green');
            return true;
        } catch {
            // Continue with installation
        }
    }
    
    log('  ℹ MPV enables seamless audio effect changes (no interruptions)', 'blue');
    log('  ℹ Without MPV, effect changes may cause brief audio gaps', 'blue');
    
    const answer = await askUser('  Do you want to install MPV? [Y/n]: ');
    if (answer === 'n' || answer === 'no') {
        log('  ⏭ Skipping MPV installation (ffplay will be used as fallback)', 'yellow');
        return false;
    }
    
    log('Installing MPV...', 'yellow');
    
    // Try package managers
    if (IS_WINDOWS && isCommandAvailable('choco')) {
        if (!isRunningAsAdmin()) {
            log('  ⚠ Chocolatey requires admin rights', 'yellow');
            log('  ⏭ Skipping MPV (you can install manually: choco install mpv)', 'yellow');
            return false;
        }
        try {
            log('  📦 Installing via Chocolatey...', 'blue');
            execSync('choco install mpv -y', { stdio: 'inherit' });
            log('  ✓ MPV installed via Chocolatey', 'green');
            log('  🎵 You\'ll have seamless audio effect changes!', 'green');
            return true;
        } catch (error) {
            log('  ✗ Chocolatey installation failed', 'red');
        }
    }
    
    if (IS_MACOS && isCommandAvailable('brew')) {
        try {
            log('  Trying Homebrew...', 'blue');
            execSync('brew install mpv', { stdio: 'inherit' });
            log('✓ MPV installed via Homebrew', 'green');
            log('  🎵 You\'ll have seamless audio effect changes!', 'green');
            return true;
        } catch (error) {
            log('  Homebrew installation failed', 'yellow');
        }
    }
    
    if (IS_LINUX) {
        const packageManagers = [
            { cmd: 'apt-get', install: 'sudo apt-get update && sudo apt-get install -y mpv' },
            { cmd: 'yum', install: 'sudo yum install -y mpv' },
            { cmd: 'dnf', install: 'sudo dnf install -y mpv' },
            { cmd: 'pacman', install: 'sudo pacman -S --noconfirm mpv' }
        ];
        
        for (const pm of packageManagers) {
            if (isCommandAvailable(pm.cmd)) {
                try {
                    log(`  Trying ${pm.cmd}...`, 'blue');
                    execSync(pm.install, { stdio: 'inherit' });
                    log(`✓ MPV installed via ${pm.cmd}`, 'green');
                    log('  🎵 You\'ll have seamless audio effect changes!', 'green');
                    return true;
                } catch (error) {
                    log(`  ${pm.cmd} installation failed, trying next...`, 'yellow');
                }
            }
        }
    }
    
    log('  ⚠ MPV installation failed or not available', 'yellow');
    log('  ℹ ffplay (from FFmpeg) will be used as fallback', 'blue');
    log('  ℹ You can install MPV manually later for better experience', 'blue');
    if (IS_MACOS) {
        log('    Run: brew install mpv', 'yellow');
    } else if (IS_LINUX) {
        log('    Run: sudo apt-get install mpv (or equivalent)', 'yellow');
    } else if (IS_WINDOWS) {
        log('    Run: choco install mpv (requires admin)', 'yellow');
    }
    return false;
}

/**
 * Main setup function
 */
async function main() {
    log('🚀 WabiSaby Dependency Setup', 'cyan');
    log('============================\n', 'cyan');
    
    // Check admin rights and provide info
    if (IS_WINDOWS && isCommandAvailable('choco') && !isRunningAsAdmin()) {
        log('ℹ Note: Running without admin rights', 'blue');
        log('  Package manager (Chocolatey) requires admin rights', 'blue');
        log('  You\'ll be prompted to choose: elevate for Chocolatey or download binaries\n', 'blue');
    }
    
    const results = {
        ytDlp: false,
        ffmpeg: false,
        mpv: false  // Optional but recommended
    };
    
    try {
        results.ytDlp = await installYtDlp();
        results.ffmpeg = await installFFmpeg();
        results.mpv = await installMPV();  // Optional, won't fail setup
        
        log('\n============================', 'cyan');
        if (results.ytDlp && results.ffmpeg) {
            log('✓ All required dependencies installed successfully!', 'green');
            if (results.mpv) {
                log('✓ MPV installed - seamless audio effects enabled!', 'green');
            } else {
                log('ℹ MPV not installed - using ffplay (effect changes may have brief gaps)', 'yellow');
                log('  Install MPV later for seamless effects: see docs/adr/001-audio-player-backend.md', 'yellow');
            }
            process.exit(0);
        } else {
            log('⚠ Some dependencies may need manual installation', 'yellow');
            if (!results.ytDlp) {
                log('  - yt-dlp: Not installed', 'red');
            }
            if (!results.ffmpeg) {
                log('  - FFmpeg: Not installed', 'red');
            }
            
            // Provide admin instructions if needed
            if (IS_WINDOWS && isCommandAvailable('choco') && !isRunningAsAdmin()) {
                const adminInfo = getAdminInstructions();
                if (adminInfo) {
                    log(`\n💡 ${adminInfo.title}:`, 'cyan');
                    adminInfo.instructions.forEach(instruction => {
                        log(`  ${instruction}`, 'yellow');
                    });
                }
            }
            
            log('\n  See README.md for manual installation instructions', 'yellow');
            process.exit(1);
        }
    } catch (error) {
        log(`\n✗ Setup failed: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { installYtDlp, installFFmpeg, installMPV };

