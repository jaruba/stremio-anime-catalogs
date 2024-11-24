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
//	linkPattern: 'https:\\/\\/www\\.livechart\\.me\\/anime\\/([0-9]+)',
	linkPattern: '\\/anime\\/([0-9]+)',
    skipSize: 1,
    maxSkip: 200,
    lists: {
        'Popular': 'https://www.livechart.me/rankings/anime?metric=popularity&page={skip}', // max: 455
        'Top Rated': 'https://www.livechart.me/rankings/anime?metric=rating&page={skip}', // max: 217
    }
}

const maxSkip = {
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
	try {
		staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'livechart_' + helpers.serialize(key) + '.json')))
	} catch(e) {
		staticLists[helpers.serialize(key)] = []
	}
})

module.exports = {
	name: 'LiveChart.me',
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
        fs.writeFileSync(path.join(__dirname, '..', 'db', 'livechart_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
		setTimeout(() => { cb() }, addonConfig.malCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('livechart', '---> Finished all lists for livechart')
    }
	const pageGet = (url, skip) => {
		const pageUrl = url.replace('{skip}', skip + '')
		helpers.log('livechart', 'getting page url: ' + pageUrl)
		needle.get(pageUrl, (err, resp, body) => {
			if (!err && body) {
				const $ = cheerio.load(body)
				let lastLivechartId = 0
				if ($("table.lc-table.w-full tr td.w-full.overflow-hidden.whitespace-normal div.line-clamp-2 a.link.link-hover").length) {
					$("table.lc-table.w-full tr td.w-full.overflow-hidden.whitespace-normal div.line-clamp-2 a.link.link-hover").each((ij, el) => {
						const href = $(el)
						const title = href.text().trim()
						const titleUrl = href.attr('href')
						const pattern = new RegExp(config.linkPattern, 'gi')
						const matches = pattern.exec(titleUrl)
						if ((matches || []).length) {
							const livechartId = matches[1]
							lastLivechartId = livechartId
							mapping.mapper({ query: title, opts: { livechart: livechartId } }, (kitsuId, kitsuMeta, livechartId) => {
								if (kitsuId && kitsuMeta) {
									tempList.push(kitsuMeta);
								}
								if (livechartId === lastLivechartId) {
									// finished page
									helpers.log('livechart', '---')
									helpers.log('livechart', 'finished page')
									if (skip < (task.maxSkip || config.maxSkip) && url.includes('{skip}')) {
										setTimeout(() => {
											pageGet(task.url, skip + config.skipSize)
										}, addonConfig.livechartCooldown)
									} else {
										// finished list
										helpers.log('livechart', '---')
										helpers.log('livechart', '---')
										helpers.log('livechart', 'finished list by reaching max skip allowed (or list does not support skip): ' + (task.maxSkip || config.maxSkip))
										finishedList()
									}
								}
							})
						}
					})
				} else {
					// no items on page, presume pagination ended
					helpers.log('livechart', '---')
					helpers.log('livechart', '---')
					helpers.log('livechart', 'no items on page, presume pagination ended')
					finishedList()
				}
			} else {
				helpers.log('livechart', '---')
				helpers.log('livechart', '---')
				console.log('err or empty body in livechart')
				console.log(err)
				helpers.log('livechart', 'warning: could not get page: ' + pageUrl)
				helpers.log('livechart', 'waiting 2s and skipping current list')
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

if (addonConfig.scanOnStart)
	setTimeout(() => {
		populate()
	}, 20 * 1000) // wait 20s for the id lists to update

