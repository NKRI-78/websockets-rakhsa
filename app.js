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
// const Kbri = require("./models/Kbri")

const PING_INTERVAL = 5000

const app = express()

const server = createServer(app)
 
const wss = new WebSocketServer.Server({ server })

const clients = new Map()

wss.on("connection", (ws, request) => {
    // const clientIp = request.socket.remoteAddress

    // console.log(`[WebSocket] Client with IP ${clientIp} has connected`)

    ws.isAlive = true;

    ws.on("pong", () => {
        ws.isAlive = true;
    });

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
                handleSos(ws, parsedMessage)
            break;
            case 'confirm-sos': 
                handleConfirmSos(ws, parsedMessage)
            break;
            case 'finish-sos': 
                handleFinishSos(ws, parsedMessage)
            break;
            case 'user-finish-sos': 
                handleUserFinishSos(ws, parsedMessage)
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
            case 'contact':assignActivity 
                handleContact(ws, parsedMessage)
            break
            case 'get-chat': 
                handleGetChat(ws, parsedMessage)
            break
            default:
                break;
        }
    })
 
    // Handle client disconnection
    ws.on("close", () => {
        console.log("Server disconnect")
        
        handleDisconnect(ws)
    })

    ws.onerror = function () {
        console.log("Some error occurred")
    }
})

async function handleSos(_, message) {
    const { sos_id, user_id, media, ext, location, lat, lng, country, time, platform_type } = message   

    var continent = utils.countryCompareContinent("Japan")
    var agents = await Agent.userAgent(continent)

    // Get all connected users
    // const connectedUsers = Array.from(clients.keys());

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

    clients.forEach(async (client, userId) =>  {
        if (client.readyState === WebSocketServer.OPEN) {
            for (var i in agents) {

                // if (!connectedUsers.includes(agent.user_id)) {
                //     // Skip agents who are not connected
                //     continue;
                // }
        
                const sender = await User.getProfile(user_id)

                if(agents[i].user_id == userId) {
                    var username = sender.length == 0 ? "-" : sender[0].username
                    
                    client.send(JSON.stringify({
                        type: "sos",
                        id: sos_id,
                        username: username,
                        media: media,
                        media_type: sosType == 1 
                        ? "image" 
                        : "video",
                        country: country,
                        location: location,
                        time: time,
                        lat: lat, 
                        lng: lng,
                        is_confirm: false,
                        platform_type: platform_type
                    }))
                }
            }
        }
    })
} 

async function handleConfirmSos(ws, message) { 
    const { sos_id, user_agent_id } = message

    const sos = await Sos.findById(sos_id)

    var senderId = sos[0].user_id

    const broadcastToSender = clients.get(senderId)

    var userAgentId = user_agent_id

    var chatId = uuidv4()
    
    var checkConversation = await Chat.checkConversation(senderId, userAgentId)

    if(checkConversation.length == 0) {

        await Chat.insertChat(chatId, senderId, userAgentId)

        await Chat.updateIsConfirm(0, chatId)

    } else {

        chatId = await checkConversation.length == 0 
        ? '-' 
        : checkConversation[0].uid 

        await Chat.updateIsConfirm(0, chatId)

    }
      
    if(broadcastToSender) {
        broadcastToSender.send(JSON.stringify({
            "type": "confirm-sos",
            "sos_id": sos_id,
            "chat_id": chatId,
            "sender_id": senderId,
            "recipient_id": userAgentId,
            "is_confirm": true
        }))
    }

    await Sos.approvalConfirm(sos_id, userAgentId)

    ws.send(JSON.stringify({
        "type": "confirm-sos",
        "sos_id": sos_id,
        "chat_id": chatId,
        "sender_id": senderId,
        "recipient_id": userAgentId,
        "is_confirm": true
    }))
}

async function handleFinishSos(ws, message) {
    const { sos_id } = message

    var sos = await Sos.findById(sos_id)

    var userId = sos.length == 0 ? "-" : sos[0].user_id

    var recipient = clients.get(userId)

    if(recipient) {
        recipient.send(JSON.stringify({
            "type": "finish-sos",
        }))
    }

    ws.send(JSON.stringify({
        "type": "finish-sos",
    }))
}

async function handleUserFinishSos(ws, message) {
    const { sos_id } = message

    var sos = await Sos.findById(sos_id)

    var userId = sos.length == 0 ? "-" : sos[0].user_agent_id
    var userAgentId = sos.length == 0 ? "-" : sos[0].user_id

    await Chat.updateIsConfirmByConversation(userAgentId, userId)

    var recipient = clients.get(userId)

    if(recipient) {
        recipient.send(JSON.stringify({
            "type": "user-finish-sos",
            "sos_id": sos_id
        }))
    }

    ws.send(JSON.stringify({
        "type": "user-finish-sos",
        "sos_id": sos_id
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

async function handleGetChat(ws, message) {
    const { sender } = message

    var chats = await Chat.getChats(sender)

    var data = []

    for (var i in chats) {
        var chat = chats[i]

        data.push({
            chat_id: chat.uid,
            user: {
                id: chat.user_id,
                avatar: chat.avatar,
                name: chat.name
            }
        })
    }

    ws.send(JSON.stringify({ type: 'get-chat' }))
}

async function handleMessage(ws, message) {
    const { chat_id, sender, recipient, text } = message

    var msgId = uuidv4()

    var dataSender = {
        user_id: sender
    }

    var dataRecipient = {
        user_id: recipient
    }

    var userSenders = await User.getProfile(dataSender)
    var userRecipients = await User.getProfile(dataRecipient)

    var senderId = userSenders.length == 0 ? "-" : userSenders[0].user_id
    var senderName = userSenders.length == 0 ? "-" : userSenders[0].username
    var senderAvatar = userSenders.length == 0 ? "-" : userSenders[0].avatar

    var recipientId = userRecipients.length == 0 ? "-" : userRecipients[0].user_id
    var recipientName = userRecipients.length == 0 ? "-" : userRecipients[0].username
    var recipientAvatar = userRecipients.length == 0 ? "-" : userRecipients[0].avatar

    await Chat.insertMessage(msgId, chat_id, sender, recipient, text)

    const recipientSocket = clients.get(recipient)

    if (recipientSocket) {

        recipientSocket.send(
            JSON.stringify({ 
                type: "fetch-message",
                data: {
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
                    is_read: true,
                    sent_time: moment().tz("Asia/Jakarta").format('HH:mm'),
                    text: text,
                    type: "text"
                }
            })
        )

    } else {

    // Handle the case when the recipient is not connected
    // You can implement different logic, e.g., store the message for later retrieval
    
    }

    ws.send(
        JSON.stringify({ 
            type: "fetch-message",
            data: {
                id: msgId,
                chat_id: chat_id,
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
    )

}

async function handleContact(ws, message) {
    const { sender } = message

    var contacts = await Chat.getContact(sender)

    var users = []

    for (var i in contacts) {
        var contact = contacts[i]

        users.push({
            id: contact.uid,
            image: contact.image,
            name: contact.name, 
        })
    }    

    ws.send(JSON.stringify({type: 'contact', users}))
}

// Ping all connected clients periodically
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            console.log("Terminating a dead connection");
            return ws.terminate(); // Close the connection if no pong received
        }

        ws.isAlive = false;
        ws.ping(); // Send a ping
    });
}, PING_INTERVAL);

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

async function leave(user_id) {
    for (const socket of clients.values()) {
        socket.send(JSON.stringify({ type: 'leave', user_id: user_id }))
    }
}
  
server.listen(process.env.PORT, function () {
    console.log(`Listening on port ${process.env.PORT}`)
})