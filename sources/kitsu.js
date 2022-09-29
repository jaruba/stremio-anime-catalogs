const helpers = require('../helpers')
const async = require('async')
const addonConfig = require('../config')
const fs = require('fs')
const path = require('path')
const needle = require('needle')
needle.defaults(helpers.needleDefaults)
const isDubbed = require('./dubbed')

const config = {
    skipSize: 50,
    maxSkip: 3000,
    lists: {
        'Top Airing': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-airing', // max: 200 (no results after this)
        'Most Popular': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-popular', // max: ?? (no known limit)
        'Highest Rated': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-rating', // max: ?? (no known limit)
        'Newest': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-newest', // max: ?? (no known limit)
    }
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
    try {
        staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'kitsu_' + helpers.serialize(key) + '.json')))
    } catch(e) {
        staticLists[helpers.serialize(key)] = []
    }
})

module.exports = {
    name: 'Kitsu',
	catalogs: Object.keys(config.lists),
    handle: (listKey, skip, genre, onlyDubs) => {
        const fullList = staticLists[listKey] || []
        let filteredList = fullList
        if (genre) {
            filteredList = filteredList.filter(el => (el.genres || []).includes(genre))
        }
        if (onlyDubs) {
            filteredList = filteredList.filter(el => isDubbed(parseInt((el.id || '').replace('kitsu:',''))))
        }
        if (skip) {
            filteredList = filteredList.slice(skip, skip + pageSize)
        } else {
            filteredList = filteredList.slice(0, pageSize)
        }
        return { metas: filteredList }
    }
}

const populateQueue = async.queue((task, cb) => {
    let tempList = []
    const finishedList = () => {
        staticLists[task.key] = tempList
        fs.writeFileSync(path.join(__dirname, '..', 'db', 'kitsu_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
        setTimeout(() => { cb() }, addonConfig.kitsuCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('kitsu', '---> Finished all lists for kitsu')
    }
    const pageGet = (url, skip) => {
        const pageUrl = url + (skip ? '/skip=' + skip : '') + '.json'
        helpers.log('kitsu', 'getting page url: ' + pageUrl)
        needle.get(pageUrl, (err, resp, body) => {
            if (!err && ((body || {}).metas || []).length) {
                tempList = tempList.concat(body.metas)
                if (skip < config.maxSkip) {
                    setTimeout(() => {
                        pageGet(task.url, skip + config.skipSize)
                    }, addonConfig.kitsuCooldown)
                } else {
                    // finished list
                    helpers.log('kitsu', '---')
                    helpers.log('kitsu', '---')
                    helpers.log('kitsu', 'finished list by reaching max skip allowed: ' + config.maxSkip)
                    finishedList()
                }
            } else {
                helpers.log('kitsu', '---')
                helpers.log('kitsu', '---')
                if (!body || err) {
                    console.log('err or empty body in kitsu')
                    console.log(err)
                }
                helpers.log('kitsu', 'warning: could not get page: ' + pageUrl)
                helpers.log('kitsu', 'waiting 2s and skipping current list')
                finishedList()
            }
        })
    }
    const firstSkip = 0
    pageGet(task.url, firstSkip)
}, 1)

const populate = () => {
    Object.keys(config.lists).forEach(key => {
        const url = config.lists[key]
        populateQueue.push({ key: helpers.serialize(key), url })
    })
    setTimeout(() => {
        populate()
    }, addonConfig.listUpdateInterval)
}

if (addonConfig.scanOnStart)
    populate()
