
const conn = require('../configs/db')

module.exports = {

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

}