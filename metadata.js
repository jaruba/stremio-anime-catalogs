async function toStremioCatalogMeta(animeData) {
  const meta = await _toStremioMeta(animeData);
  return {
    id: meta.id,
    kitsu_id: meta.kitsu_id,
    type: meta.type,
    animeType: meta.animeType,
    name: meta.name,
    aliases: meta.aliases,
    description: meta.description,
    releaseInfo: meta.releaseInfo,
    runtime: meta.runtime,
    imdbRating: meta.imdbRating,
    genres: meta.genres,
//    logo: meta.logo,
    poster: meta.poster,
    background: meta.background,
    trailers: meta.trailers,
    links: meta.links
  }
}

async function _toStremioMeta(animeData) {
  const type = getType(animeData);

  let releaseInfo = animeData.startDate && `${animeData.startDate.match(/^\d+/)[0]}`;
  if (animeData.endDate && !animeData.endDate.startsWith(releaseInfo)) {
    releaseInfo = releaseInfo && releaseInfo.concat(`-${animeData.endDate.match(/^\d+/)[0]}`);
  } else if (animeData.status === 'current') {
    releaseInfo = releaseInfo && releaseInfo.concat('-');
  }

  const genres = animeData.genres.data?.map(genre => genre.name);

  let videos;
  if (animeData.subtype !== 'movie' || animeData.episodeCount > 1) {
    const seriesStartTime = new Date(animeData.startDate).getTime();
    if (animeData.episodes.data?.length) {
      let lastReleaseDate = new Date(seriesStartTime)
      videos = animeData.episodes.data
          .map((ep, index, self) => ({
            id: `kitsu:${animeData.id}:${ep.number}`,
            title: ep.titles.en_us ||
                ep.titles.en ||
                ep.titles.en_jp ||
                ep.canonicalTitle ||
                `Episode ${ep.number}`,
            released: episodeReleased(ep, self[index + 1], lastReleaseDate),
            season: 1,
            episode: ep.number,
            thumbnail: ep.thumbnail?.original,
            overview: cleanDescription(ep.synopsis),
          }))
          .sort((a, b) => a.episode - b.episode);
    } else if (animeData.episodeCount) {
      videos = [...Array(animeData.episodeCount).keys()]
          .map((ep) => ep + 1)
          .map((ep) => ({
            id: `kitsu:${animeData.id}:${ep}`,
            title: `Episode ${ep}`,
            released: new Date(seriesStartTime),
            season: 1,
            episode: ep,
          }))
    }
    if (videos && videos.length === 1 && ['movie', 'special', 'OVA', 'ONA'].includes(animeData.subtype)) {
      videos[0].id = `kitsu:${animeData.id}`;
    }
  }

  const titles = [animeData.titles.en_us, animeData.titles.en, animeData.titles.en_jp]
      .concat(animeData.abbreviatedTitles || [])
      .filter((v) => v)
      .reduce((array, next) => {
        if (!array.find((v) => v.toLowerCase() === next.toLowerCase())) {
          array.push(next);
        }
        return array;
      }, []);

  return cleanOutputObject({
    id: `kitsu:${animeData.id}`,
    kitsu_id: animeData.id,
    type: type,
    animeType: animeData.subtype,
    name: animeData.canonicalTitle,
    slug: animeData.slug,
    aliases: titles,
    genres: genres || [],
//    logo: fanartImages.logo,
    poster: animeData?.posterImage?.medium,
    background: animeData.coverImage && animeData.coverImage.original,
    description: cleanDescription(animeData.synopsis),
    releaseInfo: releaseInfo,
    year: releaseInfo,
    imdbRating: roundedRating(animeData.averageRating)?.toString(),
    userCount: animeData.userCount,
    status: animeData.status,
    runtime: Number.isInteger(animeData.episodeLength) && `${animeData.episodeLength} min` || null,
    trailers: animeData.youtubeVideoId && [{ source: animeData.youtubeVideoId, type: 'Trailer' }] || [],
    videos: videos,
    links: kitsuLinks(animeData, type)
  });
}

function getType(animeData) {
  if (animeData.subtype === 'movie') {
    return 'movie';
  }
  return 'series'
}

function roundedRating(rating) {
  return rating && (Math.round(((rating / 10.0) + Number.EPSILON) * 10.0) / 10.0).toFixed(1);
}

function kitsuLinks(animeData, type) {
  const imdbRating = roundedRating(animeData.averageRating)
  const rating = imdbRating && [{
    name: `${imdbRating}`,
    category: 'imdb',
    url: `https://kitsu.io/anime/${animeData.slug}`
  }] || [];
  return rating;
}

function episodeReleased(ep, nextEp, lastReleaseDate) {
  const airDate = ep.airdate && new Date(ep.airdate);
  const nextAirDate = nextEp && nextEp.airdate && new Date(nextEp.airdate) || airDate;
  const released = airDate && airDate.getTime() > lastReleaseDate.getTime() && airDate.getTime() <= nextAirDate.getTime()
      ? airDate
      : new Date(lastReleaseDate.getTime());
  lastReleaseDate.setTime(released.getTime());
  return released;
}

function capitalize(input) {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function cleanDescription(description) {
  return description?.replace(/\n+(?:[([].+[)\]\n]|Source:.*)?(?:\n+Note(.|\n)+)?$/, '');
}

function cleanOutputObject(object) {
    return Object.fromEntries(Object.entries(object).filter(([_, v]) => v != null));
}

module.exports = { toStremioCatalogMeta };
