require("dotenv").config()

const { v4: uuidv4 } = require('uuid')

const { createServer } = require('http')

const WebSocketServer = require('ws')

const express = require('express')
const moment = require('moment-timezone')

const Chat = require("./models/Chat")
const Sos = require("./models/Sos")
const User = require("./models/User")
const Agent = require("./models/Agent")

const utils = require("./helpers/utils")

const app = express()

const server = createServer(app)
 
const wss = new WebSocketServer.Server({ server })

const clients = new Map()
const messageQueue = new Map()
const rooms = new Map();

wss.on("connection", (ws, _) => {

    ws.on("message", message => {

        const parsedMessage = JSON.parse(message)

        switch (parsedMessage.type) {
            case 'join':
                handleJoin(ws, parsedMessage)
            break;
            case 'leave': 
                handleLeave(ws, parsedMessage)
            break;
            case 'message': 
                handleMessage(parsedMessage) 
            break;
            case 'sos':
                handleSos(parsedMessage)
            break;
            case 'agent-confirm-sos': 
                handleAgentConfirmSos(ws, parsedMessage)
            break;
            case 'user-resolved-sos':
                handleUserResolvedSos(ws, parsedMessage)
            break;
            case 'agent-closed-sos': 
                handleAgentClosedSos(ws, parsedMessage)
            break;
            case 'typing': 
                handleTyping(parsedMessage)
            break;
            case 'stop-typing': 
                handleStopTyping(parsedMessage)
            break;
            break
            default:
                break;
        }
    })
 
    ws.on("close", () => {
        console.log("Server disconnect")
        
        handleDisconnect(ws)
    })

    ws.onerror = function () {
        console.log("Some error occurred")
    }
})

async function handleSos(message) {
    const { sos_id, user_id, media, ext, location, lat, lng, country, time, platform_type } = message;

    try {
        const continent = utils.countryCompareContinent("Japan");
        
        const agents = await Agent.userAgent(continent);

        const sosType = ext === "jpg" ? 1 : 2;

        const platformType = platform_type === "raksha" ? 1 : 2

        await Sos.broadcast(
            sos_id, user_id, location, media, sosType, lat, lng, country, time, platformType
        );

        const dataGetProfile = { user_id }
        const sender = await User.getProfile(dataGetProfile)
        const senderName = sender.length === 0 ? "-" : sender[0].username
        const senderId = user_id;

        for (const [userId, client] of clients) {
            if (client.readyState === WebSocketServer.OPEN) {
                const relevantAgent = agents.find(agent => agent.user_id === userId)
                if (relevantAgent) {
                    const payload = {
                        type: "sos",
                        id: sos_id,
                        sender: {
                            id: senderId,
                            name: senderName
                        },
                        media,
                        media_type: sosType === 1 ? "image" : "video",
                        created: utils.formatDateWithSos(new Date()),
                        created_at: utils.formatDateWithSos(new Date()),
                        country,
                        location,
                        time,
                        lat,
                        lng,
                        platform_type
                    }
                    client.send(JSON.stringify(payload))
                }
            }
        }
    } catch (error) {
        console.error('Error handling SOS:', error)
    }
}


