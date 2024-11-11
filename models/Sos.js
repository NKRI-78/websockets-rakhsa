
const conn = require('../configs/db')

module.exports = {

    findById: (sosId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT user_id FROM sos WHERE uid = ?`

            conn.query(query, [sosId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    broadcast: (sosId, userId, location, country, time) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO sos
            (uid, user_id, title, location, country, time) 
            VALUES (?, ?, ?, ?, ?, ?)`

            conn.query(query, [sosId, userId, "Emergency", location, country, time], (e, result) => {
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
            const query = `UPDATE sos SET is_confirm = ?, 
            user_agent_id = ? 
            WHERE uid = ?`

            conn.query(query, [1, userAgentId, sosId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    }
    

}