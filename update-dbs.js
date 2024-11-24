const fs = require('fs')
const needle = require('needle')

let files = []

function getOne() {
  if (files.length) {
    const file = files.pop()
    const url = `https://1fe84bc728af-stremio-anime-catalogs.baby-beamup.club/${file}`
    console.log(url)
    needle.get(url, { follow_max: 3 }, (err, resp, body) => {
      if (!err || !body) {
        fs.writeFileSync(`./db/${file}`, typeof body === 'string' ? body : JSON.stringify(body))
      } else {
        console.log('ERROR')
        console.log(err)
      }
      getOne()
    })
  }
}

fs.readdir('./db', (err, fls) => {
  files = fls
  getOne()
})
