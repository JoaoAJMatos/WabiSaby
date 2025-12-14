const play = require('play-dl');
const { logger } = require('../utils/logger');
const { searchYouTubeAPI, isConfigured: isYouTubeAPIConfigured, hasQuotaAvailable } = require('./youtube-api.service');
const { CacheManager } = require('../utils/cache.util');
const { isRateLimitError, createRateLimitError } = require('../utils/rate-limit.util');
const { normalizeString, wordsInOrder } = require('../utils/string.util');

/**
 * Search Service
 * Handles YouTube search functionality with API and play-dl fallback
 */

// Search cache for reducing API calls
const searchCache = new CacheManager({ ttl: 5 * 60 * 1000, maxSize: 100 }); // 5 minutes TTL, 100 entries max

// Validation cache reference (shared with download service for URL validation)
// This will be set by the download service to avoid circular dependencies
let validationCache = null;

/**
 * Set the validation cache (called by download service during initialization)
 * @param {CacheManager} cache - Validation cache instance
 */
function setValidationCache(cache) {
    validationCache = cache;
}

/**
 * Calculate how well a YouTube result matches expected title and artist
 * Stricter requirements: 70% word match minimum, word order matters, exact match bonus
 * @param {Object} result - YouTube search result
 * @param {string} expectedTitle - Expected song title
 * @param {string} expectedArtist - Expected artist name
 * @returns {number} - Match score (higher is better)
 */
function calculateMatchScore(result, expectedTitle, expectedArtist) {
    const videoTitle = normalizeString(result.title || '');
    const channelName = normalizeString(result.channel?.name || '');
    const normalizedExpectedTitle = normalizeString(expectedTitle);
    const normalizedExpectedArtist = normalizeString(expectedArtist);
    
    let matchScore = 0;
    let titleMatchQuality = 0; // 0-1 scale
    let artistMatchQuality = 0; // 0-1 scale
    
    // Title matching - stricter requirements (70% minimum)
    if (normalizedExpectedTitle) {
        // Exact match bonus
        if (videoTitle === normalizedExpectedTitle) {
            matchScore += 200; // Exact title match
            titleMatchQuality = 1.0;
        } else if (videoTitle.includes(normalizedExpectedTitle)) {
            matchScore += 150; // Video title contains full song title
            titleMatchQuality = 1.0;
        } else {
            // Check for partial matches (each word)
            const titleWords = normalizedExpectedTitle.split(' ').filter(w => w.length > 2);
            const matchingWords = titleWords.filter(word => videoTitle.includes(word));
            
            if (titleWords.length > 0) {
                if (matchingWords.length === 0) {
                    matchScore -= 500; // Very heavy penalty for no title match
                    titleMatchQuality = 0;
                } else {
                    // Partial match - calculate quality ratio
                    titleMatchQuality = matchingWords.length / titleWords.length;
                    
                    // Word order bonus
                    const orderBonus = wordsInOrder(videoTitle, normalizedExpectedTitle) ? 30 : 0;
                    
                    // Stricter requirement: must match at least 70% of words
                    if (titleMatchQuality >= 0.7) {
                        matchScore += (titleMatchQuality * 80) + orderBonus;
                    } else if (titleMatchQuality >= 0.5) {
                        // 50-70% match: reduced credit
                        matchScore += (titleMatchQuality * 40) + (orderBonus / 2);
                    } else {
                        // Less than 50%: penalty
                        matchScore -= 300; // Heavy penalty for poor title match
                    }
                }
            }
        }
    } else {
        titleMatchQuality = 0.5; // Neutral if no expected title
    }
    
    // Artist matching - must match primary artist (stricter)
    if (normalizedExpectedArtist) {
        // Extract primary artist (first artist if multiple)
        const primaryArtist = normalizedExpectedArtist.split(',').map(a => a.trim())[0];
        const normalizedPrimaryArtist = normalizeString(primaryArtist);
        
        // Check if video title contains full artist name
        if (videoTitle.includes(normalizedPrimaryArtist)) {
            matchScore += 100; // Video title contains artist name
            artistMatchQuality = 1.0;
        } else if (channelName.includes(normalizedPrimaryArtist)) {
            matchScore += 80; // Channel name contains artist name (official channel)
            artistMatchQuality = 0.9;
        } else {
            // Check for partial artist name matches (must match significant portion)
            const artistWords = normalizedPrimaryArtist.split(' ').filter(w => w.length > 2);
            const matchingInTitle = artistWords.filter(word => videoTitle.includes(word));
            const matchingInChannel = artistWords.filter(word => channelName.includes(word));
            
            const titleMatchRatio = artistWords.length > 0 ? matchingInTitle.length / artistWords.length : 0;
            const channelMatchRatio = artistWords.length > 0 ? matchingInChannel.length / artistWords.length : 0;
            artistMatchQuality = Math.max(titleMatchRatio, channelMatchRatio);
            
            // Stricter: must match at least 70% of artist words
            if (artistMatchQuality >= 0.7) {
                matchScore += artistMatchQuality * 60;
            } else if (artistMatchQuality >= 0.5) {
                matchScore += artistMatchQuality * 30;
            } else {
                matchScore -= 400; // Very heavy penalty for poor artist match
            }
        }
    } else {
        artistMatchQuality = 0.5; // Neutral if no expected artist
    }
    
    // Additional penalty if we have both title and artist but neither matches well
    if (normalizedExpectedTitle && normalizedExpectedArtist) {
        if (titleMatchQuality < 0.3 && artistMatchQuality < 0.3) {
            matchScore -= 600; // Very heavy penalty for poor overall match
        } else if (titleMatchQuality < 0.5 && artistMatchQuality < 0.5) {
            matchScore -= 300; // Penalty for mediocre match
        }
    }
    
    return matchScore;
}

