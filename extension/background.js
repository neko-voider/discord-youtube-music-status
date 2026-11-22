'use strict';

const HOST_NAME = 'com.ytmusic.discord_presence';
let nativePort = null;
let lastTrack = { playing: false };
let reconnectTimer = null;
let hasYtMusicTab = false;
let connecting = false;

function sendHost(message) {
  if (nativePort) {
    try { nativePort.postMessage(message); } catch (e) { console.debug('[YTM Presence] Native host send failed', e); }
  }
}

function connectHost() {
  if (nativePort || connecting || !hasYtMusicTab) return;
  connecting = true;
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    connecting = false;
    nativePort.onMessage.addListener(msg => {
      if (msg && msg.type === 'status') console.debug('[YTM Presence]', msg.message);
    });
    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      if (err) console.debug('[YTM Presence] Native host disconnected:', err.message);
      nativePort = null;
      connecting = false;
      if (hasYtMusicTab) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectHost, 3000);
      }
    });
    sendHost({ type: 'track', track: lastTrack });
  } catch (e) {
    connecting = false;
    nativePort = null;
    console.error('[YTM Presence] Could not connect to native host:', e);
  }
}

function disconnectHost() {
  clearTimeout(reconnectTimer);
  sendHost({ type: 'stop' });
  if (nativePort) {
    try { nativePort.disconnect(); } catch {}
    nativePort = null;
  }
  connecting = false;
}

async function refreshTabs() {
  const tabs = await chrome.tabs.query({ url: ['https://music.youtube.com/*'] });
  const found = tabs.length > 0;
  if (found && !hasYtMusicTab) {
    hasYtMusicTab = true;
    connectHost();
  } else if (!found && hasYtMusicTab) {
    hasYtMusicTab = false;
    lastTrack = { playing: false };
    disconnectHost();
  } else if (found && !nativePort) {
    connectHost();
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'YTM_TRACK_UPDATE') return;
  lastTrack = message.track || { playing: false };
  if (sender.tab && sender.tab.url && sender.tab.url.startsWith('https://music.youtube.com/')) {
    refreshTabs().then(() => {
      if (hasYtMusicTab) {
        if (!nativePort) connectHost();
        sendHost({ type: 'track', track: lastTrack });
      }
    });
  }
});

chrome.tabs.onCreated.addListener(() => { refreshTabs(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') refreshTabs();
});
chrome.tabs.onRemoved.addListener(() => { refreshTabs(); });
chrome.windows.onRemoved.addListener(() => { refreshTabs(); });
chrome.runtime.onStartup.addListener(() => { refreshTabs(); });
chrome.runtime.onInstalled.addListener(() => { refreshTabs(); });

// Start host if Chrome was already open with a YouTube Music tab when extension worker starts.
refreshTabs();
