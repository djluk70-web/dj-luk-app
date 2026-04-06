// DJ LUK Telegram Mini App - Main Application

// RSS feed URL
const RSS_BASE = 'https://flat.audio/dj_luk/feed.rss';

// Custom CORS proxy URL (deploy your own on Cloudflare Workers - see proxy/worker.js)
// Leave empty to try direct fetch first
const CUSTOM_PROXY = 'https://dj-luk-rss-prox.djluk70.workers.dev/';

// State
const state = {
    tracks: [],
    filteredTracks: [],
    currentTrack: null,
    isPlaying: false,
    audio: new Audio(),
    searchQuery: '',
    sortBy: 'date-desc'
};

// DOM Elements
const elements = {
    trackList: document.getElementById('trackList'),
    loading: document.getElementById('loading'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    sortSelect: document.getElementById('sortSelect'),
    player: document.getElementById('player'),
    playerTitle: document.getElementById('playerTitle'),
    playerStyle: document.getElementById('playerStyle'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    playIcon: document.getElementById('playIcon'),
    pauseIcon: document.getElementById('pauseIcon'),
    progressBar: document.getElementById('progressBar'),
    currentTime: document.getElementById('currentTime'),
    duration: document.getElementById('duration'),
    modal: document.getElementById('descriptionModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalDescription: document.getElementById('modalDescription'),
    closeModal: document.getElementById('closeModal')
};

// Initialize Telegram Web App
function initTelegramApp() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
        
        // Apply Telegram theme
        const theme = tg.themeParams;
        if (theme.bg_color) document.documentElement.style.setProperty('--tg-theme-bg-color', theme.bg_color);
        if (theme.text_color) document.documentElement.style.setProperty('--tg-theme-text-color', theme.text_color);
        if (theme.hint_color) document.documentElement.style.setProperty('--tg-theme-hint-color', theme.hint_color);
        if (theme.link_color) document.documentElement.style.setProperty('--tg-theme-link-color', theme.link_color);
        if (theme.button_color) document.documentElement.style.setProperty('--tg-theme-button-color', theme.button_color);
        if (theme.button_text_color) document.documentElement.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
        if (theme.secondary_bg_color) document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
    }
}

// Parse RSS XML
function parseRSS(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const items = xml.querySelectorAll('item');
    const tracks = [];
    
    items.forEach((item, index) => {
        const title = item.querySelector('title')?.textContent || 'Без названия';
        const description = item.querySelector('description')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const enclosure = item.querySelector('enclosure');
        const audioUrl = enclosure?.getAttribute('url') || '';
        
        // Get category/style
        const categories = item.querySelectorAll('category');
        const style = categories.length > 0 ? categories[0].textContent : '';
        
        // Try to get iTunes category
        const itunesCategory = item.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', 'category')[0];
        const finalStyle = itunesCategory?.getAttribute('text') || style;
        
        tracks.push({
            id: index,
            title: cleanTitle(title),
            description: cleanHTML(description),
            audioUrl,
            pubDate: pubDate ? new Date(pubDate) : new Date(0),
            style: finalStyle
        });
    });
    
    return tracks;
}

// Clean title from extra info
function cleanTitle(title) {
    // Remove common prefixes/suffixes
    return title
        .replace(/DJ LUK\s*[-–—:]\s*/i, '')
        .replace(/\s*\|.*$/g, '')
        .trim();
}

// Clean HTML from description
function cleanHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

// Fetch and parse RSS
async function fetchTracks() {
    let lastError = null;
    
    // Try custom proxy first (if configured)
    if (CUSTOM_PROXY) {
        try {
            const url = CUSTOM_PROXY + (CUSTOM_PROXY.includes('?') ? '' : '?url=') + encodeURIComponent(RSS_BASE);
            console.log('Trying custom proxy:', CUSTOM_PROXY);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            if (!text.includes('<rss') && !text.includes('<channel')) {
                throw new Error('Invalid RSS response');
            }
            state.tracks = parseRSS(text);
            if (state.tracks.length > 0) {
                console.log(`Loaded ${state.tracks.length} tracks via custom proxy`);
                applyFiltersAndSort();
                return;
            }
        } catch (error) {
            console.warn('Custom proxy failed:', error.message);
            lastError = error;
        }
    }
    
    // Try direct fetch (might work if flat.audio has CORS headers)
    try {
        console.log('Trying direct RSS fetch...');
        const response = await fetch(RSS_BASE, {
            headers: { 'Accept': 'application/xml, text/xml, */*' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (!text.includes('<rss') && !text.includes('<channel')) {
            throw new Error('Invalid RSS response');
        }
        state.tracks = parseRSS(text);
        if (state.tracks.length > 0) {
            console.log(`Loaded ${state.tracks.length} tracks directly`);
            applyFiltersAndSort();
            return;
        }
    } catch (error) {
        console.warn('Direct fetch failed:', error.message);
        lastError = error;
    }
    
    // All methods failed - show diagnostic info
    console.error('All RSS fetch methods failed:', lastError);
    showError(
        'Не удалось загрузить RSS. ' +
        'Для решения разверните CORS-прокси на Cloudflare Workers (бесплатно): ' +
        'инструкция в файле PROXY-SETUP.md'
    );
}

// Show error message
function showError(message) {
    elements.trackList.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <p>${message}</p>
        </div>
    `;
}

// Apply filters and sorting
function applyFiltersAndSort() {
    let tracks = [...state.tracks];
    
    // Apply search filter
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        tracks = tracks.filter(track => 
            track.title.toLowerCase().includes(query) || 
            track.style.toLowerCase().includes(query)
        );
    }
    
    // Apply sorting
    switch (state.sortBy) {
        case 'date-desc':
            tracks.sort((a, b) => b.pubDate - a.pubDate);
            break;
        case 'date-asc':
            tracks.sort((a, b) => a.pubDate - b.pubDate);
            break;
        case 'title-asc':
            tracks.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
            break;
        case 'title-desc':
            tracks.sort((a, b) => b.title.localeCompare(a.title, 'ru'));
            break;
    }
    
    state.filteredTracks = tracks;
    renderTrackList();
}

// Render track list
function renderTrackList() {
    if (state.filteredTracks.length === 0) {
        elements.trackList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎵</div>
                <p>${state.searchQuery ? 'Ничего не найдено' : 'Треки не найдены'}</p>
            </div>
        `;
        return;
    }
    
    elements.trackList.innerHTML = state.filteredTracks.map(track => `
        <div class="track-item ${state.currentTrack?.id === track.id ? 'playing' : ''}" data-id="${track.id}">
            <div class="track-info">
                <div class="track-title">${escapeHtml(track.title)}</div>
                ${track.style ? `<div class="track-style">${escapeHtml(track.style)}</div>` : ''}
            </div>
            <div class="track-actions">
                <button class="track-play-btn" onclick="playTrack(${track.id})">
                    ${state.currentTrack?.id === track.id && state.isPlaying ? '⏸' : '▶'}
                </button>
                <button class="track-desc-btn" onclick="showDescription(${track.id})">Описание</button>
            </div>
        </div>
    `).join('');
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Play track
function playTrack(id) {
    const track = state.tracks.find(t => t.id === id);
    if (!track || !track.audioUrl) return;
    
    if (state.currentTrack?.id === id) {
        // Toggle play/pause
        if (state.isPlaying) {
            pauseAudio();
        } else {
            resumeAudio();
        }
    } else {
        // Play new track
        state.currentTrack = track;
        state.audio.src = track.audioUrl;
        state.audio.play();
        state.isPlaying = true;
        updatePlayerUI();
        renderTrackList();
    }
}

// Pause audio
function pauseAudio() {
    state.audio.pause();
    state.isPlaying = false;
    updatePlayerUI();
    renderTrackList();
}

// Resume audio
function resumeAudio() {
    state.audio.play();
    state.isPlaying = true;
    updatePlayerUI();
    renderTrackList();
}

// Update player UI
function updatePlayerUI() {
    if (!state.currentTrack) {
        elements.player.style.display = 'none';
        return;
    }
    
    elements.player.style.display = 'block';
    elements.playerTitle.textContent = state.currentTrack.title;
    elements.playerStyle.textContent = state.currentTrack.style;
    
    // Update play/pause icon
    if (state.isPlaying) {
        elements.playIcon.style.display = 'none';
        elements.pauseIcon.style.display = 'block';
    } else {
        elements.playIcon.style.display = 'block';
        elements.pauseIcon.style.display = 'none';
    }
}

// Show description modal
function showDescription(id) {
    const track = state.tracks.find(t => t.id === id);
    if (!track) return;
    
    elements.modalTitle.textContent = track.title;
    elements.modalDescription.textContent = track.description || 'Описание отсутствует';
    elements.modal.style.display = 'flex';
}

// Hide description modal
function hideDescription() {
    elements.modal.style.display = 'none';
}

// Format time
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Event Listeners
function setupEventListeners() {
    // Search
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        elements.clearSearch.style.display = state.searchQuery ? 'block' : 'none';
        applyFiltersAndSort();
    });
    
    // Clear search
    elements.clearSearch.addEventListener('click', () => {
        state.searchQuery = '';
        elements.searchInput.value = '';
        elements.clearSearch.style.display = 'none';
        applyFiltersAndSort();
    });
    
    // Sort
    elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        localStorage.setItem('djLukSortBy', state.sortBy);
        applyFiltersAndSort();
    });
    
    // Play/Pause button
    elements.playPauseBtn.addEventListener('click', () => {
        if (state.currentTrack) {
            if (state.isPlaying) {
                pauseAudio();
            } else {
                resumeAudio();
            }
        }
    });
    
    // Progress bar
    elements.progressBar.addEventListener('input', (e) => {
        const time = (e.target.value / 100) * state.audio.duration;
        state.audio.currentTime = time;
    });
    
    // Close modal
    elements.closeModal.addEventListener('click', hideDescription);
    elements.modal.querySelector('.modal-backdrop').addEventListener('click', hideDescription);
    
    // Audio events
    state.audio.addEventListener('timeupdate', () => {
        const current = state.audio.currentTime;
        const duration = state.audio.duration;
        elements.currentTime.textContent = formatTime(current);
        elements.duration.textContent = formatTime(duration);
        elements.progressBar.value = duration ? (current / duration) * 100 : 0;
    });
    
    state.audio.addEventListener('ended', () => {
        state.isPlaying = false;
        updatePlayerUI();
        renderTrackList();
    });
    
    state.audio.addEventListener('error', () => {
        console.error('Audio playback error');
        state.isPlaying = false;
        updatePlayerUI();
    });
}

// Load saved preferences
function loadPreferences() {
    const savedSort = localStorage.getItem('djLukSortBy');
    if (savedSort) {
        state.sortBy = savedSort;
        elements.sortSelect.value = savedSort;
    }
}

// Initialize app
async function init() {
    initTelegramApp();
    loadPreferences();
    setupEventListeners();
    await fetchTracks();
}

// Make functions available globally for onclick handlers
window.playTrack = playTrack;
window.showDescription = showDescription;

// Start the app
init();
