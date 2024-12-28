
const conn = require('../configs/db')

module.exports = {

    findById: (sosId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT s.user_id, s.user_agent_id, sat.name AS status
            FROM sos s
            INNER JOIN sos_activity_types sat ON sat.id = s.sos_activity_type 
            WHERE s.uid = ?`

            conn.query(query, [sosId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    broadcast: (sosId, userId, location, media, sosType, lat, lng, country, time, platformType) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO sos
            (uid, user_id, title, location, media, sos_type, lat, lng, country, time, platform_type) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

            conn.query(query, [sosId, userId, "Emergency", location, media, sosType, lat, lng, country, time, platformType], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    updateBroadcast: (sosId) => {
        return new Promise((resolve, reject) => {
            const query = `UPDATE sos SET created_at = NOW() WHERE uid = ?`

            conn.query(query, [sosId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    checkIsSosProccess: (userId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT uid FROM sos WHERE user_id = ? AND sos_activity_type = 3`

            conn.query(query, [userId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    checkExpireSos: () => {
        return new Promise((resolve, reject) => {
            const query = `SELECT uid 
            FROM sos 
            WHERE created_at < NOW() - INTERVAL 1 MINUTE 
            AND sos_activity_type = 1`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    moveSosToClosed: (sosId) => {
        return new Promise((resolve, reject) => {
            const query = `UPDATE sos SET sos_activity_type = 5 WHERE uid = ?`

            conn.query(query, [sosId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    updateExpireMessages: (chatId) => {
        return new Promise ((resolve, reject) => {
            var query = `UPDATE messages SET is_expired = 1 WHERE chat_id = ?`

            conn.query(query, [chatId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    moveSosToResolved: (sosId) => {
        return new Promise((resolve, reject) => {
            const query = `UPDATE sos SET sos_activity_type = 4 WHERE uid = ?`

            conn.query(query, [sosId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    approvalConfirm: (sosId, userAgentId) => {
        return new Promise((resolve, reject) => {
            const query = `UPDATE sos SET sos_activity_type = ?, 
            user_agent_id = ? 
            WHERE uid = ?`

            conn.query(query, [3, userAgentId, sosId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    }
    

}