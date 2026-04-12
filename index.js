const { default: makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, downloadContentFromMessage, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs-extra");
const path = require("path");

let chats = {}; 
const logFile = 'logs.txt';
const downloadFolder = './downloads';

// ෆෝල්ඩර් එක නැත්නම් හදමු
fs.ensureDirSync(downloadFolder);

async function startMonitor() {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS('Desktop'),
        printQRInTerminal: false,
    });

    function renderDashboard() {
        console.clear();
        console.log("\x1b[41m\x1b[37m\x1b[1m %s \x1b[0m", " 💀 WHATSAPP ULTIMATE SPY TERMINAL - ONLINE ");
        console.log("\x1b[90m%s\x1b[0m", " Logs & Media are being saved locally...");
        console.log("");

        for (const [jid, data] of Object.entries(chats)) {
            const name = data.name || "Unknown";
            const realNumber = jid.split('@')[0].split(':')[0];
            const color = jid.includes('@g.us') ? "\x1b[36m" : "\x1b[32m"; 
            
            console.log(`${color}┌── Chat: ${name} \x1b[33m[+${realNumber}]\x1b[0m ${color}──\x1b[0m`);
            data.messages.slice(-4).forEach(m => {
                const prefix = m.isMe ? "\x1b[33m You: \x1b[0m" : `\x1b[32m ${name}: \x1b[0m`;
                console.log(`│ [${m.time}] ${prefix}${m.text}`);
            });
            console.log(`${color}└──────────────────────────────────────────\x1b[0m`);
        }
    }

    // ලොග් සේව් කරන එක
    function saveLog(entry) {
        fs.appendFileSync(logFile, `${entry}\n`);
    }

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { 
            console.clear(); 
            qrcode.generate(qr, { small: true }); 
        }
        if (connection === "open") renderDashboard();
        
        // --- 1. Auto-Reconnect Feature ---
        if (connection === "close") {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("⚠️ Connection lost. Retrying in 5s...");
                setTimeout(() => startMonitor(), 5000);
            }
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const jid = msg.key.remoteJid;
        const pushName = msg.pushName || "User";
        const isMe = msg.key.fromMe;
        const time = new Date().toLocaleTimeString();

        const messageType = Object.keys(msg.message)[0];
        let text = "";

        // --- 2. Media Downloader Feature ---
        if (messageType === 'imageMessage') {
            text = "📷 [Photo Saved]";
            const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
            const fileName = `img_${Date.now()}.jpg`;
            await fs.writeFile(path.join(downloadFolder, fileName), buffer);
        } 
        else if (messageType === 'conversation') text = msg.message.conversation;
        else if (messageType === 'extendedTextMessage') text = msg.message.extendedTextMessage.text;
        else text = `📎 [${messageType}]`;

        // --- 3. Log Saver Feature ---
        const logEntry = `[${time}] FROM: ${pushName} (${jid}) | MSG: ${text}`;
        saveLog(logEntry);

        if (!chats[jid]) chats[jid] = { name: pushName, messages: [] };
        chats[jid].messages.push({ text, time, isMe });
        renderDashboard();
    });
}

startMonitor();
