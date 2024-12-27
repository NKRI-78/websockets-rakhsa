require("dotenv").config();

const { v4: uuidv4 } = require("uuid");
const { createServer } = require("http");
const WebSocketServer = require("ws");
const express = require("express");

const Chat = require("./models/Chat");
const Sos = require("./models/Sos");
const User = require("./models/User");
const Agent = require("./models/Agent");

const utils = require("./helpers/utils");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer.Server({ server });

const clients = new Map(); // Stores active WebSocket connections
const messageQueue = new Map(); // Stores queued messages for offline users
const rooms = new Map(); // Stores active chat rooms

// WebSocket Connection Handling
wss.on("connection", (ws) => {
    ws.isAlive = true;

    ws.on("message", async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            await handleWebSocketMessage(ws, parsedMessage);
        } catch (err) {
            console.error("Error processing message:", err.message);
        }
    });

    ws.on("pong", () => {
        ws.isAlive = true;
    });

    ws.on("close", () => {
        console.log("Client disconnected");
        handleDisconnect(ws);
    });

    ws.onerror = (error) => {
        console.error("WebSocket error:", error.message);
    };
});

// Ping-Pong for Keeping Connections Alive
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

// WebSocket Message Handler
async function handleWebSocketMessage(ws, message) {
    switch (message.type) {
        case "join":
            await handleJoin(ws, message);
            break;
        case "leave":
            handleLeave(ws, message);
            break;
        case "message":
            await handleMessage(message);
            break;
        case "sos":
            await handleSos(message);
            break;
        default:
            console.warn("Unknown message type:", message.type);
            break;
    }
}

// User Joins Chat
async function handleJoin(ws, { user_id }) {
    console.log(`User ${user_id} joined`);

    if (!clients.has(user_id)) {
        clients.set(user_id, new Set());
    }
    clients.get(user_id).add(ws);

    await deliverQueuedMessages(ws, user_id);

    broadcastToClients({ type: "user_online", user_id });
}

// User Leaves Chat
function handleLeave(ws, { user_id }) {
    console.log(`User ${user_id} left`);

    const userConnections = clients.get(user_id);
    if (userConnections) {
        userConnections.delete(ws);
        if (userConnections.size === 0) {
            clients.delete(user_id);
            broadcastToClients({ type: "user_offline", user_id });
        }
    }
}

// Handle SOS Messages
async function handleSos(message) {
    const { sos_id, user_id, media, ext, location, lat, lng, country, time, platform_type } = message;

    const continent = utils.countryCompareContinent(country);
    const agents = await Agent.userAgent(continent);
    const sosType = ext === "jpg" ? 1 : 2;
    const platformType = platform_type === "raksha" ? 1 : 2;

    await Sos.broadcast(sos_id, user_id, location, media, sosType, lat, lng, country, time, platformType);

    const senderProfile = await User.getProfile({ user_id });
    const senderName = senderProfile.length ? senderProfile[0].username : "-";

    agents.forEach(({ user_id: agentId }) => {
        if (clients.has(agentId)) {
            const payload = createSosPayload(message, senderName, sos_id);
            sendToClientSet(clients.get(agentId), payload);
        }
    });
}

// Handle Chat Messages
async function handleMessage({ chat_id, sender, recipient, text }) {
    const msgId = uuidv4();

    const [senderProfile, recipientProfile] = await Promise.all([
        User.getProfile({ user_id: sender }),
        User.getProfile({ user_id: recipient }),
    ]);

    const senderData = formatUserProfile(senderProfile);
    const recipientData = formatUserProfile(recipientProfile);

    await Chat.insertMessage(msgId, chat_id, sender, recipient, text);

    const messageData = createMessagePayload(msgId, chat_id, text, senderData, recipientData);

    addMessageToRoom(chat_id, sender, recipient, messageData);
    addToQueue(recipient, messageData);

    const recipientToken = (await User.getFcm({ user_id: recipient }))?.[0]?.token || "-";
    await utils.sendFCM(senderData.name, text, recipientToken, "send-msg");
}

// Send Queued Messages
async function deliverQueuedMessages(ws, recipientId) {
    const queuedMessages = messageQueue.get(recipientId) || [];
    for (const msg of queuedMessages) {
        try {
            await sendMessage(ws, msg);
        } catch (err) {
            console.error("Error delivering message:", err.message);
        }
    }
    messageQueue.delete(recipientId);
}

// Utility Functions
function broadcastToClients(message) {
    clients.forEach((socketSet) =>
        sendToClientSet(socketSet, message)
    );
}

function sendToClientSet(clientSet, message) {
    clientSet.forEach((ws) => {
        if (ws.readyState === WebSocketServer.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

function createSosPayload(message, senderName, sos_id) {
    return {
        type: "sos",
        id: sos_id,
        sender: {
            name: senderName,
        },
        ...message,
    };
}

function createMessagePayload(id, chat_id, text, senderData, recipientData) {
    return {
        id,
        chat_id,
        text,
        sender: senderData,
        recipient: recipientData,
        is_read: false,
        sent_time: utils.formatTime(),
    };
}

function formatUserProfile(profile) {
    if (!profile.length) return { id: "-", name: "-", avatar: "-" };
    const { user_id, username, avatar } = profile[0];
    return { id: user_id, name: username, avatar };
}

function addMessageToRoom(chat_id, sender, recipient, message) {
    if (!rooms.has(chat_id)) rooms.set(chat_id, new Set());
    rooms.get(chat_id).add(clients.get(sender));
    rooms.get(chat_id).add(clients.get(recipient));
    sendToClientSet(rooms.get(chat_id), message);
}

function addToQueue(recipient, message) {
    if (!messageQueue.has(recipient)) messageQueue.set(recipient, []);
    messageQueue.get(recipient).push(message);
}

function handleDisconnect(ws) {
    clients.forEach((socketSet, userId) => {
        if (socketSet.has(ws)) {
            socketSet.delete(ws);
            if (socketSet.size === 0) {
                clients.delete(userId);
                broadcastToClients({ type: "user_offline", user_id: userId });
            }
        }
    });
}

// Start Server
server.listen(process.env.PORT, () => {
    console.log(`Listening on port ${process.env.PORT}`);
});
