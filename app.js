require("dotenv").config()

const { v4: uuidv4 } = require('uuid')

const { createServer } = require('http')
const WebSocketServer = require('ws')

const express = require('express')
const moment = require('moment-timezone')

const Chat = require("./models/Chat")
const Sos = require("./models/Sos")
const User = require("./models/User")
const utils = require("./helpers/utils")
const Agent = require("./models/Agent")

const app = express()

const server = createServer(app)
 
const wss = new WebSocketServer.Server({ server })

const clients = new Map()

wss.on("connection", (ws, _) => {

    ws.on("message", message => {

        const parsedMessage = JSON.parse(message)

        switch (parsedMessage.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: "pong" }));
            break;
            case 'join':
                handleJoin(ws, parsedMessage)
            break;
            case 'leave': 
                handleLeave(ws, parsedMessage)
            break;
            case 'message': 
                handleMessage(ws, parsedMessage) 
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
            case 'ack-read': 
                handleAckRead(ws, parsedMessage)
            break;
            case 'contact': 
                handleContact(ws, parsedMessage)
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
    const { sos_id, user_id, media, ext, location, lat, lng, country, time, platform_type } = message   

    var continent = utils.countryCompareContinent("Japan")
    var agents = await Agent.userAgent(continent)

    var sosType

    if(ext == "jpg") {
        sosType = 1
    } else {
        sosType = 2 
    }

    const platformType = platform_type == "raksha" ? 1 : 2

    await Sos.broadcast(
        sos_id, 
        user_id,
        location,
        media,
        sosType,
        lat, 
        lng,
        country,
        time,
        platformType
    )

    clients.forEach(async (client, userId) => {
        if (client.readyState === WebSocketServer.OPEN) {
            for (var i in agents) {

                var dataGetProfile = {
                    user_id: user_id
                }

                const sender = await User.getProfile(dataGetProfile)

                if(agents[i].user_id == userId) {
                    var senderId = user_id
                    var senderName = sender.length == 0 ? "-" : sender[0].username
                    
                    client.send(JSON.stringify({
                        type: "sos",
                        id: sos_id,
                        sender: {
                            id: senderId,
                            name: senderName
                        },  
                        media: media,
                        media_type: sosType == 1 
                        ? "image" 
                        : "video",
                        created: utils.formatDateWithSos(new Date()),
                        created_at: utils.formatDateWithSos(new Date()),
                        country: country,
                        location: location,
                        time: time,
                        lat: lat, 
                        lng: lng,
                        platform_type: platform_type
                    }))
                }
            }
        }
    })
} 

async function handleAgentConfirmSos(ws, message) { 
    const { sos_id, user_agent_id } = message

    var chatId = uuidv4()

    const sos = await Sos.findById(sos_id)

    var status = sos.length == 0 ? '-' : sos[0].status
    var senderId = sos.length == 0 ? '-' : sos[0].user_id

    const broadcastToSender = clients.get(senderId)

    var userAgentId = user_agent_id

    var dataGetProfileAgent = {
        user_id: userAgentId
    }

    var agents = await User.getProfile(dataGetProfileAgent)

    var agentId = agents.length == 0 ? "-" : agents[0].user_id
    var agentName = agents.length == 0 ? "-" : agents[0].username

    var dataGetProfileSender = {
        user_id: senderId
    }

    var users = await User.getProfile(dataGetProfileSender)

    var senderName = users.length == 0 ? "-" : users[0].username

    var dataFcm = {
        user_id: senderId
    }

    var fcms = await User.getFcm(dataFcm)

    var token = fcms.length == 0 
    ? "-" 
    : fcms[0].token

    await utils.sendFCM(`${agentName} telah terhubung dengan Anda`, `Halo ${senderName}`, token, "agent-confirm-sos")

    var checkConversation = await Chat.checkConversation(senderId, userAgentId)

    if(checkConversation.length == 0) {
        await Chat.insertChat(chatId, senderId, userAgentId, sos_id)
    } else {
        chatId = checkConversation[0].uid

        await Chat.updateChat(chatId, sos_id)
    }
 
    if(broadcastToSender) {
        broadcastToSender.send(JSON.stringify({
            "type": `confirm-sos`,
            "sos_id": sos_id,
            "chat_id": chatId,
            "status": status,
            "agent_id": agentId,
            "agent_name": agentName,
            "sender_id": senderId,
            "recipient_id": userAgentId,
        }))
    }

    await Sos.approvalConfirm(sos_id, userAgentId)

    ws.send(JSON.stringify({
        "type": `confirm-sos`,
        "sos_id": sos_id,
        "status": status,
        "chat_id": chatId,
        "agent_id": agentId,
        "agent_name": agentName,
        "sender_id": senderId,
        "recipient_id": userAgentId,
    }))
}

async function handleUserResolvedSos(ws, message) {
    const { sos_id } = message

    const sos = await Sos.findById(sos_id)

    var chats = await Chat.getChatBySosId(sos_id)

    var chatId = chats.length == 0 ? "-" : chats[0].uid
    var userId = sos.length == 0 ? "-" : sos[0].user_id
    var recipientId = sos.length == 0 ? "-" : sos[0].user_agent_id

    await Sos.moveSosToResolved(sos_id)
    
    await Sos.updateExpireMessages(chatId)

    var dataFcm = {
        user_id: userId
    }

    var fcms = await User.getFcm(dataFcm)

    var token = fcms.length == 0 
    ? "-" 
    : fcms[0].token

    await utils.sendFCM(`Anda telah menyelesaikan kasus ini`, `Terima kasih telah menggunakan layanan Raksha`, token, "agent-confirm-sos")

    const broadcastToRecipient = clients.get(recipientId)

    if(broadcastToRecipient) {
        broadcastToRecipient.send(JSON.stringify({
            "type": `resolved-sos-${recipientId}`,
            "chat_id": chatId,
            "sos_id": sos_id,
            "message": `Terima kasih telah menggunakan layanan Raksha`,
        }))
    }

    ws.send(JSON.stringify({
        "type": `resolved-sos-${userId}`,
        "chat_id": chatId,
        "sos_id": sos_id,
        "message": `Terima kasih telah menggunakan layanan Raksha`,
    }))
}

async function handleAgentClosedSos(ws, message) {
    const { sos_id, note } = message

    const sos = await Sos.findById(sos_id)

    var chats = await Chat.getChatBySosId(sos_id)

    var chatId = chats.length == 0 ? "-" : chats[0].uid

    var userId = sos.length == 0 ? "-" : sos[0].user_agent_id
    var recipientId = sos.length == 0 ? "-" : sos[0].user_id

    await Sos.moveSosToClosed(sos_id)
    
    await Sos.updateExpireMessages(chatId)
    
    var dataFcm = {
        user_id: recipientId
    }

    var fcms = await User.getFcm(dataFcm)

    var token = fcms.length == 0 
    ? "-" 
    : fcms[0].token

    var dataGetProfileAgent = {
        user_id: userId
    }

    var agents = await User.getProfile(dataGetProfileAgent)

    var agentName = agents.length == 0 ? "-" : agents[0].username

    await utils.sendFCM(`${agentName} telah menutup kasus ini`, note, token, "agent-closed-sos")

    const broadcastToRecipient = clients.get(recipientId)
    
    if(broadcastToRecipient) {
        broadcastToRecipient.send(JSON.stringify({
            "type": `closed-sos-${recipientId}`,
            "chat_id": chatId,
            "sos_id": sos_id,
            "message": note,
        }))
    }

    ws.send(JSON.stringify({
        "type": `closed-sos-${userId}`,
        "chat_id": chatId,
        "sos_id": sos_id,
        "message": note,
    }))
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

async function handleAckRead(ws, message) {
    const { chat_id, sender, recipient } = message

    await Chat.updateAckRead(chat_id, recipient)

    const recipientSocket = clients.get(sender)
    if(recipientSocket) {
        recipientSocket.send(JSON.stringify({ 
            type: 'ack-read', 
            chat_id,
            recipient_view: false
        }))
    }

    ws.send(JSON.stringify({
        type: 'ack-read', 
        chat_id,
        recipient_view: true
    }))
}

const messageQueue = new Map(); 

async function handleMessage(ws, message) {
    const { sender, recipient, text } = message;
    const msgId = uuidv4();

    const [userSenders, userRecipients] = await Promise.all([
        User.getProfile({ user_id: sender }),
        User.getProfile({ user_id: recipient })
    ]);

    const senderId = userSenders.length == 0 ? "-" : userSenders[0].user_id;
    const senderName = userSenders.length == 0 ? "-" : userSenders[0].username;
    const senderAvatar = userSenders.length == 0 ? "-" : userSenders[0].avatar;

    const recipientId = userRecipients.length == 0 ? "-" : userRecipients[0].user_id;
    const recipientName = userRecipients.length == 0 ? "-" : userRecipients[0].username;
    const recipientAvatar = userRecipients.length == 0 ? "-" : userRecipients[0].avatar;

    const chats = await Chat.checkConversation(sender, recipient);
    const chatId = chats.length == 0 ? uuidv4() : chats[0].uid;

    await Chat.insertMessage(msgId, chatId, sender, recipient, text);

    const fcms = await User.getFcm({ user_id: recipientId });
    const token = fcms.length == 0 ? "-" : fcms[0].token;

    const messageData = {
        id: msgId,
        chat_id: chatId,
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
        sent_time: moment().tz("Asia/Jakarta").format('HH:mm'),
        text: text,
        type: "text"
    };

    const recipientSocket = clients.get(recipient);

    if (recipientSocket) {
        await utils.sendFCM(senderName, text, token, "send-msg");
        recipientSocket.send(JSON.stringify({ type: "fetch-message", data: messageData }));
    } else {
        if (!messageQueue.has(recipient)) {
            messageQueue.set(recipient, []);
        }
        messageQueue.get(recipient).push(messageData);
    }

    ws.send(
        JSON.stringify({
            type: `fetch-message`,
            data: {
                id: msgId,
                chat_id: chatId,
                pair_room: sender,
                user: {
                    id: senderId,
                    name: senderName,
                    avatar: senderAvatar,
                    is_me: true,
                },
                sender: {
                    id: senderId,
                },
                is_read: true,
                sent_time: moment().tz("Asia/Jakarta").format('HH:mm'),
                text: text,
                type: "text"
            }
        })
    );
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

            leave(user_id)

            clients.delete(user_id)
            
            break;
        }
    }
}

// GET USER ONLINE
// function notifyUser(status) {
//     const users = Array.from(clients.keys());
//     for (const socket of clients.values()) {
//       socket.send(JSON.stringify({ type: status, users: users }))
//     }
// }

// var CronJob = cron.CronJob

// const taskSosExpireAfter1MinuteNotReact = new CronJob('* * * * *', async () => {
//     var sos = await Sos.checkExpireSos()

//     if (sos.length > 0) {
//         var sosId = sos[0].uid
//         ?
//     }
// })

// taskSosExpireAfter1MinuteNotReact.start()

async function leave(user_id) {
    for (const socket of clients.values()) {
        socket.send(JSON.stringify({ type: 'leave', user_id: user_id }))
    }
}
  
server.listen(process.env.PORT, function () {
    console.log(`Listening on port ${process.env.PORT}`)
})