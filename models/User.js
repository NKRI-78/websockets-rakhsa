const conn = require('../configs/db')

module.exports = {

    getProfile: (data) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT uo.last_active, uo.is_online, p.user_id, p.avatar, p.fullname AS name
            FROM profiles p
            LEFT JOIN user_onlines uo ON uo.user_id = p.user_id
            WHERE p.user_id = ?`

            const values = [data.user_id]

            conn.query(query, values, (e, result) => {
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
            VALUES ('${data.user_id}', '${data.is_online}', NOW()) 
            ON DUPLICATE KEY UPDATE last_active = NOW(), is_online = ${data.is_online}`

            conn.query(query, (e, result) => {
                if(e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    }

}