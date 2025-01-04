const moment = require('moment-timezone')

const crypto = require('crypto')

const axios = require('axios')

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

moment.updateLocale('id', {
    relativeTime : {
      future : "dalam %s",  // e.g., "dalam 5 menit" (in 5 minutes)
      past : "%s yang lalu", // e.g., "5 menit yang lalu" (5 minutes ago)
      s : "beberapa detik", // a few seconds
      ss : "%d detik", // 10 seconds
      m : "semenit", // a minute
      mm : "%d menit", // 10 minutes
      h : "1 jam", // an hour
      hh : "%d jam", // 10 hours
      d : "sehari", // a day
      dd : "%d hari", // 10 days
      M : "sebulan", // a month
      MM : "%d bulan", // 10 months
      y : "setahun", // a year
      yy : "%d tahun" // 10 years
    }
})
  
module.exports = {

    countryCompareContinent(country) {
        var val = ""
        
        switch(country.trim().toLowerCase()) {
            case "unitedstates": 
                val = "Amerika Utara"
            break;
            case "japan": 
                val = "Asia"
            break;
        }

        return val
    },  

    fdate: (date) => {
        return moment(date).tz("Asia/Jakarta").format('dddd, d MMMM YYYY')
    },

    formatTime() {
        return moment().format('HH:mm')
    },

    formatDateTimeAgo (date) {
        return moment(date).tz("Asia/Jakarta").fromNow()
    },

    formatYearAndMonth(date) {
        return moment(date).tz("Asia/Jakarta").format('yyyy/MM')
    },

    formatDate: (date) => {
        return moment(date).tz("Asia/Jakarta").format('yyyy-MM-DD')
    },

    formatDateWithSubtractDays: (date, d) => {
        return moment(date).subtract(d, 'days').tz("Asia/Jakarta").format('yyyy/MM/DD')
    },

    formatDateWithSeconds: (date) => {
        return moment(date).tz("Asia/Jakarta").format('yyyy/MM/DD H:mm:ss')
    },

    time: () => {
        return moment().tz("Asia/Jakarta").format('HH:mm')
    },

    formatDateByName: (date) => {
        return moment(date).tz("Asia/Jakarta").format('DD MMMM YYYY')
    },

    convertRp: (val) => {
        return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(val) 
    },

    makeid: (val) => {
        var result           = ''
        var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        var charactersLength = characters.length
        for ( var i = 0; i < val; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength))
        }
        return result
    },

    validateEmail: (email) => {
        return String(email)
        .toLowerCase()
        .match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)
    },

    sendFCM: async (title, body, token, type) => {
        await axios.post('https://api-fcm.inovatiftujuh8.com/api/v1/firebase/fcm', {
            token: token,
            title: title,
            body: body,
            broadcast_type: type
        })
    },

    generateNanoId(length = 21) {
        const id = [];
        const alphabetLength = alphabet.length

        // Generate a random ID
        for (let i = 0; i < length; i++) {
            const randomValue = crypto.randomInt(0, alphabetLength)
            id.push(alphabet[randomValue])
        }

        return id.join('')
    }
}