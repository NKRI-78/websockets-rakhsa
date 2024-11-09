const bcrypt = require("bcryptjs")
const moment = require('moment')

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
        return moment(date).locale('id').format('yyyy/MM/DD')
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

    encryptPassword: async (password) => {
        const salt = await bcrypt.genSalt(10)
        var passwordHash = await bcrypt.hash(password, salt)
        return passwordHash
    },

    checkPasswordEncrypt: async(password, passwordOld) => {
        var isValid = await bcrypt.compare(password, passwordOld)
        return isValid
    },

}