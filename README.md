# YouTube Music Discord Presence

A Chrome extension and Windows native host that show the track currently playing in YouTube Music as Discord Rich Presence.

The activity can include the song title, album, artist, cover art, and playback progress. The extension is loaded locally from this repository; it is not published in the Chrome Web Store.

## How it works

The extension reads the current playback information from YouTube Music and sends it to a small native host on your computer. The native host connects to the running Discord Desktop client through Discord's local IPC interface.

This project does not use a Discord bot, OAuth login, Client Secret, or bot token. Each user must create a Discord application and use its Application ID.

## Requirements

- Windows
- Google Chrome
- Discord Desktop, running while music is playing
- Node.js 25.5 or newer to build the standalone executable  
  Download Node.js from [nodejs.org](https://nodejs.org/en/download/).

The build script uses Node.js Single Executable Applications (SEA). It does not use `pkg` or require `npm install`. See the [Node.js SEA documentation](https://nodejs.org/api/single-executable-applications.html).

## 1. Get the project files

Download or clone this repository and keep the project folder in a permanent location. Chrome needs the extension folder to remain there.

## 2. Create a Discord application and copy its Application ID

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application.
3. Open **General Information** and copy the **Application ID**.

The Application ID is not the Public Key, Client Secret, or a bot token. This project only needs the Application ID for the local Rich Presence connection.

## 3. Add your Application ID to your local source copy

Open:

```text
native-host/native-host.js
```

Find the `CLIENT_ID` line:

```js
const CLIENT_ID = process.env.YTM_DISCORD_APPLICATION_ID || 'PASTE_YOUR_APPLICATION_ID_HERE';
```

Replace `PASTE_YOUR_APPLICATION_ID_HERE` with your Application ID. Keep the surrounding quotes.

For example:

```js
const CLIENT_ID = process.env.YTM_DISCORD_APPLICATION_ID || 'YOUR_APPLICATION_ID';
```

Use your actual ID in your local copy. Do not commit or publish the edited file, your Application ID, or the executable you build with it. Discord's [Developer Terms](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service) treat Application IDs as developer credentials and prohibit embedding credentials in open-source projects.

The public repository should contain only the placeholder shown above.

## 4. Build the Windows executable

Open the `native-host` folder in File Explorer, click the address bar, type `powershell`, and press Enter. Then run:

```powershell
node -v
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

The script checks the Node.js version, stops if the build fails, verifies the output, and refuses to overwrite an existing executable.

The current script creates:

```text
ytmusic-discord-presence-host-v3.exe
```

If that file already exists, the script will stop rather than replace it. Rename the existing file or choose a new output filename in `build-windows.ps1`, then run the command again.

The executable contains the Application ID you entered. Keep it private and do not upload it to this repository.

## 5. Install the native host

With PowerShell still open in the `native-host` folder, run:

```powershell
$installDir = Join-Path $env:LOCALAPPDATA 'YTM Discord Presence'
$exeName = 'ytmusic-discord-presence-host-v3.exe'
$sourceExe = Join-Path $PWD $exeName
$installedExe = Join-Path $installDir $exeName
$manifestPath = Join-Path $installDir 'com.ytmusic.discord_presence.json'

if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) {
    throw "Executable not found: $sourceExe"
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

if (Test-Path -LiteralPath $installedExe) {
    throw "An executable already exists at $installedExe. Rename it first to keep the existing copy."
}

Copy-Item -LiteralPath $sourceExe -Destination $installedExe

$manifest = [ordered]@{
    name = 'com.ytmusic.discord_presence'
    description = 'YouTube Music Discord Presence native host'
    path = $installedExe
    type = 'stdio'
    allowed_origins = @('chrome-extension://jfjimmnciolmejlahkaffhnkojpdjomp/')
}

$json = $manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText(
    $manifestPath,
    $json,
    [System.Text.UTF8Encoding]::new($false)
)

powershell -ExecutionPolicy Bypass -File .\install-native-host.ps1
```

This installs the executable in your local Windows user profile, creates the native host manifest, and registers the host with Chrome. Chrome requires the native host to be registered and its manifest to list the extension's exact origin. See [Chrome's Native Messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

The origin above matches the extension key included in this repository. Do not remove or change the `key` value in `extension/manifest.json` unless you also update the origin in the native host manifest to match the extension ID shown by Chrome.

## 6. Load the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's `extension` folder.
5. Check that Chrome shows the extension ID:
   `jfjimmnciolmejlahkaffhnkojpdjomp`

Keep the project folder in place. If you move or delete it, Chrome may no longer be able to load the extension.

## 7. Use it

1. Start Discord Desktop.
2. Open YouTube Music in Chrome.
3. Play a song.
4. Check your Discord profile activity.

If you reload the extension or change its files, reload the YouTube Music tab as well.

## Troubleshooting

- **Discord does not show the activity:** Make sure Discord Desktop is running, a song is playing, and the extension is enabled.
- **Chrome says the native host cannot be found:** Check that `com.ytmusic.discord_presence.json` exists in `%LOCALAPPDATA%\YTM Discord Presence` and that the registry entry points to it.
- **Chrome says access to the native host is forbidden:** Confirm the `allowed_origins` value exactly matches the extension ID shown on `chrome://extensions`.
- **The build script says the output already exists:** It intentionally avoids overwriting the existing executable. Rename that file or set a different output filename in the script.

## Privacy

The extension reads the current track title, artist, album, artwork URL, and playback position from YouTube Music. It passes that information to the native host on your computer, which sends the Rich Presence activity to the running Discord Desktop client. This project does not operate a separate server.

Your Discord activity may be visible to others according to your Discord activity privacy settings.