/**
 * Score a YouTube result to prefer official audio versions
 * Higher score = better match for original song
 * Stricter penalties and verification
 * @param {Object} result - YouTube search result
 * @param {string} expectedTitle - Optional expected song title for verification
 * @param {string} expectedArtist - Optional expected artist for verification
 * @returns {number} - Score (higher is better)
 */
function scoreSearchResult(result, expectedTitle = '', expectedArtist = '') {
    const title = (result.title || '').toLowerCase();
    const channelName = (result.channel?.name || '').toLowerCase();
    let score = 0;
    
    // ===== CONTENT TYPE SCORING =====
    
    // Strongly prefer "official audio" (original studio version)
    if (title.includes('official audio')) score += 350;
    else if (title.includes('audio')) score += 140;
    
    // Penalize lyric videos - they're not the original audio
    // Only give small bonus if it's an "official lyric video" (still not ideal but better than fan-made)
    if (title.includes('official lyric video')) score += 5;
    else if (title.includes('lyric video') || title.includes('lyrics video')) score -= 80;
    else if (title.includes('lyric') || title.includes('lyrics')) score -= 120;
    
    // Penalize official music videos (often have intros/outros/skits)
    if (title.includes('official music video')) score -= 200;
    if (title.includes('official video')) score -= 160;
    if (title.includes('music video')) score -= 130;
    if (title.includes('mv')) score -= 60;
    
    // Strongly penalize live/concert versions
    if (title.includes('live at') || title.includes('live from')) score -= 200;
    if (title.includes('live')) score -= 120;
    if (title.includes('concert')) score -= 150;
    if (title.includes('performance')) score -= 120;
    if (title.includes('tour')) score -= 80;
    
    // Strongly penalize remixes, covers, and alternate versions
    if (title.includes('remix')) score -= 200;
    if (title.includes('cover')) score -= 250;
    if (title.includes('acoustic')) score -= 80;
    if (title.includes('instrumental')) score -= 150;
    if (title.includes('karaoke')) score -= 300;
    if (title.includes('slowed')) score -= 200;
    if (title.includes('reverb')) score -= 160;
    if (title.includes('sped up')) score -= 200;
    if (title.includes('nightcore')) score -= 250;
    if (title.includes('8d audio')) score -= 150;
    
    // Penalize compilations and mixes
    if (title.includes('compilation')) score -= 150;
    if (title.includes('mix')) score -= 60;
    if (title.includes('mashup')) score -= 180;
    
    // Prefer verified channels (channel name matches artist)
    if (expectedArtist && channelName) {
        const normalizedExpectedArtist = normalizeString(expectedArtist.split(',')[0].trim());
        const normalizedChannelName = normalizeString(channelName);
        if (normalizedChannelName.includes(normalizedExpectedArtist) || 
            normalizedExpectedArtist.includes(normalizedChannelName)) {
            score += 50; // Bonus for official/verified channel
        }
    }
    
    // Slight preference for shorter titles (less likely to have extra info)
    score -= Math.floor(title.length / 30);
    
    // ===== VERIFICATION SCORING =====
    // Add bonus for matching expected title/artist
    if (expectedTitle || expectedArtist) {
        const matchScore = calculateMatchScore(result, expectedTitle, expectedArtist);
        score += matchScore;
        
        // Stricter verification: reject if match is poor AND no "official audio"
        const hasOfficialAudio = title.includes('official audio') || title.includes('audio');
        
        if (matchScore < -200) {
            // Very poor match - heavy penalty regardless
            score -= 300;
        } else if (matchScore < -100) {
            // Poor match - additional penalty
            score -= 200;
        } else if (matchScore < 0) {
            // Negative match - penalty, but less if it's official audio
            if (!hasOfficialAudio) {
                score -= 150; // Heavier penalty if not official audio
            } else {
                score -= 80; // Lighter penalty if official audio (might still be wrong song)
            }
        }
        
        // Reject if match is poor and no official audio indicator
        if (matchScore < -100 && !hasOfficialAudio) {
            score -= 200; // Additional rejection penalty
        }
    }
    
    return score;
}

