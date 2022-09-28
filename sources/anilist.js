const axios = require('axios')
const async = require('async')
const cheerio = require('cheerio')
const helpers = require('../helpers')
const mapping = require('../mapping')
const fs = require('fs')
const path = require('path')
const addonConfig = require('../config')
const isDubbed = require('./dubbed')

const config = {
    skipSize: 1,
    maxSkip: 40,
    lists: {
        'Trending Now': `query($page:Int = 1 $id:Int $type:MediaType $isAdult:Boolean = false $search:String $format:[MediaFormat]$status:MediaStatus $countryOfOrigin:CountryCode $source:MediaSource $season:MediaSeason $seasonYear:Int $year:String $onList:Boolean $yearLesser:FuzzyDateInt $yearGreater:FuzzyDateInt $episodeLesser:Int $episodeGreater:Int $durationLesser:Int $durationGreater:Int $chapterLesser:Int $chapterGreater:Int $volumeLesser:Int $volumeGreater:Int $licensedBy:[Int]$isLicensed:Boolean $genres:[String]$excludedGenres:[String]$tags:[String]$excludedTags:[String]$minimumTagRank:Int $sort:[MediaSort]=[POPULARITY_DESC,SCORE_DESC]){Page(page:$page,perPage:20){pageInfo{total perPage currentPage lastPage hasNextPage}media(id:$id type:$type season:$season format_in:$format status:$status countryOfOrigin:$countryOfOrigin source:$source search:$search onList:$onList seasonYear:$seasonYear startDate_like:$year startDate_lesser:$yearLesser startDate_greater:$yearGreater episodes_lesser:$episodeLesser episodes_greater:$episodeGreater duration_lesser:$durationLesser duration_greater:$durationGreater chapters_lesser:$chapterLesser chapters_greater:$chapterGreater volumes_lesser:$volumeLesser volumes_greater:$volumeGreater licensedById_in:$licensedBy isLicensed:$isLicensed genre_in:$genres genre_not_in:$excludedGenres tag_in:$tags tag_not_in:$excludedTags minimumTagRank:$minimumTagRank sort:$sort isAdult:$isAdult){id title{romaji english}coverImage{extraLarge large color}startDate{year month day}endDate{year month day}bannerImage season seasonYear description type format status(version:2)episodes duration chapters volumes genres isAdult averageScore popularity nextAiringEpisode{airingAt timeUntilAiring episode}mediaListEntry{id status}studios(isMain:true){edges{isMain node{id name}}}}}}`,
        'Popular This Season': `query($page:Int = 1 $id:Int $type:MediaType $isAdult:Boolean = false $search:String $format:[MediaFormat]$status:MediaStatus $countryOfOrigin:CountryCode $source:MediaSource $season:MediaSeason $seasonYear:Int $year:String $onList:Boolean $yearLesser:FuzzyDateInt $yearGreater:FuzzyDateInt $episodeLesser:Int $episodeGreater:Int $durationLesser:Int $durationGreater:Int $chapterLesser:Int $chapterGreater:Int $volumeLesser:Int $volumeGreater:Int $licensedBy:[Int]$isLicensed:Boolean $genres:[String]$excludedGenres:[String]$tags:[String]$excludedTags:[String]$minimumTagRank:Int $sort:[MediaSort]=[POPULARITY_DESC,SCORE_DESC]){Page(page:$page,perPage:20){pageInfo{total perPage currentPage lastPage hasNextPage}media(id:$id type:$type season:$season format_in:$format status:$status countryOfOrigin:$countryOfOrigin source:$source search:$search onList:$onList seasonYear:$seasonYear startDate_like:$year startDate_lesser:$yearLesser startDate_greater:$yearGreater episodes_lesser:$episodeLesser episodes_greater:$episodeGreater duration_lesser:$durationLesser duration_greater:$durationGreater chapters_lesser:$chapterLesser chapters_greater:$chapterGreater volumes_lesser:$volumeLesser volumes_greater:$volumeGreater licensedById_in:$licensedBy isLicensed:$isLicensed genre_in:$genres genre_not_in:$excludedGenres tag_in:$tags tag_not_in:$excludedTags minimumTagRank:$minimumTagRank sort:$sort isAdult:$isAdult){id title{romaji english}coverImage{extraLarge large color}startDate{year month day}endDate{year month day}bannerImage season seasonYear description type format status(version:2)episodes duration chapters volumes genres isAdult averageScore popularity nextAiringEpisode{airingAt timeUntilAiring episode}mediaListEntry{id status}studios(isMain:true){edges{isMain node{id name}}}}}}`,
        'Upcoming Next Season': `query($page:Int = 1 $id:Int $type:MediaType $isAdult:Boolean = false $search:String $format:[MediaFormat]$status:MediaStatus $countryOfOrigin:CountryCode $source:MediaSource $season:MediaSeason $seasonYear:Int $year:String $onList:Boolean $yearLesser:FuzzyDateInt $yearGreater:FuzzyDateInt $episodeLesser:Int $episodeGreater:Int $durationLesser:Int $durationGreater:Int $chapterLesser:Int $chapterGreater:Int $volumeLesser:Int $volumeGreater:Int $licensedBy:[Int]$isLicensed:Boolean $genres:[String]$excludedGenres:[String]$tags:[String]$excludedTags:[String]$minimumTagRank:Int $sort:[MediaSort]=[POPULARITY_DESC,SCORE_DESC]){Page(page:$page,perPage:20){pageInfo{total perPage currentPage lastPage hasNextPage}media(id:$id type:$type season:$season format_in:$format status:$status countryOfOrigin:$countryOfOrigin source:$source search:$search onList:$onList seasonYear:$seasonYear startDate_like:$year startDate_lesser:$yearLesser startDate_greater:$yearGreater episodes_lesser:$episodeLesser episodes_greater:$episodeGreater duration_lesser:$durationLesser duration_greater:$durationGreater chapters_lesser:$chapterLesser chapters_greater:$chapterGreater volumes_lesser:$volumeLesser volumes_greater:$volumeGreater licensedById_in:$licensedBy isLicensed:$isLicensed genre_in:$genres genre_not_in:$excludedGenres tag_in:$tags tag_not_in:$excludedTags minimumTagRank:$minimumTagRank sort:$sort isAdult:$isAdult){id title{romaji english}coverImage{extraLarge large color}startDate{year month day}endDate{year month day}bannerImage season seasonYear description type format status(version:2)episodes duration chapters volumes genres isAdult averageScore popularity nextAiringEpisode{airingAt timeUntilAiring episode}mediaListEntry{id status}studios(isMain:true){edges{isMain node{id name}}}}}}`,
        'All Time Popular': `query($page:Int = 1 $id:Int $type:MediaType $isAdult:Boolean = false $search:String $format:[MediaFormat]$status:MediaStatus $countryOfOrigin:CountryCode $source:MediaSource $season:MediaSeason $seasonYear:Int $year:String $onList:Boolean $yearLesser:FuzzyDateInt $yearGreater:FuzzyDateInt $episodeLesser:Int $episodeGreater:Int $durationLesser:Int $durationGreater:Int $chapterLesser:Int $chapterGreater:Int $volumeLesser:Int $volumeGreater:Int $licensedBy:[Int]$isLicensed:Boolean $genres:[String]$excludedGenres:[String]$tags:[String]$excludedTags:[String]$minimumTagRank:Int $sort:[MediaSort]=[POPULARITY_DESC,SCORE_DESC]){Page(page:$page,perPage:20){pageInfo{total perPage currentPage lastPage hasNextPage}media(id:$id type:$type season:$season format_in:$format status:$status countryOfOrigin:$countryOfOrigin source:$source search:$search onList:$onList seasonYear:$seasonYear startDate_like:$year startDate_lesser:$yearLesser startDate_greater:$yearGreater episodes_lesser:$episodeLesser episodes_greater:$episodeGreater duration_lesser:$durationLesser duration_greater:$durationGreater chapters_lesser:$chapterLesser chapters_greater:$chapterGreater volumes_lesser:$volumeLesser volumes_greater:$volumeGreater licensedById_in:$licensedBy isLicensed:$isLicensed genre_in:$genres genre_not_in:$excludedGenres tag_in:$tags tag_not_in:$excludedTags minimumTagRank:$minimumTagRank sort:$sort isAdult:$isAdult){id title{romaji english}coverImage{extraLarge large color}startDate{year month day}endDate{year month day}bannerImage season seasonYear description type format status(version:2)episodes duration chapters volumes genres isAdult averageScore popularity nextAiringEpisode{airingAt timeUntilAiring episode}mediaListEntry{id status}studios(isMain:true){edges{isMain node{id name}}}}}}`,
        'Top Anime': `query($page:Int = 1 $id:Int $type:MediaType $isAdult:Boolean = false $search:String $format:[MediaFormat]$status:MediaStatus $countryOfOrigin:CountryCode $source:MediaSource $season:MediaSeason $seasonYear:Int $year:String $onList:Boolean $yearLesser:FuzzyDateInt $yearGreater:FuzzyDateInt $episodeLesser:Int $episodeGreater:Int $durationLesser:Int $durationGreater:Int $chapterLesser:Int $chapterGreater:Int $volumeLesser:Int $volumeGreater:Int $licensedBy:[Int]$isLicensed:Boolean $genres:[String]$excludedGenres:[String]$tags:[String]$excludedTags:[String]$minimumTagRank:Int $sort:[MediaSort]=[POPULARITY_DESC,SCORE_DESC]){Page(page:$page,perPage:20){pageInfo{total perPage currentPage lastPage hasNextPage}media(id:$id type:$type season:$season format_in:$format status:$status countryOfOrigin:$countryOfOrigin source:$source search:$search onList:$onList seasonYear:$seasonYear startDate_like:$year startDate_lesser:$yearLesser startDate_greater:$yearGreater episodes_lesser:$episodeLesser episodes_greater:$episodeGreater duration_lesser:$durationLesser duration_greater:$durationGreater chapters_lesser:$chapterLesser chapters_greater:$chapterGreater volumes_lesser:$volumeLesser volumes_greater:$volumeGreater licensedById_in:$licensedBy isLicensed:$isLicensed genre_in:$genres genre_not_in:$excludedGenres tag_in:$tags tag_not_in:$excludedTags minimumTagRank:$minimumTagRank sort:$sort isAdult:$isAdult){id title{romaji english}coverImage{extraLarge large color}startDate{year month day}endDate{year month day}bannerImage season seasonYear description type format status(version:2)episodes duration chapters volumes genres isAdult averageScore popularity nextAiringEpisode{airingAt timeUntilAiring episode}mediaListEntry{id status}studios(isMain:true){edges{isMain node{id name}}}}}}`,
    }
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
    try {
        staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'anilist_' + helpers.serialize(key) + '.json')))
    } catch(e) {
        staticLists[helpers.serialize(key)] = []
    }
})

