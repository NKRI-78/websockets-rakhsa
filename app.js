require("dotenv").config()

const { v4: uuidv4 } = require('uuid')

const { createServer } = require('http')
const WebSocketServer = require('ws')

const express = require('express')
const moment = require('moment')

const Chat = require("./models/Chat")
const Sos = require("./models/Sos")
const User = require("./models/User")

const app = express()

const server = createServer(app)
 
const wss = new WebSocketServer.Server({ server })

const clients = new Map()

wss.on("connection", (ws, request) => {
    const clientIp = request.socket.remoteAddress

    console.log(`[WebSocket] Client with IP ${clientIp} has connected`)

    ws.on("message", message => {

        const parsedMessage = JSON.parse(message)

        switch (parsedMessage.type) {
            case 'handle': 
                handleSos(ws, parsedMessage)
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

async function handleSos(ws, message) {
    const { user_id, media, location, lat, lng, country, time } = message   

    const agent = clients.get("0f9815b3-01a2-4350-8679-2e9b8b1637b7")

    const sender = await User.getProfile(user_id)

    var sosId = uuidv4()

    if(agent) {


        var username = sender.length == 0 ? "-" : sender[0].username
        
        await Sos.broadcast(
            sosId, 
            user_id,
            media,
            location,
            lat, 
            lng,
            country,
            time
        )

        agent.send(JSON.stringify({
            type: "sos",
            id: sosId,
            username: username,
            location: location,
            media: media,
            time: time
        }))

    } else {

        await Sos.broadcast(
            sosId, 
            user_id,
            location,
            media,
            lat,
            lng,
            country,
            time
        )

    }
} 

async function handleConfirmSos(ws, message) { 
    const { sos_id, user_agent_id } = message

    const sos = await Sos.findById(sos_id)

    const broadcastToSender = clients.get(sos[0].user_id)

    var senderId = sos[0].user_id
    var userAgentId = user_agent_id

    const chatId = uuidv4()
      
    if(broadcastToSender) {
        broadcastToSender.send(JSON.stringify({
            "type": "confirm-sos",
            "chat_id": chatId,
            "sender_id": senderId,
            "recipient_id": user_agent_id
        }))
    }

    await Chat.insertChat(chatId, senderId, userAgentId)

    await Sos.approvalConfirm(sos_id, userAgentId)

    ws.send(JSON.stringify({
        "type": "confirm-sos",
        "chat_id": chatId,
        "sender_id": senderId,
        "recipient_id": user_agent_id,
        "is_confirm": true
    }))
}

async function handleJoin(ws, message) {
    const { user_id } = message

    console.log(`user_id ${user_id} join`)

    clients.set(user_id, ws)

    for (const socket of clients.values()) {
        socket.send(JSON.stringify({ type: "user_online", user_id: user_id }))
    }
}

async function handleLeave(_, message) {
    const { user_id } = message

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

    await Chat.insertMessage(msgId, chat_id, sender, recipient, text)
  
    const recipientSocket = clients.get(recipient)

    if (recipientSocket) {

        recipientSocket.send(
            JSON.stringify({ 
                type: "message",
                data: {
                    id: msgId,
                    chat_id: chat_id,
                    user: {
                        id: userRecipients.length == 0 ? "-" : userRecipients[0].user_id,
                        name: userRecipients.length == 0 ? "-" : userRecipients[0].username, 
                        avatar: userRecipients.length == 0 ? "-" : userRecipients[0].avatar,
                        is_me: false,
                    },
                    sender: {
                        id: userSenders.length == 0 ? "-" : userSenders[0].user_id,
                    },
                    is_read: true,
                    sent_time: moment().format('HH:mm'),
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
            type: "message",
            data: {
                id: msgId,
                chat_id: chat_id,
                user: {
                    id: userSenders.length == 0 ? "-" : userSenders[0].user_id,
                    name: userSenders.length == 0 ? "-" : userSenders[0].username, 
                    avatar: userSenders.length == 0 ? "-" : userSenders[0].avatar,
                    is_me: true,
                },
                sender: {
                    id: userSenders.length == 0 ? "-" : userSenders[0].user_id,
                },
                is_read: true,
                sent_time: moment().format('HH:mm'),
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

        var data = {
            user_id: user_id,
            is_online: 0
        }

        // await User.assignActivity(data)
        
        socket.send(JSON.stringify({ type: 'leave', user_id: user_id }))
    }
}
  
server.listen(process.env.PORT, function () {
    console.log(`Listening on port ${process.env.PORT}`)
})