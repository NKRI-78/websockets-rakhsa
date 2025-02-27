require("dotenv").config();

const { v4: uuidv4 } = require('uuid');
const { createServer } = require('http');
const WebSocketServer = require('ws');
const express = require('express');
const Chat = require("./models/Chat");
const Sos = require("./models/Sos");
const User = require("./models/User");
// const Agent = require("./models/Agent");
const utils = require("./helpers/utils");

const moment = require('moment-timezone')

const app = express();
const server = createServer(app);
const wss = new WebSocketServer.Server({ server });

const sosQueue = [];

const clients = new Map();
const messageQueue = new Map();
const rooms = new Map();

wss.on("connection", (ws, _) => {
    ws.isAlive = true;

    ws.on("message", message => {
        const parsedMessage = JSON.parse(message);

        switch (parsedMessage.type) {
            case 'join':
                handleJoin(ws, parsedMessage);
                break;
            case 'leave': 
                handleLeave(ws, parsedMessage);
                break;
            case 'user-resolved-sos':
                handleUserResolvedSos(parsedMessage);
                break;
            case 'agent-closed-sos':
                handleAgentClosedSos(parsedMessage);
                break;
            case 'agent-confirmed-sos':
                handleAgentConfirmedSos(parsedMessage);
                break;
            case 'message': 
                handleMessage(parsedMessage); 
                break;
            case 'typing':
                handleTyping(ws, parsedMessage);
                break;
            case 'sos':
                handleSos(parsedMessage);
                break;
            default:
                break;
        }
    });

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on("close", () => {
        console.log("Server disconnect");
        clearInterval(interval);
        handleDisconnect(ws);
    });

    ws.onerror = function () {
        console.log("Some error occurred");
    };
});

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 3000);

async function handleJoin(ws, message) {
    const { user_id } = message;

    console.log(`user_id ${user_id} join`);

    if (!clients.has(user_id)) {
        clients.set(user_id, new Set());
    }

    clients.get(user_id).add(ws);
    deliverQueuedMessages(ws, user_id);

    for (const socketSet of clients.values()) {
        for (const socket of socketSet) {
            socket.send(JSON.stringify({ type: "user_online", user_id }));
        }
    }
}

async function handleLeave(ws, message) {
    const { user_id } = message;

    console.log(`user_id ${user_id} leave`);

    if (clients.has(user_id)) {
        const userConnections = clients.get(user_id);
        userConnections.delete(ws);

        if (userConnections.size === 0) {
            clients.delete(user_id);

            for (const socketSet of clients.values()) {
                for (const socket of socketSet) {
                    socket.send(JSON.stringify({ type: "user_offline", user_id }));
                }
            }
        }
    }
}

async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            if (attempt === maxRetries) throw error;
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

async function processQueue() {
    while (sosQueue.length > 0) {
        const message = sosQueue.shift();
        await handleSos(message); 
    }
}

async function handleSos(message) {
    const { user_id, media, ext, location, lat, lng, country, platform_type } = message;

    const sosType = ext === "jpg" ? 1 : 2;
    const platformType = 1;

    const time = utils.time();
    
    const checkIsSosIdle = await retryOperation(() => Sos.checkIsSosIdle(user_id));

    let sosId = uuidv4();
    let sosIdNew = uuidv4();

    try {

        if (checkIsSosIdle.length === 0) {
            await retryOperation(() => Sos.broadcast(sosId, user_id, location, media, sosType, lat, lng, country, time, platformType));
        } else {
            const updateSosId = checkIsSosIdle[0].uid;
            await retryOperation(() => Sos.updateBroadcast(updateSosId, user_id));

            sosId = sosIdNew;
            await retryOperation(() => Sos.broadcast(sosId, user_id, location, media, sosType, lat, lng, country, time, platformType));
        }

        const dataGetProfile = { user_id };
        const sender = await retryOperation(() => User.getProfile(dataGetProfile));
        const senderName = sender.length === 0 ? "-" : sender[0].username;
        const senderId = user_id;

        const payload = {
            type: "sos",
            id: sosId,
            sender: {
                id: senderId,
                name: senderName,
            },
            media,
            media_type: sosType === 1 ? "image" : "video",
            created: moment().format('yyyy-MM-DD'),
            created_at: moment().format('yyyy-MM-DD'),
            country,
            location,
            time,
            lat,
            lng,
            platform_type,
        };

        // for (const socketSet of clients.values()) {
        //     for (const socket of socketSet) {
        //         socket.send(JSON.stringify(payload));
        //     }
        // }

        // 🔥 Broadcast to **all connected users**
        clients.forEach((connections) => {
            connections.forEach((conn) => {
                if (conn.readyState === WebSocketServer.OPEN) {
                    conn.send(JSON.stringify(payload));
                }
            });
        });

    } catch(e) {
        console.error("Failed to send SOS, adding to queue:", e);
        if (!fromQueue) sosQueue.push(payload);
    }
}

