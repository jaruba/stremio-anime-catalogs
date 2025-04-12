const needle = require('needle')
const async = require('async')
const cheerio = require('cheerio')
const helpers = require('../helpers')
const mapping = require('../mapping')
const fs = require('fs')
const path = require('path')
const isDubbed = require('./dubbed')
const addonConfig = require('../config')
needle.defaults(helpers.needleDefaults)

const config = {
    linkPattern: '\\/anime\\/([0-9]+)',
    skipSize: 1,
    maxSkip: 27,
    lists: {
        'Popular': 'https://anidb.net/latest/anime/popular',
        'Latest Started': 'https://anidb.net/anime/season',
        'Latest Ended': 'https://anidb.net/anime/season/?calendar.mode=1',
        'Best of 10s': 'https://anidb.net/anime/?airdate.end=2020-01-01&airdate.start=2010-01-01&airing=2&do.search=1&h=1&orderby.rating=0.2&votes=1000&page={skip}', // max: 29 (no results after this page)
        'Best of 00s': 'https://anidb.net/anime/?airdate.end=2010-01-01&airdate.start=2000-01-01&airing=2&do.search=1&h=1&orderby.rating=0.2&votes=1000&page={skip}', // max: 27 (no results after this page)
        'Best of 90s': 'https://anidb.net/anime/?airdate.end=2000-01-01&airdate.start=1990-01-01&airing=2&do.search=1&h=1&orderby.rating=0.2&votes=1000&page={skip}', // max: 5 (no results after this page)
        'Best of 80s': 'https://anidb.net/anime/?airdate.end=1990-01-01&airdate.start=1980-01-01&airing=2&do.search=1&h=1&orderby.rating=0.2&votes=1000&page={skip}', // max: 1 (no results after this page)
    }
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
	try {
		staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'anidb_' + helpers.serialize(key) + '.json')))
	} catch(e) {
		staticLists[helpers.serialize(key)] = []
	}
})

module.exports = {
	name: 'AniDB',
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
		fs.writeFileSync(path.join(__dirname, '..', 'db', 'anidb_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
		setTimeout(() => { cb() }, addonConfig.anidbCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('anidb', '---> Finished all lists for anidb')
    }
	const pageGet = (url, skip) => {
		const pageUrl = url.replace('{skip}', skip + '')
		helpers.log('anidb', 'getting page url: ' + pageUrl)
		needle.get(pageUrl, (err, resp, body) => {
			if (!err && body) {
				const $ = cheerio.load(body)
				let lastAnidbId = 0
				let table = $('div.box')
				if (!table.length)
					table = $('.animelist tr')
				if (!table.length)
					table = $('.g_content.latest2_all tr.row')
				if (!table.length)
					table = $('#animelist tr')
				if (table.length) {
					table.each((ij, el) => {
						let titlePart = $(el).find('.name')
						const href = titlePart.find('a')
						const title = href.text().split('\n')[0].trim()
						const titleUrl = href.attr('href')
						let details = $(el).find('td.type')
						if (!details.length)
							details = $(el).find('div.general')
						if (details.length) {
							if (details.text().includes('Music')) {
								// skip "music" type
								helpers.log('anidb', '--- detected "music" type, skipping item "' + title + '"')
								return
							}
						}
						const pattern = new RegExp(config.linkPattern, 'gi')
						const matches = pattern.exec(titleUrl)
						if ((matches || []).length) {
							const anidbId = matches[1]
							lastAnidbId = anidbId
							mapping.mapper({ query: title, opts: { anidb: anidbId } }, (kitsuId, kitsuMeta, anidbId) => {
								if (kitsuId && kitsuMeta) {
									tempList.push(kitsuMeta);
								}
								if (anidbId === lastAnidbId) {
									// finished page
									helpers.log('anidb', '---')
									helpers.log('anidb', 'finished page')
									if (skip < config.maxSkip && url.includes('{skip}')) {
										setTimeout(() => {
											pageGet(task.url, skip + config.skipSize)
										}, addonConfig.anidbCooldown)
									} else {
										// finished list
										helpers.log('anidb', '---')
										helpers.log('anidb', '---')
										helpers.log('anidb', 'finished list by reaching max skip allowed (or list does not support skip): ' + config.maxSkip)
										finishedList()
									}
								}
							})
						}
					})
				} else {
					// no items on page, presume pagination ended
					helpers.log('anidb', '---')
					helpers.log('anidb', '---')
					helpers.log('anidb', 'no items on page, presume pagination ended')
					finishedList()
				}
			} else {
				helpers.log('anidb', '---')
				helpers.log('anidb', '---')
				console.log('err or empty body in anilist')
				console.log(err)
				helpers.log('anidb', 'warning: could not get page: ' + pageUrl)
				helpers.log('anidb', 'waiting 1s and skipping current list')
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

if (addonConfig.scanOnStart) {
	setTimeout(() => {
		populate()
	}, 20 * 1000) // wait 20s for the id lists to update
} else {
	setTimeout(() => {
		populate()
	}, addonConfig.listUpdateInterval)
}