const nextSeason = () => {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()
    const thisSeason = getSeason()
    const nxtSeason = { seasonYear: year }
    if (thisSeason.season === 'FALL') {
        nxtSeason.seasonYear = year +1
        nxtSeason.season = 'WINTER'
    } else if (thisSeason.season === 'WINTER')
        nxtSeason.season = 'SPRING'
    else if (thisSeason.season === 'SPRING')
        nxtSeason.season = 'SUMMER'
    else if (thisSeason.season === 'SUMMER')
        nxtSeason.season = 'FALL'
    return nxtSeason
}

const getSeason = () => {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()
    const thisSeason = { seasonYear: year }
    return { seasonYear: year, season: getCurrentSeason() }
}

function getCurrentSeason() {
  const now = new Date()
  const month = now.getMonth() +1

  if (month > 3 && month < 6) return 'SPRING'
  if (month > 6 && month < 9) return 'SUMMER'
  if (month > 9 && month < 12) return 'FALL'
  if (month >= 1 && month < 3) return 'WINTER'

  const day = now.getDate()

  if (month === 3) return day < 22 ? 'WINTER' : 'SPRING'
  if (month === 6) return day < 22 ? 'SPRING' : 'SUMMER'
  if (month === 9) return day < 22 ? 'SUMMER' : 'FALL'
  if (month === 12) return day < 22 ? 'FALL' : 'WINTER'

}