/**
 * Execute a single YouTube search using play-dl (fallback method)
 * @param {string} query - Search query
 * @param {string} expectedTitle - Expected song title for verification
 * @param {string} expectedArtist - Expected artist for verification
 * @returns {Promise<Array>} - Scored results
 */
async function executeSearchPlayDl(query, expectedTitle, expectedArtist) {
    try {
        const searchResults = await play.search(query, { limit: 10 });
        
        if (!searchResults || searchResults.length === 0) {
            return [];
        }
        
        // Filter out playlists - only return videos
        const videoResults = searchResults.filter(result => {
            // Check cache for validation first (if available)
            if (validationCache) {
                let urlType = validationCache.get(result.url);
                if (!urlType) {
                    urlType = play.yt_validate(result.url);
                    validationCache.set(result.url, urlType);
                }
                return urlType === 'video';
            } else {
                // Fallback: validate directly if cache not available
                const urlType = play.yt_validate(result.url);
                return urlType === 'video';
            }
        });
        
        const scoredResults = videoResults.map(result => ({
            result,
            score: scoreSearchResult(result, expectedTitle, expectedArtist),
            query
        }));
        
        return scoredResults;
    } catch (error) {
        // Check for rate limit errors
        if (isRateLimitError(error)) {
            throw createRateLimitError(error); // Let it bubble up to be handled
        }
        // For other errors, return empty array
        const errorMsg = error?.message || String(error) || 'Unknown error';
        logger.warn(`[YouTube Search] play-dl search failed for "${query}": ${errorMsg}`);
        return [];
    }
}

/**
 * Execute a single YouTube search using YouTube Data API or play-dl fallback
 * @param {string} query - Search query
 * @param {string} expectedTitle - Expected song title for verification
 * @param {string} expectedArtist - Expected artist for verification
 * @param {boolean} preferAPI - Whether to prefer API over play-dl
 * @returns {Promise<Array>} - Scored results
 */
async function executeSearch(query, expectedTitle, expectedArtist, preferAPI = true) {
    // Check cache first
    const cached = searchCache.get(query);
    if (cached) {
        logger.debug(`[YouTube Search] Using cached result for: "${query}"`);
        return cached;
    }
    
    let searchResults = [];
    let usedAPI = false;
    
    // Try YouTube Data API first if configured and preferred
    if (preferAPI && isYouTubeAPIConfigured() && hasQuotaAvailable()) {
        try {
            logger.debug(`[YouTube Search] Using YouTube Data API for: "${query}"`);
            const apiResults = await searchYouTubeAPI(query, {
                expectedTitle,
                expectedArtist
            });
            
            if (apiResults && apiResults.length > 0) {
                searchResults = apiResults;
                usedAPI = true;
            }
        } catch (apiError) {
            const errorMsg = apiError?.message || String(apiError) || 'Unknown error';
            
            // If quota exceeded or API error, fallback to play-dl
            if (errorMsg.includes('quota') || errorMsg.includes('API')) {
                logger.warn(`[YouTube Search] API failed, falling back to play-dl: ${errorMsg}`);
            } else {
                logger.warn(`[YouTube Search] API error: ${errorMsg}, falling back to play-dl`);
            }
        }
    }
    
    // Fallback to play-dl if API not used or failed
    if (!usedAPI) {
        logger.debug(`[YouTube Search] Using play-dl for: "${query}"`);
        const playDlResults = await executeSearchPlayDl(query, expectedTitle, expectedArtist);
        searchResults = playDlResults;
    }
    
    // Score and cache results
    const scoredResults = searchResults.map(result => ({
        result,
        score: scoreSearchResult(result, expectedTitle, expectedArtist),
        query
    }));
    
    // Cache the results
    searchCache.set(query, scoredResults);
    
    return scoredResults;
}

