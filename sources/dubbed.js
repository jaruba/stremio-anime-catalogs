const needle = require('needle')
const async = require('async')
const cheerio = require('cheerio')
const helpers = require('../helpers')
const mapping = require('../mapping')
const fs = require('fs')
const path = require('path')
const addonConfig = require('../config')
needle.defaults(helpers.needleDefaults)

const dubbedUrl = 'https://raw.githubusercontent.com/MAL-Dubs/MAL-Dubs/main/data/dubInfo.json'

let dubbedIds = []

try {
    dubbedIds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'dubbed_ids.json')))
} catch(e) {
    dubbedIds = []
}

const populate = () => {
    helpers.log('dubbed', 'Fetching dubbed ids')
    needle.get(dubbedUrl, (err, resp, body) => {
        if (!err) {
            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body)
                } catch(e) {}
            }
            if (((body || {}).dubbed || []).length) {
                helpers.log('dubbed', 'Successfully fetched dubbed MAL IDs, processing list')
                const tempIds = []
                const dubbedIdsQueue = async.queue((task, cb) => {
                    const getKitsuId = async () => {
                        const resp = await mapping.toKitsuId({ mal: task.id })
                        if (resp.kitsuId) {
                            helpers.log('dubbed', 'Matched MAL ID ' + task.id + ' to Kitsu ID ' + resp.kitsuId)
                            tempIds.push(resp.kitsuId)
                        }
                        setTimeout(() => {
                            cb()
                        }, resp.fromCache ? 0 : 1 * 1000)
                    }
                    getKitsuId()
                }, 1)
                dubbedIdsQueue.drain(function() {
                    if (tempIds.length) {
                        dubbedIds = tempIds
                        helpers.log('dubbed', 'Finished, saving ' + dubbedIds.length + ' dubbed IDs to local file')
                        fs.writeFileSync(path.join(__dirname, '..', 'db', 'dubbed_ids.json'), JSON.stringify(dubbedIds))
                    } else {
                        helpers.log('dubbed', 'Something went wrong, the dubbed ids list came out empty')
                    }
                })
                body.dubbed.forEach(el => {
                    dubbedIdsQueue.push({ id: el })
                })
                return
            }
        }
        helpers.log('dubbed', 'Failed fetching dubbed MAL IDs')
    })
    setTimeout(() => {
        populate()
    }, addonConfig.listUpdateInterval)
}

const isDubbed = (kitsuId) => {
    return kitsuId ? dubbedIds.includes(kitsuId) : false
}

populate()

module.exports = isDubbed