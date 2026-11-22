'use strict';

(() => {
  let timer = null;
  let lastPlaying = null;

  const textOf = el => el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';

  function getTitle() {
    for (const selector of [
      'ytmusic-player-bar .title',
      'ytmusic-player-bar .content-info-wrapper .title',
      'ytmusic-player-bar [class*="title"]'
    ]) {
      const value = textOf(document.querySelector(selector));
      if (value && !/YouTube Music$/i.test(value)) return value;
    }
    return (document.title || '').replace(/\s*-\s*YouTube Music\s*$/i, '').trim();
  }

  function getBylineParts() {
    const bar = document.querySelector('ytmusic-player-bar');
    if (!bar) return { artist: '', album: '' };
    const byline = bar.querySelector('.byline');
    if (byline) {
      const links = [...new Set([...byline.querySelectorAll('a')].map(textOf).filter(Boolean))];
      if (links.length) return { artist: links[0].slice(0, 128), album: (links[1] || '').slice(0, 128) };
      const parts = textOf(byline).split(/\s*[•·]\s*/).filter(Boolean);
      if (parts.length) return { artist: parts[0].slice(0, 128), album: (parts[1] || '').slice(0, 128) };
    }
    return { artist: textOf(bar.querySelector('.subtitle')).slice(0, 128), album: '' };
  }

  function getTrackUrl() {
    try {
      const url = new URL(window.location.href);
      const videoId = url.searchParams.get('v');
      if (url.origin !== 'https://music.youtube.com' || url.pathname !== '/watch' || !videoId) return '';
      return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    } catch {
      return '';
    }
  }

  function getArtwork() {
    for (const selector of ['ytmusic-player-bar img.image', 'ytmusic-player-bar .thumbnail img', 'ytmusic-player-bar img']) {
      const img = document.querySelector(selector);
      const src = img && (img.currentSrc || img.src || img.getAttribute('src'));
      if (src && /^https?:\/\//i.test(src)) {
        // Ask YouTube's image CDN for a larger thumbnail when the player exposes a tiny one.
        return src
          .replace(/=w\d+-h\d+/i, '=w512-h512')
          .replace(/=s\d+(?=[^/]*$)/i, '=s512');
      }
    }
    return '';
  }


  function parseClock(value) {
    const parts = value.split(':').map(Number);
    if (!parts.length || parts.some(part => !Number.isFinite(part))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function getPlaybackTiming(video) {
    const bar = document.querySelector('ytmusic-player-bar');
    const timeElement = bar && bar.querySelector('.time-info, #time-info');
    const display = textOf(timeElement) || textOf(bar);
    const match = display.match(/(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)\s*\/\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\s|$)/);
    if (match) {
      return { position: parseClock(match[1]), duration: parseClock(match[2]) };
    }
    return {
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0
    };
  }

  function send(track) {
    chrome.runtime.sendMessage({ type: 'YTM_TRACK_UPDATE', track }, () => {
      if (chrome.runtime.lastError) console.debug('[YTM Presence]', chrome.runtime.lastError.message);
    });
  }

  function tick() {
    const playerVideos = [...document.querySelectorAll('ytmusic-player video, ytmusic-player-page video')];
    const video = playerVideos.find(candidate => !candidate.paused && !candidate.ended && candidate.readyState >= 2)
      || playerVideos.find(candidate => candidate.readyState >= 1)
      || document.querySelector('video.html5-main-video')
      || document.querySelector('video');
    const title = getTitle();
    const byline = getBylineParts();
    const timing = video ? getPlaybackTiming(video) : { position: 0, duration: 0 };
    const playing = !!(video && !video.paused && !video.ended && !video.error && title);
    if (!playing) {
      if (lastPlaying !== false) send({ playing: false });
      lastPlaying = false;
      return;
    }
    lastPlaying = true;
    send({
      playing: true,
      title,
      artist: byline.artist || 'YouTube Music',
      album: byline.album,
      artwork: getArtwork(),
      url: getTrackUrl(),
      duration: timing.duration,
      position: timing.position
    });
  }

  function start() {
    if (timer) clearInterval(timer);
    tick();
    timer = setInterval(tick, 2500);
  }
  document.addEventListener('yt-navigate-finish', () => setTimeout(tick, 700));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pageshow', tick);

  // Capture media events so background-tab timer throttling cannot miss pause/resume.
  document.addEventListener('pause', event => {
    if (event.target instanceof HTMLVideoElement) tick();
  }, true);
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLVideoElement) tick();
  }, true);
  document.addEventListener('playing', event => {
    if (event.target instanceof HTMLVideoElement) tick();
  }, true);

  start();
})();