/**
 * Search YouTube for a query, preferring official audio versions
 * Uses multiple query variations and verification for better accuracy
 * @param {string} query - Search query
 * @param {Object} options - Optional search options
 * @param {string} options.expectedTitle - Expected song title for verification
 * @param {string} options.expectedArtist - Expected artist for verification  
 * @param {number} options.expectedDuration - Expected duration in seconds
 * @returns {Promise<{url: string, title: string, artist: string, matchScore: number}>} - Search result
 */
async function searchYouTube(query, options = {}) {
    const { expectedTitle = '', expectedArtist = '', expectedDuration = null } = options;
    
    // Build optimized query variations for better matching
    const queries = [];
    
    // If we have structured artist/title, create multiple optimized query formats
    if (expectedArtist && expectedTitle) {
        // Extract primary artist (first one if multiple)
        const primaryArtist = expectedArtist.split(',').map(a => a.trim())[0];
        
        // Try multiple query formats (ordered by preference):
        // 1. "Artist - Title official audio" (best for finding original)
        queries.push(`${primaryArtist} - ${expectedTitle} official audio`);
        
        // 2. "Artist Title official audio" (without dash, sometimes works better)
        queries.push(`${primaryArtist} ${expectedTitle} official audio`);
        
        // 3. "Artist - Title" (fallback without "official audio")
        const dashQuery = `${primaryArtist} - ${expectedTitle}`;
        if (!queries.includes(dashQuery)) {
            queries.push(dashQuery);
        }
        
        // 4. Original query as final fallback (if different from above)
        if (!queries.includes(query)) {
            queries.push(query);
        }
    } else {
        // For unstructured queries, try with "official audio" first
        const queryWithAudio = `${query} official audio`;
        queries.push(queryWithAudio);
        
        // Always include original query as fallback
        if (!queries.includes(query)) {
            queries.push(query);
        }
    }
    
    // Determine which search method to use
    const useAPI = isYouTubeAPIConfigured() && hasQuotaAvailable();
    const searchMethod = useAPI ? 'YouTube Data API' : 'play-dl';
    logger.info(`[YouTube Search] Using ${searchMethod} for search (${queries.length} query variation(s))`);
    
    // Collect all results from all queries
    let allScoredResults = [];
    
    for (let i = 0; i < queries.length; i++) {
        const currentQuery = queries[i];
        logger.info(`[YouTube Search] Query ${i + 1}/${queries.length}: "${currentQuery}"`);
        
        try {
            const results = await executeSearch(currentQuery, expectedTitle, expectedArtist, useAPI);
            
            // If we got results, add them and check if we can stop early
            if (results && results.length > 0) {
                allScoredResults = allScoredResults.concat(results);
                
                // Only stop early if we have a very confident match
                // This prevents stopping on wrong songs that happen to have "official audio"
                const bestResult = results.reduce((best, r) => r.score > best.score ? r : best);
                if (bestResult && bestResult.score > 350) {
                    const title = (bestResult.result.title || '').toLowerCase();
                    
                    // Only stop if:
                    // 1. It's an official audio version
                    // 2. AND we have expected title/artist that match well
                    // 3. AND the score is very high (indicating good match)
                    if (title.includes('official audio')) {
                        // Check if we have verification data and it matches well
                        if (expectedTitle || expectedArtist) {
                            // Calculate match score to verify it's actually a good match
                            const matchScore = calculateMatchScore(bestResult.result, expectedTitle, expectedArtist);
                            // Only stop if match score is positive (good match)
                            if (matchScore > 50 && bestResult.score > 400) {
                                logger.info(`[YouTube Search] Found verified official audio match (score: ${bestResult.score}, match: ${matchScore}), stopping search`);
                                break;
                            }
                        } else {
                            // No verification data - be more conservative, only stop if score is very high
                            if (bestResult.score > 450) {
                                logger.info(`[YouTube Search] Found high-scoring official audio (score: ${bestResult.score}), stopping search`);
                                break;
                            }
                        }
                    } else {
                        // Not official audio - only stop if score is extremely high (very confident match)
                        if (bestResult.score > 500) {
                            logger.info(`[YouTube Search] Found excellent match (score: ${bestResult.score}), stopping search`);
                            break;
                        }
                    }
                }
            } else {
                // No results from this query - log and continue to fallback
                logger.debug(`[YouTube Search] Query "${currentQuery}" returned no results, trying fallback...`);
            }
        } catch (err) {
            // Check for rate limiting
            if (isRateLimitError(err)) {
                logger.warn(`[YouTube Search] Rate limited on query "${currentQuery}"`);
                // Re-throw rate limit errors so they can be handled upstream
                throw createRateLimitError(err);
            }
            const errorMsg = err?.message || String(err);
            logger.warn(`[YouTube Search] Query "${currentQuery}" failed: ${errorMsg}`);
            // Continue with other queries for non-rate-limit errors (fallback will be tried)
        }
    }
    
    if (allScoredResults.length === 0) {
        throw new Error('No results found on YouTube');
    }
    
    // Remove duplicates (same video URL) keeping highest score
    const uniqueResults = new Map();
    for (const item of allScoredResults) {
        const url = item.result.url;
        if (!uniqueResults.has(url) || uniqueResults.get(url).score < item.score) {
            uniqueResults.set(url, item);
        }
    }
    
    // Sort by score
    const sortedResults = Array.from(uniqueResults.values())
        .sort((a, b) => b.score - a.score);
    
    // Apply duration filtering if we have expected duration (tighter tolerance: 10s)
    let finalResults = sortedResults;
    if (expectedDuration && expectedDuration > 0) {
        const DURATION_TOLERANCE = 10; // 10 seconds tolerance (tighter)
        const durationMatched = sortedResults.filter(item => {
            const videoDuration = item.result.durationInSec || 0;
            return Math.abs(videoDuration - expectedDuration) <= DURATION_TOLERANCE;
        });
        
        if (durationMatched.length > 0) {
            logger.info(`[YouTube Search] Found ${durationMatched.length} results matching duration (~${expectedDuration}s)`);
            finalResults = durationMatched;
        }
    }
    
    // Filter out results with very poor match scores if we have expected title/artist
    // This prevents wrong songs from being selected
    if (expectedTitle || expectedArtist) {
        const MINIMUM_MATCH_SCORE = -200; // Reject results with match score below this
        const filteredResults = finalResults.filter(item => {
            const matchScore = calculateMatchScore(item.result, expectedTitle, expectedArtist);
            // Only filter out if match score is very poor AND overall score is not extremely high
            if (matchScore < MINIMUM_MATCH_SCORE && item.score < 300) {
                logger.debug(`[YouTube Search] Filtering out poor match: "${item.result.title}" (match: ${matchScore}, score: ${item.score})`);
                return false;
            }
            return true;
        });
        
        if (filteredResults.length > 0) {
            finalResults = filteredResults;
            logger.info(`[YouTube Search] Filtered to ${filteredResults.length} results with acceptable match quality`);
        } else {
            logger.warn(`[YouTube Search] All results filtered out due to poor matches, using best available`);
        }
    }
    
    // Log top results for debugging
    logger.info(`[YouTube Search] Top results:`);
    finalResults.slice(0, 5).forEach((item, i) => {
        const duration = item.result.durationInSec ? `${item.result.durationInSec}s` : '?';
        const matchScore = (expectedTitle || expectedArtist) 
            ? calculateMatchScore(item.result, expectedTitle, expectedArtist) 
            : 'N/A';
        logger.info(`  ${i + 1}. [Score: ${item.score}] [Match: ${matchScore}] [${duration}] ${item.result.title}`);
    });
    
    // ===== RESULT VERIFICATION =====
    // Verify the selected result matches expected title/artist before returning
    let bestResult = finalResults[0].result;
    let bestScore = finalResults[0].score;
    let verified = false;
    
    if (expectedTitle || expectedArtist) {
        // Check top 5 results to find one that passes verification
        const topCandidates = finalResults.slice(0, 5);
        
        for (const candidate of topCandidates) {
            const matchScore = calculateMatchScore(candidate.result, expectedTitle, expectedArtist);
            const videoTitle = normalizeString(candidate.result.title || '');
            const normalizedExpectedTitle = normalizeString(expectedTitle);
            const normalizedExpectedArtist = normalizeString(expectedArtist.split(',')[0].trim());
            
            // Verification criteria:
            // 1. Match score should be positive (or at least not very negative)
            // 2. Title should contain at least 70% of expected words
            // 3. Artist should match (if provided)
            
            let passesVerification = true;
            const verificationIssues = [];
            
            // Check title match
            if (expectedTitle) {
                const titleWords = normalizedExpectedTitle.split(' ').filter(w => w.length > 2);
                const matchingWords = titleWords.filter(word => videoTitle.includes(word));
                const titleMatchRatio = titleWords.length > 0 ? matchingWords.length / titleWords.length : 0;
                
                if (titleMatchRatio < 0.5) {
                    passesVerification = false;
                    verificationIssues.push(`title match too low (${Math.round(titleMatchRatio * 100)}%)`);
                }
            }
            
            // Check artist match
            if (expectedArtist && passesVerification) {
                const channelName = normalizeString(candidate.result.channel?.name || '');
                const videoTitleLower = videoTitle.toLowerCase();
                
                if (!videoTitleLower.includes(normalizedExpectedArtist) && 
                    !channelName.includes(normalizedExpectedArtist) &&
                    !normalizedExpectedArtist.includes(channelName)) {
                    // Artist not found - check if match score is still acceptable
                    if (matchScore < 0) {
                        passesVerification = false;
                        verificationIssues.push('artist not found and match score negative');
                    }
                }
            }
            
            // Check overall match score
            if (matchScore < -100 && passesVerification) {
                passesVerification = false;
                verificationIssues.push(`match score too low (${matchScore})`);
            }
            
            if (passesVerification) {
                bestResult = candidate.result;
                bestScore = candidate.score;
                verified = true;
                logger.info(`[YouTube Search] Verified result: "${bestResult.title}" (match: ${matchScore})`);
                break;
            } else {
                logger.debug(`[YouTube Search] Result "${candidate.result.title}" failed verification: ${verificationIssues.join(', ')}`);
            }
        }
        
        if (!verified) {
            logger.warn(`[YouTube Search] No result passed verification, using best available: "${bestResult.title}"`);
        }
    } else {
        verified = true; // No verification needed if no expected title/artist
    }
    
    logger.info(`[YouTube Search] Selected: "${bestResult.title}" (Score: ${bestScore}, Verified: ${verified})`);
    
    // Validate that the selected URL is a video, not a playlist
    // Note: This uses validationCache if available, otherwise validates directly
    let urlType = null;
    if (validationCache) {
        urlType = validationCache.get(bestResult.url);
    }
    if (!urlType) {
        urlType = play.yt_validate(bestResult.url);
        if (validationCache) {
            validationCache.set(bestResult.url, urlType);
        }
    }
    if (urlType !== 'video') {
        logger.error(`[YouTube Search] Selected URL is not a video (type: ${urlType}), skipping`);
        throw new Error('Search returned a playlist instead of a video. Please try a more specific search.');
    }
    
    // Extract artist/channel
    let artist = '';
    if (bestResult.channel) {
        artist = bestResult.channel.name || '';
    }

    return {
        url: bestResult.url,
        title: bestResult.title,
        artist: artist,
        type: bestResult.type,
        matchScore: bestScore,
        duration: bestResult.durationInSec || null
    };
}

/**
 * Clear search cache (useful when queue is cleared)
 */
function clearSearchCache() {
    searchCache.clear();
}

module.exports = {
    searchYouTube,
    setValidationCache,
    clearSearchCache
};

