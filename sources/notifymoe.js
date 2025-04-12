const needle = require('needle')
const async = require('async')
const cheerio = require('cheerio')
const helpers = require('../helpers')
const mapping = require('../mapping')
const fs = require('fs')
const path = require('path')
const addonConfig = require('../config')
needle.defaults(helpers.needleDefaults)
const isDubbed = require('./dubbed')

const config = {
//	linkPattern: 'https:\\/\\/notify\\.moe\\/anime\\/(.*)',
	linkPattern: '\\/anime\\/(.*)',
    skipSize: 1,
    maxSkip: 1,
    lists: {
        'Airing Now': 'https://notify.moe/explore/anime/2024/autumn/current/tv', // max: 1
    }
}

const maxSkip = {
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
	try {
		staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'notifymoe_' + helpers.serialize(key) + '.json')))
	} catch(e) {
		staticLists[helpers.serialize(key)] = []
	}
})

module.exports = {
	name: 'Notify.Moe',
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
	const tempList = []
    const finishedList = () => {
		staticLists[task.key] = tempList
        fs.writeFileSync(path.join(__dirname, '..', 'db', 'notifymoe_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
		setTimeout(() => { cb() }, addonConfig.malCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('notifymoe', '---> Finished all lists for notifymoe')
    }
	const pageGet = (url, skip) => {
		const pageUrl = url.replace('{skip}', skip + '')
		helpers.log('notifymoe', 'getting page url: ' + pageUrl)
		needle.get(pageUrl, (err, resp, body) => {
			if (!err && body) {
				const $ = cheerio.load(body)
				let lastNotifyMoeId = 0
				if ($("#container #load-more-target.anime-grid div.anime-grid-cell > a").length) {
					$("#container #load-more-target.anime-grid div.anime-grid-cell > a").each((ij, el) => {
						const href = $(el)
						const title = href.find('div.image-title').find('div.image-title-text').text().trim()
						const titleUrl = href.attr('href')
						const pattern = new RegExp(config.linkPattern, 'gi')
						const matches = pattern.exec(titleUrl)
						if ((matches || []).length) {
							const notifyMoeId = matches[1]
							lastNotifyMoeId = notifyMoeId
							mapping.mapper({ query: title, opts: { notifymoe: notifyMoeId } }, (kitsuId, kitsuMeta, notifyMoeId) => {
								if (kitsuId && kitsuMeta) {
									tempList.push(kitsuMeta);
								}
								if (notifyMoeId === lastNotifyMoeId) {
									// finished page
									helpers.log('notifymoe', '---')
									helpers.log('notifymoe', 'finished page')
									if (skip < (task.maxSkip || config.maxSkip) && url.includes('{skip}')) {
										setTimeout(() => {
											pageGet(task.url, skip + config.skipSize)
										}, addonConfig.malCooldown)
									} else {
										// finished list
										helpers.log('notifymoe', '---')
										helpers.log('notifymoe', '---')
										helpers.log('notifymoe', 'finished list by reaching max skip allowed (or list does not support skip): ' + (task.maxSkip || config.maxSkip))
										finishedList()
									}
								}
							})
						}
					})
				} else {
					// no items on page, presume pagination ended
					helpers.log('notifymoe', '---')
					helpers.log('notifymoe', '---')
					helpers.log('notifymoe', 'no items on page, presume pagination ended')
					finishedList()
				}
			} else {
				helpers.log('notifymoe', '---')
				helpers.log('notifymoe', '---')
				console.log('err or empty body in notifymoe')
				console.log(err)
				helpers.log('notifymoe', 'warning: could not get page: ' + pageUrl)
				helpers.log('notifymoe', 'waiting 2s and skipping current list')
				finishedList()
			}
		})
	}
	const firstSkip = 1
	pageGet(task.url, firstSkip)
}, 1)

const populate = () => {
	Object.keys(config.lists).forEach(key => {
		const url = config.lists[key]
		populateQueue.push({ key: helpers.serialize(key), url, maxSkip: maxSkip[key] })
	})
	setTimeout(() => {
		populate()
	}, addonConfig.listUpdateInterval)
}

if (addonConfig.scanOnStart) {
	setTimeout(() => {
		populate()
	}, 20 * 1000) // wait 20s for the id lists to update
} else {
	setTimeout(() => {
		populate()
	}, addonConfig.listUpdateInterval)
}