async function handleAgentConfirmSos(ws, message) {
    const { sos_id, user_agent_id } = message;

    const chatId = uuidv4();

    const sos = await Sos.findById(sos_id);
    const status = sos.length === 0 ? '-' : sos[0].status
    const senderId = sos.length === 0 ? '-' : sos[0].user_id

    const broadcastToSender = clients.get(senderId);

    const dataGetProfileAgent = { user_id: user_agent_id }
    const agents = await User.getProfile(dataGetProfileAgent)
    const agentId = agents.length === 0 ? "-" : agents[0].user_id
    const agentName = agents.length === 0 ? "-" : agents[0].username

    const dataGetProfileSender = { user_id: senderId }
    const users = await User.getProfile(dataGetProfileSender)
    const senderName = users.length === 0 ? "-" : users[0].username

    const dataFcm = { user_id: senderId }
    const fcms = await User.getFcm(dataFcm)
    const token = fcms.length === 0 ? "-" : fcms[0].token

    await Chat.insertChat(chatId, senderId, user_agent_id, sos_id)
    await Sos.approvalConfirm(sos_id, user_agent_id);

    if (!rooms.has(chatId)) {
        rooms.set(chatId, new Set())
    }
    rooms.get(chatId).add(ws)
    if (broadcastToSender) {
        rooms.get(chatId).add(broadcastToSender)
    }

    const confirmationMessage = {
        type: `confirm-sos`,
        sos_id: sos_id,
        chat_id: chatId,
        status: status,
        agent_id: agentId,
        agent_name: agentName,
        sender_id: senderId,
        recipient_id: user_agent_id,
    };

    rooms.get(chatId).forEach(conn => {
        conn.send(JSON.stringify(confirmationMessage));
    });

    await utils.sendFCM(
        `${agentName} telah terhubung dengan Anda`,
        `Halo ${senderName}`,
        token,
        "agent-confirm-sos"
    );
}


async function handleUserResolvedSos(ws, message) {
    const { sos_id } = message;

    const sos = await Sos.findById(sos_id);
    const chats = await Chat.getChatBySosId(sos_id);

    const chatId = chats.length === 0 ? "-" : chats[0].uid;
    const userId = sos.length === 0 ? "-" : sos[0].user_id;

    await Sos.moveSosToResolved(sos_id);
    await Sos.updateExpireMessages(chatId);

    const dataFcm = { user_id: userId };
    const fcms = await User.getFcm(dataFcm);
    const token = fcms.length === 0 ? "-" : fcms[0].token;

    await utils.sendFCM(
        `Anda telah menyelesaikan kasus ini`,
        `Terima kasih telah menggunakan layanan Raksha`,
        token,
        "agent-confirm-sos"
    );

    const resolvedMessage = {
        type: `resolved-sos`,
        chat_id: chatId,
        sos_id: sos_id,
        message: `Terima kasih telah menggunakan layanan Raksha`,
    };

    if (rooms.has(chatId)) {
        rooms.get(chatId).forEach(conn => {
            conn.send(JSON.stringify(resolvedMessage));
        });
    }

    ws.send(JSON.stringify(resolvedMessage));
}

async function handleAgentClosedSos(ws, message) {
    const { sos_id, note } = message

    const sos = await Sos.findById(sos_id)
    const chats = await Chat.getChatBySosId(sos_id)

    const chatId = chats.length === 0 ? "-" : chats[0].uid
    const userId = sos.length === 0 ? "-" : sos[0].user_agent_id
    const recipientId = sos.length === 0 ? "-" : sos[0].user_id

    await Sos.moveSosToClosed(sos_id)
    await Sos.updateExpireMessages(chatId)

    const dataFcm = { user_id: recipientId }
    const fcms = await User.getFcm(dataFcm)
    const token = fcms.length === 0 ? "-" : fcms[0].token

    const dataGetProfileAgent = { user_id: userId }
    const agents = await User.getProfile(dataGetProfileAgent)
    const agentName = agents.length === 0 ? "-" : agents[0].username

    await utils.sendFCM(`${agentName} telah menutup kasus ini`, note, token, "agent-closed-sos")

    const closedMessage = {
        type: `closed-sos`,
        chat_id: chatId,
        sos_id: sos_id,
        message: note,
    }

    if (rooms.has(chatId)) {
        rooms.get(chatId).forEach(conn => {
            conn.send(JSON.stringify(closedMessage));
        })
    }

    ws.send(JSON.stringify(closedMessage))
}