setInterval(processQueue, 3000);

async function handleAgentClosedSos(message) {
    const { sos_id, note } = message;

    const sos = await Sos.findById(sos_id);
    const chats = await Chat.getChatBySosId(sos_id);

    const chatId = chats.length === 0 ? "-" : chats[0].uid;
        
    if (!rooms.has(chatId)) {
        rooms.set(chatId, new Set());
    }

    const sender = sos.length === 0 ? "-" : sos[0].user_agent_id;
    const recipient = sos.length === 0 ? "-" : sos[0].user_id;

    const senderConnections = clients.get(sender) || new Set();
    const recipientConnections = clients.get(recipient) || new Set();

    senderConnections.forEach(conn => rooms.get(chatId).add(conn));
    recipientConnections.forEach(conn => rooms.get(chatId).add(conn));

    rooms.get(chatId).forEach(conn => {
        if (conn.readyState === WebSocketServer.OPEN) {
            conn.send(JSON.stringify({
                type: "closed-by-agent",
                note: note
            }));
        }
    });
}

async function handleAgentConfirmedSos(message) {
    const { sos_id, user_id_agent } = message;

    const sos = await Sos.findById(sos_id);
    const chats = await Chat.getChatBySosId(sos_id);

    const chatId = chats.length === 0 ? "-" : chats[0].uid;
    
    if (!rooms.has(chatId)) {
        rooms.set(chatId, new Set());
    }

    const sender = user_id_agent;
    const recipient = sos.length === 0 ? "-" : sos[0].user_id;

    const senderConnections = clients.get(sender) || new Set();
    const recipientConnections = clients.get(recipient) || new Set();

    senderConnections.forEach(conn => rooms.get(chatId).add(conn));
    recipientConnections.forEach(conn => rooms.get(chatId).add(conn));

    // rooms.get(chatId).forEach(conn => {
    //     if (conn.readyState === WebSocketServer.OPEN) {
    //         conn.send(JSON.stringify({
    //             type: "confirmed-by-agent",
    //             sos_id: sos_id,
    //             sender: recipient,
    //             recipient_id: sender,
    //             chat_id: chatId
    //         }));
    //     }
    // });

    // 🔥 Broadcast to **all connected users**
    clients.forEach((connections) => {
        connections.forEach((conn) => {
            if (conn.readyState === WebSocketServer.OPEN) {
                conn.send(JSON.stringify({
                    type: "confirmed-by-agent",
                    sos_id: sos_id,
                    sender: recipient,
                    recipient_id: sender,
                    chat_id: chatId
                }));
            }
        });
    });
}

async function handleUserResolvedSos(message) {
    const { sos_id } = message;

    const sos = await Sos.findById(sos_id);
    const chats = await Chat.getChatBySosId(sos_id);

    const chatId = chats.length === 0 ? "-" : chats[0].uid;

    if (!rooms.has(chatId)) {
        rooms.set(chatId, new Set());
    }

    const sender = sos.length === 0 ? "-" : sos[0].user_agent_id;
    const recipient = sos.length === 0 ? "-" : sos[0].user_id;

    const users = await User.getProfile({ user_id: recipient });

    const recipientName = users.length === 0 ? "-" : users[0].username;

    const senderConnections = clients.get(sender) || new Set();
    const recipientConnections = clients.get(recipient) || new Set();

    senderConnections.forEach(conn => rooms.get(chatId).add(conn));
    recipientConnections.forEach(conn => rooms.get(chatId).add(conn));

    rooms.get(chatId).forEach(conn => {
        if (conn.readyState === WebSocketServer.OPEN) {
            conn.send(JSON.stringify({
                type: "resolved-by-user",
                sos_id: sos_id,
                chat_id: chatId,
                text: `${recipientName} telah menyatakan kasus telah selesai`
            }));
        }
    });
}

