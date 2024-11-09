const { jwtDecode } = require("jwt-decode")

module.exports = {

    decodeToken: (authHeader) => {
        const token = authHeader && authHeader.split(' ')[1]
        const decoded = jwtDecode(token)
    
        return decoded
    }

}