async function handleMessage(message) {
    const { chat_id, sender, recipient, text } = message
    const msgId = uuidv4()

    const [userSenders, userRecipients] = await Promise.all([
        User.getProfile({ user_id: sender }),
        User.getProfile({ user_id: recipient })
    ])

    const senderId = userSenders.length === 0 ? "-" : userSenders[0].user_id
    const senderName = userSenders.length === 0 ? "-" : userSenders[0].username
    const senderAvatar = userSenders.length === 0 ? "-" : userSenders[0].avatar

    const recipientId = userRecipients.length === 0 ? "-" : userRecipients[0].user_id
    const recipientName = userRecipients.length === 0 ? "-" : userRecipients[0].username
    const recipientAvatar = userRecipients.length === 0 ? "-" : userRecipients[0].avatar

    await Chat.insertMessage(msgId, chat_id, sender, recipient, text)

    const fcms = await User.getFcm({ user_id: recipientId })
    const token = fcms.length === 0 ? "-" : fcms[0].token

    const messageData = {
        id: msgId,
        chat_id: chat_id,
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
        sent_time: moment().tz("Asia/Jakarta").format('HH:mm'),
        text: text,
        type: "text"
    }

    if (rooms.has(chat_id)) {
        rooms.get(chat_id).forEach(conn => {
            const isRecipient = conn === clients.get(recipient)

            conn.send(JSON.stringify({
                type: "fetch-message",
                data: {
                    ...messageData,
                    user: {
                        id: isRecipient ? recipientId : senderId,
                        name: isRecipient ? recipientName : senderName,
                        avatar: isRecipient ? recipientAvatar : senderAvatar,
                        is_me: !isRecipient,
                    },
                },
            }))
        })
    }

    const recipientSocket = clients.get(recipient)
    if (!recipientSocket) {
        await utils.sendFCM(senderName, text, token, "send-msg")
        if (!messageQueue.has(recipient)) {
            messageQueue.set(recipient, []);
        }
        messageQueue.get(recipient).push(messageData)
    }
}

async function handleJoin(ws, message) {
    const { user_id } = message

    console.log(`user_id ${user_id} join`)

    if (clients.has(user_id)) {
        const oldConn = clients.get(user_id)

        try {
            oldConn.send(JSON.stringify({ type: 'close', reason: 'Connection replaced' }))
            oldConn.terminate()
        } catch (error) {
            console.error("Error terminating old connection:", error)
        }

        clients.delete(user_id)

        console.log(`Old connection for client ${user_id} replaced by new connection.`)
    }

    clients.set(user_id, ws)

    deliverQueuedMessages(ws, user_id)

    for (const socket of clients.values()) {
        socket.send(JSON.stringify({ type: "user_online", user_id: user_id }))
    }
}

async function handleLeave(_, message) {
    const { user_id } = message

    console.log(`user_id ${user_id} leave`)

    for (const socket of clients.values()) {
        socket.send(JSON.stringify({ type: "user_offline", user_id: user_id }))
    }

    clients.delete(user_id)
}

function handleTyping(message) {
    const { sender, recipient, chat_id } = message

    const recipientSocket = clients.get(recipient)
    if (recipientSocket) {
      recipientSocket.send(JSON.stringify({ type: 'typing', chat_id, sender, recipient, is_typing: true }))
    }
}

function handleStopTyping(message) {
    const { sender, recipient, chat_id } = message
  
    const recipientSocket = clients.get(recipient)
    if (recipientSocket) {
      recipientSocket.send(JSON.stringify({ type: 'typing', chat_id, sender, recipient, is_typing: false }))
    }
}

function deliverQueuedMessages(recipientSocket, recipientId) {
    if (messageQueue.has(recipientId)) {
        const queuedMessages = messageQueue.get(recipientId);
        queuedMessages.forEach((msg) => {
            recipientSocket.send(JSON.stringify({ type: "fetch-message", data: msg }));
        });
        messageQueue.delete(recipientId);
    }
}


function handleDisconnect(ws) {
    for (const [user_id, socket] of clients.entries()) {
        if (socket === ws) {

            clients.delete(user_id)

            socket.send(JSON.stringify({ type: 'user_offline', user_id: user_id }))
            
            break;
        }
    }
}

server.listen(process.env.PORT, function () {
    console.log(`Listening on port ${process.env.PORT}`)
})