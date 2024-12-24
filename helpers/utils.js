const moment = require('moment')

const axios = require('axios')

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
        return moment(date).locale('id').format('dddd, d MMMM YYYY')
    },

    formatDateTimeAgo (date) {
        return moment(date).locale('id').fromNow()
    },

    formatYearAndMonth(date) {
        return moment(date).locale('id').format('yyyy/MM')
    },

    formatDate: (date) => {
        return moment(date).locale('id').format('yyyy-MM-DD')
    },

    formatDateWithSubtractDays: (date, d) => {
        return moment(date).subtract(d, 'days').locale('id').format('yyyy/MM/DD')
    },

    formatDateWithSeconds: (date) => {
        return moment(date).locale('id').format('yyyy/MM/DD H:mm:ss')
    },

    formatDateByName: (date) => {
        return moment(date).locale('id').format('DD MMMM YYYY')
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
}