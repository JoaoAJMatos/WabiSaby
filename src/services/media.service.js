const fs = require('fs');
const path = require('path');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const config = require('../config');
const { logger } = require('../utils/logger.util');

/**
 * Media Service
 * Handles downloading and processing media messages from WhatsApp
 */

/**
 * Check if a mimetype is a valid audio format
 * @param {string} mimetype - MIME type to check
 * @returns {boolean} - True if valid audio format
 */
function isValidAudioMimetype(mimetype) {
    if (!mimetype) return false;
    
    const validMimetypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/mp4',
        'audio/m4a',
        'audio/x-m4a',
        'audio/ogg',
        'audio/flac',
        'audio/x-flac',
        'audio/aac',
        'audio/webm'
    ];
    
    return validMimetypes.includes(mimetype.toLowerCase()) || mimetype.toLowerCase().startsWith('audio/');
}

/**
 * Get file extension from mimetype or filename
 * @param {string} mimetype - MIME type
 * @param {string} filename - Original filename (optional)
 * @returns {string} - File extension (with dot)
 */
function getFileExtension(mimetype, filename = null) {
    // Try to get extension from filename first
    if (filename) {
        const ext = path.extname(filename).toLowerCase();
        if (ext) return ext;
    }
    
    // Map mimetypes to extensions
    const mimetypeMap = {
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/wav': '.wav',
        'audio/x-wav': '.wav',
        'audio/wave': '.wav',
        'audio/mp4': '.m4a',
        'audio/m4a': '.m4a',
        'audio/x-m4a': '.m4a',
        'audio/ogg': '.ogg',
        'audio/flac': '.flac',
        'audio/x-flac': '.flac',
        'audio/aac': '.aac',
        'audio/webm': '.webm'
    };
    
    const lowerMimetype = mimetype?.toLowerCase();
    if (lowerMimetype && mimetypeMap[lowerMimetype]) {
        return mimetypeMap[lowerMimetype];
    }
    
    // Default to mp3 if unknown
    return '.mp3';
}

/**
 * Download media message from WhatsApp
 * @param {Object} sock - WhatsApp socket instance
 * @param {Object} msg - WhatsApp message object
 * @returns {Promise<{filePath: string, filename: string, mimetype: string}>}
 */
async function downloadMedia(sock, msg) {
    try {
        const contentType = getContentType(msg.message);
        
        if (!contentType) {
            throw new Error('Message has no content type');
        }
        
        // Get media content
        let mediaContent;
        let mimetype;
        let filename = null;
        
        if (contentType === 'audioMessage') {
            mediaContent = msg.message.audioMessage;
            mimetype = mediaContent.mimetype;
            
            // Skip PTT (push-to-talk) voice notes
            if (mediaContent.ptt) {
                throw new Error('Voice notes (PTT) are not supported. Please send audio files as documents.');
            }
        } else if (contentType === 'documentMessage') {
            mediaContent = msg.message.documentMessage;
            mimetype = mediaContent.mimetype;
            filename = mediaContent.fileName || null;
            
            // Validate it's an audio file
            if (!isValidAudioMimetype(mimetype)) {
                throw new Error(`File type ${mimetype} is not a supported audio format`);
            }
        } else {
            throw new Error(`Unsupported content type: ${contentType}`);
        }
        
        if (!mimetype || !isValidAudioMimetype(mimetype)) {
            throw new Error(`Invalid or missing audio mimetype: ${mimetype}`);
        }
        
        // Try to download media, update if missing
        let buffer;
        try {
            buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { sock }
            );
        } catch (error) {
            // Try to update media message if it's missing
            if (error.message?.includes('missing') || error.message?.includes('not found')) {
                logger.warn('Media message missing, attempting to update...');
                try {
                    const updatedMsg = await sock.updateMediaMessage(msg);
                    buffer = await downloadMediaMessage(
                        updatedMsg,
                        'buffer',
                        {},
                        { sock }
                    );
                } catch (updateError) {
                    throw new Error(`Failed to download media: ${updateError.message}`);
                }
            } else {
                throw error;
            }
        }
        
        // Generate filename
        const extension = getFileExtension(mimetype, filename);
        const baseFilename = filename 
            ? path.basename(filename, path.extname(filename))
            : 'audio';
        
        // Sanitize filename (config.getOutputPath will add timestamp and extension)
        const safeFilename = baseFilename
            .replace(/[^a-z0-9]/gi, '_')
            .substring(0, config.download.maxFilenameLength);
        
        // Get output path using config (it will add timestamp and extension)
        const outputPath = config.getOutputPath(safeFilename, extension.substring(1), true, false);
        
        // Ensure directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Write file
        fs.writeFileSync(outputPath, buffer);
        
        // Extract the actual filename from the generated path
        const actualFilename = path.basename(outputPath);
        
        logger.info(`Downloaded media file: ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
        
        return {
            filePath: outputPath,
            filename: actualFilename,
            mimetype: mimetype,
            originalFilename: filename || safeFilename
        };
    } catch (error) {
        logger.error('Error downloading media:', error);
        throw error;
    }
}

/**
 * Check if a message contains audio media
 * @param {Object} msg - WhatsApp message object
 * @returns {boolean} - True if message contains audio media
 */
function isAudioMessage(msg) {
    if (!msg || !msg.message) return false;
    
    const contentType = getContentType(msg.message);
    
    if (contentType === 'audioMessage') {
        const audioMsg = msg.message.audioMessage;
        // Skip PTT (voice notes)
        return !audioMsg?.ptt;
    }
    
    if (contentType === 'documentMessage') {
        const docMsg = msg.message.documentMessage;
        return isValidAudioMimetype(docMsg?.mimetype);
    }
    
    return false;
}

module.exports = {
    downloadMedia,
    isAudioMessage,
    isValidAudioMimetype,
    getFileExtension
};

