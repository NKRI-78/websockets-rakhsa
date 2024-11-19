const conn = require('../configs/db')

module.exports = {

    userAgent: (continent) => {
        return new Promise((resolve, reject) => {
            var query = `SELECT p.user_id 
            FROM profiles p 
            INNER JOIN user_kbris uk ON uk.user_id = p.user_id 
            INNER JOIN continents c ON c.id = uk.continent_id
            WHERE c.name = ?`
            conn.query(query, [continent], (e, result) => {
                if (e) {
                    reject(new Error(e))
                } else {
                    resolve(result)
                }
            })
        })
    },

}