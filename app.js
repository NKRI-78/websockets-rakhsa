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
            case 'sos':
                handleSos(ws, parsedMessage)
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
    const { user_id, location, country } = message   

    const agent = clients.get("0f9815b3-01a2-4350-8679-2e9b8b1637b7")

    const sender = await User.getProfile(user_id)

    if(agent) {

        var sosId = uuidv4()

        var time = moment().format("HH:mm");
        
        await Sos.broadcast(
            sosId, 
            user_id,
            location,
            country,
            time
        )

        agent.send(JSON.stringify({
            type: "sos",
            id: sosId,
            username: sender.length == 0 
            ? '-' 
            : sender[0].username,
            location: location,
            time: time
        }))
        
    }
} 

async function handleJoin(ws, message) {
    const { user_id } = message

    console.log(`user_id ${user_id} join`)

    // Check if the user is already connected
    if (clients.has(user_id)) {
      // Close the connection to prevent duplicate connections
      ws.send(JSON.stringify({ type: 'error', message: 'User already connected.' }))
      ws.close()
      return
    }
  
    // Store the user's WebSocket connection
    clients.set(user_id, ws)

    // var data = {
    //     user_id: user_id,
    //     is_online: 1
    // }

    // await User.assignActivity(data)

    for (const socket of clients.values()) {
        socket.send(JSON.stringify({ type: "user_online", user_id: user_id }))
    }
}

async function handleLeave(_, message) {
    const { user_id } = message

    var data = {
        user_id: user_id,
        is_online: 0
    }

    // await User.assignActivity(data)
  
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
    const { sender, recipient, text } = message

    var chatId = uuidv4()
    var msgId = uuidv4()

    var dataSender = {
        user_id: sender
    }

    var dataRecipient = {
        user_id: recipient
    }

    var userSenders = await User.getProfile(dataSender)

    var userRecipients = await User.getProfile(dataRecipient)

    var conversations = await Chat.checkConversation(sender, recipient)

    if(conversations.length == 0) {
        await Chat.insertChat(chatId, sender, recipient)
    } else {
        chatId = conversations[0].uid
    }

    var recipients = await Chat.checkOnScreen(chatId, recipient)

    var ack =  recipients.length == 0 ? 2 : recipients[0].state == 1 ? 1 : 2

    await Chat.insertMessage(msgId, chatId, sender, recipient, text, ack)
  
    // Check if the recipient is connected
    const recipientSocket = clients.get(recipient)

    if (recipientSocket) {

        recipientSocket.send(
            JSON.stringify({ 
                type: "message",
                data: {
                    id: msgId,
                    chat_id: chatId,
                    user: {
                        id: userRecipients.length == 0 ? "-" : userRecipients[0].user_id,
                        name: userRecipients.length == 0 ? "-" : userRecipients[0].name, 
                        avatar: userRecipients.length == 0 ? "-" : userRecipients[0].avatar,
                        is_me: false,
                    },
                    sender: {
                        id: userSenders.length == 0 ? "-" : userSenders[0].user_id,
                    },
                    is_read: recipients.length == 0 ? false : recipients[0].state == 1 ? true : false,
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

    // Send the message back to the sender
    ws.send(
        JSON.stringify({ 
            type: "message",
            data: {
                id: msgId,
                chat_id: chatId,
                user: {
                    id: userSenders.length == 0 ? "-" : userSenders[0].user_id,
                    name: userSenders.length == 0 ? "-" : userSenders[0].name, 
                    avatar: userSenders.length == 0 ? "-" : userSenders[0].avatar,
                    is_me: true,
                },
                sender: {
                    id: userSenders.length == 0 ? "-" : userSenders[0].user_id,
                },
                is_read: recipients.length == 0 ? false : recipients[0].state == 1 ? true : false,
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