const conn = require('../configs/db')

module.exports = {

    checkOnScreen: (chatId, userId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT os.state 
            FROM on_screens os
            WHERE os.user_id = ?
            AND os.chat_id = ?`

            conn.query(query, [userId, chatId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    assignOnScreen: (chatId, userId, state) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO on_screens (chat_id, user_id, state) 
            VALUES (?, ?, ?)`

            conn.query(query, [chatId, userId, state == "on" ? 1 : 0], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    updateAckRead: (chatId, userId) => {
        return new Promise((resolve, reject) => {
            const query = `UPDATE messages SET ack = 1
            WHERE chat_id = ? AND receiver_id = ?`

            conn.query(query, [chatId, userId, userId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    updateOnScreen: (chatId, userId, state) => {
        return new Promise((resolve, reject) => {
            const query = `UPDATE on_screens SET state = ? WHERE chat_id = ? AND user_id = ?`

            conn.query(query, [state == "on" ? 1 : 0, chatId, userId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    checkConversation: (senderId, receiverId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT uid FROM chats 
            WHERE sender_id = '${senderId}' AND receiver_id = '${receiverId}'
            OR receiver_id = '${senderId}' AND sender_id = '${receiverId}'`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getChats: (senderId) => {
        return new Promise ((resolve, reject) => {
            const query = `SELECT c.uid AS chat_id, p.user_id, p.fullname, p.avatar
            FROM chats c, users u
            INNER JOIN profiles p ON p.user_id = u.uid
            WHERE  
            CASE 
                WHEN c.sender_id = '${senderId}'
                THEN c.receiver_id = p.user_id
                WHEN c.receiver_id = '${senderId}'
                THEN c.sender_id = p.user_id
            END`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getChat: (chatId, receiverId) => {
        return new Promise ((resolve, reject) => {
            const query = `SELECT c.uid AS chat_id, p.user_id, p.fullname, p.avatar,
            uo.is_online, uo.last_active
            FROM chats c, users u
            INNER JOIN profiles p ON p.user_id = u.uid
            INNER JOIN user_onlines uo ON p.user_id = uo.user_id
            WHERE  
            CASE 
                WHEN c.sender_id = '${receiverId}'
                THEN c.receiver_id = p.user_id
                WHEN c.receiver_id = '${receiverId}'
                THEN c.sender_id = p.user_id
            END
            AND c.uid = '${chatId}'` 
            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getContact: (userId) => {
        return new Promise ((resolve, reject) => {
            const query = `SELECT u.uid, u.image, u.name, ut.token, u.is_online, u.last_active 
            FROM users u
            LEFT JOIN user_tokens ut ON ut.user_id = u.uid
            WHERE u.uid != '${userId}'`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getUsers: (userId) => {
        return new Promise ((resolve, reject) => {
            const query = `SELECT u.uid, u.image, u.name, ut.token, u.is_online, u.last_active 
            FROM users u
            LEFT JOIN user_tokens ut ON ut.user_id = u.uid
            WHERE u.uid = '${userId}'`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result[0])
                }
            })
        })
    },

    getLastMessage: (chatId) => {
        return new Promise ((resolve, reject) => {
            const query = `SELECT m.uid, m.content, 
            mt.name type, m.created_at, ma.name AS ack, m.sender_id
            FROM messages m 
            INNER JOIN message_acks ma ON ma.id = m.ack
            INNER JOIN chats c ON c.uid = m.chat_id
            INNER JOIN message_types mt ON mt.id = m.type
            WHERE c.uid = ? 
            ORDER BY m.created_at DESC 
            LIMIT 1`

            const values = [chatId]

            conn.query(query, values, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getMessageUnread: (chatId) => {
        return new Promise ((resolve, reject) => {
            const query = `SELECT m.uid
            FROM messages m 
            INNER JOIN chats c ON c.uid = m.chat_id
            INNER JOIN message_types mt ON mt.id = m.type
            WHERE c.uid = ? AND m.ack = 2`

            const values = [chatId]

            conn.query(query, values, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getMessages: (chatId, sender) => {
        return new Promise ((resolve, reject) => {
            // const query = `SELECT 
            // m.uid,
            // u.name AS sender_name,
            // m.sender_id, m.receiver_id,
            // m.sent_time, m.content, m.image, 
            // emt.name type, m.is_read
            // FROM messages m 
            // LEFT JOIN products p ON m.product_id = p.uid
            // LEFT JOIN soft_delete_messages sdm ON sdm.message_id = m.uid
            // INNER JOIN users u ON m.sender_id = u.uid
            // INNER JOIN chats c ON c.uid = m.chat_id
            // INNER JOIN enum_message_types emt ON emt.uid = m.type
            // WHERE c.uid = '${chatId}' 
            // AND (m.sender_id = '${sender}' 
            // OR m.receiver_id = '${sender}')
            // AND (sdm.message_id IS NULL OR sdm.user_id != '${sender}')
            // ORDER BY m.sent_time DESC`

            const query = `SELECT 
            p.fullname AS sender_name,
            p.avatar,
          	m.content, 
            m.created_at,
            mt.name type, m.uid AS msg_id, ma.name AS ack, c.uid AS chat_id, m.sender_id, m.receiver_id, m.created_at
            FROM messages m 
            INNER JOIN profiles p ON m.sender_id = p.user_id 
            INNER JOIN chats c ON c.uid = m.chat_id
            INNER JOIN message_acks ma ON ma.id = m.ack
            INNER JOIN message_types mt ON mt.id = m.type
            WHERE c.uid = '${chatId}' 
            AND (m.sender_id = '${sender}' 
            OR m.receiver_id = '${sender}')
            ORDER BY m.created_at DESC`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    checkSoftDeleteMessage: (messageId, userId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT IF(EXISTS(
            SELECT *
            FROM soft_delete_messages
            WHERE message_id = '${messageId}'), 1, 0) AS isExist`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result[0])
                }
            })
        })
    },

    truncateSoftDeleteMessage: (messageId) => {
        return new Promise((resolve, reject) => {
            const query = `DELETE FROM soft_delete_messages WHERE message_id = '${messageId}'`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    softDeleteMessage: (uid, messageId, userId) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO soft_delete_messages (uid, message_id, user_id) VALUES 
            ('${uid}', '${messageId}', '${userId}')`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    deleteMessage: (messageId) => {
        return new Promise ((resolve, reject) => {
            const query = `DELETE FROM messages WHERE uid = '${messageId}'`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    insertChat: (chatId, sender, recipient) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO chats (uid, sender_id, receiver_id) 
            VALUES (?, ?, ?)`

            conn.query(query, [chatId, sender, recipient], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    insertActivities: (uid, chatId, userId) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO chat_activities (uid, user_id, chat_id, is_active) 
            VALUES ('${uid}', '${userId}', '${chatId}', '0') ON DUPLICATE KEY UPDATE is_active = 0`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    insertMessage: (msgId, chatId, sender, recipient, content) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO messages (uid, chat_id, sender_id, receiver_id, content, ack, type)
            VALUES (?, ?, ?, ?, ?, ?, 1)`
            
            const values = [msgId, chatId, sender, recipient, content, 1]

            conn.query(query, values, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        }) 
    },

    viewMessage: (chatId, userId, isRead) => {
        return new Promise((resolve, reject) => {
            const query = `UPDATE messages SET is_read = '${isRead}'
            WHERE receiver_id = '${userId}' 
            AND chat_id = '${chatId}' 
            AND is_read = 0`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },
    
}