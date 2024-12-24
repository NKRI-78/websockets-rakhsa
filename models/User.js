const conn = require('../configs/db')

module.exports = {

    getUser: (userId) => {
        return new Promise((resolve, reject) => {
            var query = `SELECT u.uid AS user_id, u.email, p.emergency_contact, p.avatar, p.created_at, p.passport, p.address, p.fullname AS username
                FROM users u
                INNER JOIN profiles p ON u.uid = p.user_id
                WHERE u.uid = ?
            `
            conn.query(query, [userId], (e, result) => {
                if (e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getProfile: (data) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT p.user_id, p.avatar, p.fullname AS username
            FROM profiles p
            WHERE p.user_id = ?`

            conn.query(query, [data.user_id], (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

    getFcm: (data) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT token 
            FROM fcms 
            WHERE user_id = ?`

            conn.query(query, [data.user_id], (e, result) => {
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