const extraVariables = {
    'Trending Now': { sort: ['TRENDING_DESC', 'POPULARITY_DESC'] },
    'Popular This Season': getSeason(),
    'Upcoming Next Season': nextSeason(),
    'All Time Popular': { sort: 'POPULARITY_DESC' },
    'Top Anime': { sort: 'SCORE_DESC' },
}

module.exports = {
    name: 'AniList',
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

function API() {
    return axios.create({
        baseURL: 'https://graphql.anilist.co',
    })
}

const populateQueue = async.queue((task, cb) => {
    let tempList = []

    const finishedList = () => {
        staticLists[task.key] = tempList
        fs.writeFileSync(path.join(__dirname, '..', 'db', 'anilist_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
        setTimeout(() => { cb() }, addonConfig.anilistCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('anilist', '---> Finished all lists for anilist')
    }

    const getPage = async (listName, query, page = 1) => {

        helpers.log('anilist', 'Getting page ' + page + ' for "' + listName + '"')

        const variables = {
          page,
          perPage: 50,
          type: 'ANIME'
        }

        if (extraVariables[listName])
            Object.keys(extraVariables[listName]).forEach(key => {
                variables[key] = extraVariables[listName][key]
            })
       
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        }

        const result = await API().post('/', {
            query,
            variables,
            headers,
            timeout: 20000,
        }).catch((err) => console.log(err.message))

        let lastAnilistId = 0

        if ((((((result || {}).data || {}).data || {}).Page || {}).media || []).length) {
            result.data.data.Page.media.forEach(el => {
                lastAnilistId = el.id
                mapping.mapper({ query: (el.title || {}).romaji || (el.title || {}).english, opts: { anilist: el.id } }, (kitsuId, kitsuMeta, anilistId) => {
                    if (kitsuId && kitsuMeta) {
                        tempList.push(kitsuMeta);
                    }
                    if (anilistId === lastAnilistId) {
                        // finished page
                        helpers.log('anilist', '---')
                        helpers.log('anilist', 'finished page')
                        if (page < config.maxSkip) {
                            setTimeout(() => {
                                getPage(listName, query, page + config.skipSize)
                            }, addonConfig.anilistCooldown)
                        } else {
                            // finished list
                            helpers.log('anilist', '---')
                            helpers.log('anilist', '---')
                            helpers.log('anilist', 'finished list by reaching max skip allowed: ' + config.maxSkip)
                            finishedList()
                        }
                    }
                })
            })
        } else {
            // presume ended list
            helpers.log('anilist', '---')
            helpers.log('anilist', '---')
            helpers.log('anilist', 'finished list due to API returning an empty result')
            finishedList()
        }

    }

    getPage(task.listName, config.lists[task.listName])
}, 1)

const populate = () => {
    extraVariables['Popular This Season'] = getSeason()
    extraVariables['Upcoming Next Season'] = nextSeason()
    Object.keys(config.lists).forEach(key => {
        populateQueue.push({ key: helpers.serialize(key), listName: key })
    })
    setTimeout(() => {
        populate()
    }, addonConfig.listUpdateInterval)
}

populate()
