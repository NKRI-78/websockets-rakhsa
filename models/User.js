const conn = require('../configs/db')

module.exports = {

    getProfile: (userId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT p.user_id, p.avatar, p.fullname AS username
            FROM profiles p
            WHERE p.user_id = ?`

            conn.query(query, [userId], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    assignActivity: (data) => {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO user_onlines (user_id, is_online, last_active) 
            VALUES (?, ?, NOW()) 
            ON DUPLICATE KEY UPDATE last_active = NOW(), is_online = ?`

            conn.query(query, [data.user_id, data.is_online, data.is_online], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    }

}