async function handleMessage(message) {
    const { chat_id, sender, recipient, text, created_at } = message;
    const msgId = uuidv4();

    // Fetch sender and recipient profiles
    const [userSenders, userRecipients] = await Promise.all([
        User.getProfile({ user_id: sender }),
        User.getProfile({ user_id: recipient }),
    ]);

    // Fetch chat details
    const getChat = await Chat.getChat(chat_id);
    const sosId = getChat.length === 0 ? "-" : getChat[0].sos_id;

    // Sender details
    const senderId = userSenders.length === 0 ? "-" : userSenders[0].user_id;
    const senderName = userSenders.length === 0 ? "-" : userSenders[0].username;
    const senderAvatar = userSenders.length === 0 ? "-" : userSenders[0].avatar;

    // Recipient details
    const recipientId = userRecipients.length === 0 ? "-" : userRecipients[0].user_id;
    const recipientName = userRecipients.length === 0 ? "-" : userRecipients[0].username;
    const recipientAvatar = userRecipients.length === 0 ? "-" : userRecipients[0].avatar;

    // Insert message into DB
    await Chat.insertMessage(msgId, chat_id, sender, recipient, text, created_at);

    // Get recipient FCM token
    const fcms = await User.getFcm({ user_id: recipientId });
    const token = fcms.length === 0 ? "-" : fcms[0].token;

    // Prepare message data
    const messageData = {
        id: msgId,
        chat_id,
        pair_room: recipient,
        user: {
            id: recipientId,
            name: recipientName,
            avatar: recipientAvatar,
            is_me: false,
        },
        sender: {
            id: senderId,
        },
        is_read: false,
        sent_time: utils.formatTime(created_at),
        text,
        type: "text",
    };

    // Ensure chat room exists
    if (!rooms.has(chat_id)) {
        rooms.set(chat_id, new Set());
    }

    // Ensure sender and recipient are registered in clients
    if (!clients.has(sender)) clients.set(sender, new Set());
    if (!clients.has(recipient)) clients.set(recipient, new Set());

    // Add sender and recipient connections to the chat room
    clients.get(sender).forEach(conn => rooms.get(chat_id).add(conn));
    clients.get(recipient).forEach(conn => rooms.get(chat_id).add(conn));

    clients.forEach((connections) => {
        connections.forEach((conn) => {
            if (conn.readyState === WebSocketServer.OPEN) {
                const isSender = clients.get(sender)?.has(conn);
                const isRecipient = clients.get(recipient)?.has(conn);

                conn.send(JSON.stringify({
                    type: "fetch-message",
                    data: {
                        ...messageData,
                        user: {
                            id: isRecipient ? recipientId : senderId,
                            name: isRecipient ? recipientName : senderName,
                            avatar: isRecipient ? recipientAvatar : senderAvatar,
                            is_me: isSender,
                        },
                    },
                }));
            }
        });
    });

    // Store message in recipient's message queue
    if (!messageQueue.has(recipient)) {
        messageQueue.set(recipient, []);
    }
    messageQueue.get(recipient).push(messageData);

    // Send push notification
    await utils.sendFCM(senderName, text, token, "chat", {
        chat_id,
        recipient_id: recipientId,
        sos_id: sosId
    });
}

async function deliverQueuedMessages(recipientSocket, recipientId) {
    if (messageQueue.has(recipientId)) {
        const queuedMessages = messageQueue.get(recipientId);

        if (queuedMessages.length > 0) {
            console.log(`Delivering ${queuedMessages.length} messages to recipient ${recipientId}`);

            for (let i = 0; i < queuedMessages.length; i++) {
                const msg = queuedMessages[i];

                try {
                    await new Promise((resolve, reject) => {
                        recipientSocket.send(JSON.stringify({ type: "fetch-message", data: msg }), (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        });
                    });

                    console.log(`Message delivered to ${recipientId}:`, msg);
                } catch (error) {
                    console.error(`Error delivering message to ${recipientId}:`, error);
                }
            }

            console.log(`All messages delivered to ${recipientId}, clearing the queue.`);
            messageQueue.delete(recipientId);
        } else {
            console.log(`No queued messages for recipient ${recipientId}`);
        }
    } else {
        console.log(`No messages in queue for recipient ${recipientId}`);
    }
}

async function handleTyping(ws, message) {
    const { chat_id, sender, recipient, is_typing } = message;

    const recipientConnections = clients.get(recipient) || new Set();

    const typingNotification = {
        type: "typing",
        data: {
            chat_id,
            sender,
            is_typing,
        },
    };

    recipientConnections.forEach((conn) => {
        if (conn.readyState === WebSocketServer.OPEN && conn !== ws) {
            conn.send(JSON.stringify(typingNotification));
        }
    });
}

function handleDisconnect(ws) {
    for (const [user_id, socket] of clients.entries()) {
        if (socket === ws) {
            clients.delete(user_id);
            socket.send(JSON.stringify({ type: 'user_offline', user_id: user_id }));
            break;
        }
    }
}

server.listen(process.env.PORT, function () {
    console.log(`Listening on port ${process.env.PORT}`);
});