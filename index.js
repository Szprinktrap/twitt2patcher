const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const spawnAsync = require('@expo/spawn-async')
const rimraf = require('rimraf')
const config = require('./config.json')
const app = express()

app.use(express.static('./html'))
app.use(express.urlencoded())
app.set('trust proxy', true)

function getTime() { // yes, i overengineerd this just for the sake of logging..........
    const dateobj = new Date()
    let h = dateobj.getHours()
    let m = dateobj.getMinutes()
    let s = dateobj.getSeconds()

    if (h < 10) {
        h = `0${h}`
    }
    if (m < 10) {
        m = `0${m}`
    }
    if (s < 10) {
        s = `0${s}`
    }

	return `${h}:${m}:${s}`
}

function log(text, error) {
    if (error) {
        console.error(`[${getTime()}] ${text}`)
    } else {
        console.log(`[${getTime()}] ${text}`)
    }
}

app.post('/patch', async (req, res) => {
    if (req.body.apiUrl == "" || req.body.searchUrl == "" || req.body.twitpicApiUrl == "" || req.body.twitpicUrl == "" || req.body.packageName == "" || req.body.launcherName == "")  return res.send('bruh do you want your apk patched or not')
    
    const jobID = new Date().getTime() // unix timestamps best ids
    log(`new job (${jobID}) from ${req.ip}: apiUrl=${req.body.apiUrl};searchUrl=${req.body.searchUrl};twitpicApiUrl=${req.body.twitpicApiUrl};twitpicUrl=${req.body.twitpicUrl};launcherName=${req.body.launcherName};packageName=${req.body.packageName}`)
    
    await fs.cpSync('./unpackedTwitterAPK', `./jobs/${jobID}`, {recursive: true})
    await fs.cpSync(config.tools.apkRenamerDir, `./jobs/${jobID}/ApkRenamer`, {recursive: true}) // since apkrenamer uses a single temp directory for all apks, we probably should copy it to the job folder so that we don't run into issues in the long term
    log(`copied unpacked twitter apk and apkrenamer for job ${jobID}. processing smali...`)
    
    let smaliFolder = fs.readdirSync(`./jobs/${jobID}/smali`, {recursive: true})
    for (const element of smaliFolder) {
        if (!fs.lstatSync(`./jobs/${jobID}/smali/${element}`).isDirectory()) {
            let content = fs.readFileSync(`./jobs/${jobID}/smali/${element}`)
            if (content.toString().includes('http://api.twitter.com')) {
                content = content.toString().replace(/http:\/\/api.twitter.com/g, req.body.apiUrl)
                log(`[job ${jobID}] ${element}: http://api.twitter.com --> ${req.body.apiUrl}`)
            }
            if (content.toString().includes('https://api.twitter.com')) { // since twitter couldn't decide if they want http or https
                content = content.toString().replace(/https:\/\/api.twitter.com/g, req.body.apiUrl)
                log(`[job ${jobID}] ${element}: https://api.twitter.com --> ${req.body.apiUrl}`)
            }
            if (content.toString().includes('http://search.twitter.com')) {
                content = content.toString().replace(/http:\/\/search.twitter.com/g, req.body.searchUrl)
                log(`[job ${jobID}] ${element}: http://search.twitter.com --> ${req.body.searchUrl}`)
            }
            if (content.toString().includes('http://api.twitpic.com')) {
                content = content.toString().replace(/http:\/\/api.twitpic.com/g, req.body.twitpicApiUrl)
                log(`[job ${jobID}] ${element}: http://api.twitpic.com --> ${req.body.twitpicApiUrl}`)
            }
            if (content.toString().includes('http://twitpic.com')) {
                content = content.toString().replace(/http:\/\/twitpic.com/g, req.body.twitpicUrl)
                log(`[job ${jobID}] ${element}: http://twitpic.com --> ${req.body.twitpicUrl}`)
            }
            fs.writeFileSync(`./jobs/${jobID}/smali/${element}`, content)
        }
    }
    log(`[job ${jobID}] smali processing finished, building apk with apktool...`)

    let apktool$ = spawnAsync(config.tools.jreBinary, [`-jar`, path.resolve(`./jobs/${jobID}/ApkRenamer/bin/apktool.jar`), 'b', path.resolve(`./jobs/${jobID}/`), `-o${path.resolve(`./jobs/${jobID}/`)}/dist/app_unsigned.apk`])
    let apktoolcp = apktool$.child
    apktoolcp.stdout.on('data', (data) => {
        log(`[job ${jobID}] apktool stdout: ${data}`)
    })
    apktoolcp.stderr.on('data', (data) => {
        log(`[job ${jobID}] apktool stderr: ${data}`, true)
    })
    try {
        let apktoolresult = await apktool$
        log(`[job ${jobID}] apktool pid ${apktoolresult.pid} finished with code ${apktoolresult.status}`)
    } catch (err) {
        log(`[job ${jobID}] an exception occurred! ${err}`, true)
        return res.send('uh oh, we messed up. please contact the owner!')
    }

    if (fs.existsSync(`./jobs/${jobID}/dist/app_unsigned.apk`)) {
        if (req.body.launcherName == "Twitter" && req.body.packageName == "com.twitter.android") {
            log(`[job ${jobID}] apk built successfully! rename not needed. signing apk with signapk...`)
            let signapk$ = spawnAsync(config.tools.jreBinary, ['-jar', path.resolve(`./jobs/${jobID}/ApkRenamer/bin/signapk.jar`), path.resolve(`./jobs/${jobID}/ApkRenamer/keys/testkey.x509.pem`), path.resolve(`./jobs/${jobID}/ApkRenamer/keys/testkey.pk8`), path.resolve(`./jobs/${jobID}/dist/app_unsigned.apk`), `${path.resolve(`./jobs/${jobID}/dist/`)}/${req.body.packageName}.apk`])
            let signapkcp = signapk$.child
            signapkcp.stdout.on('data', (data) => {
                log(`[job ${jobID}] signapk stdout: ${data}`)
            })
            signapkcp.stderr.on('data', (data) => {
                log(`[job ${jobID}] signapk stderr: ${data}`, true)
            })
            try {
                let signapkresult = await signapk$
                log(`[job ${jobID}] signapk pid ${signapkresult.pid} finished with code ${signapkresult.status}`)
            } catch (err) {
                log(`[job ${jobID}] an exception occurred! ${err}`, true)
                return res.send('uh oh, we messed up. please contact the owner!')
            }
            if (fs.existsSync(`./jobs/${jobID}/dist/${req.body.packageName}.apk`)) {
                log(`[job ${jobID}] signed ok! sending file to client...`)
                res.download(`./jobs/${jobID}/dist/${req.body.packageName}.apk`, (err) => {
                    if (err) {
                        log(`[job ${jobID}] error when sending! ${err}`, true)
                    } else {
                        log(`[job ${jobID}] sent ok! i would call this job done!`)
                        rimraf.rimrafSync(`./jobs/${jobID}/`)
                    }
                })
            }
        } else {
            log(`[job ${jobID}] apk built successfully! renaming with apkrenamer...`)
            let apkrenamer$ = spawnAsync(config.tools.jreBinary, [`-jar`, path.resolve(`./jobs/${jobID}/ApkRenamer/renamer.jar`), '-a', path.resolve(`./jobs/${jobID}/dist/app_unsigned.apk`), `-o`, `${path.resolve(`./jobs/${jobID}/dist`)}/app_renamed.apk`, `-n`, req.body.launcherName, `-p`, req.body.packageName,`-d`], { cwd: path.resolve(config.tools.apkRenamerDir) })
            let apkrenamercp = apkrenamer$.child
            apkrenamercp.stdout.on('data', (data) => {
                log(`[job ${jobID}] apkrenamer stdout: ${data}`)
            })
            apkrenamercp.stderr.on('data', (data) => {
                log(`[job ${jobID}] apkrenamer stderr: ${data}`, true)
            })
            try {
                let apkrenamerresult = await apkrenamer$
                log(`[job ${jobID}] apkrenamer pid ${apkrenamerresult.pid} finished with code ${apkrenamerresult.status}`)
            } catch (err) {
                log(`[job ${jobID}] an exception occurred! ${err}`, true)
                return res.send('uh oh, we messed up. please contact the owner!')
            }
            if (fs.existsSync(`./jobs/${jobID}/dist/app_renamed.apk`)) {
                log(`[job ${jobID}] signing apk with signapk...`)
                let signapk$ = spawnAsync(config.tools.jreBinary, ['-jar', path.resolve(`./jobs/${jobID}/ApkRenamer/bin/signapk.jar`), path.resolve(`./jobs/${jobID}/ApkRenamer/keys/testkey.x509.pem`), path.resolve(`./jobs/${jobID}/ApkRenamer/keys/testkey.pk8`), path.resolve(`./jobs/${jobID}/dist/app_renamed.apk`), `${path.resolve(`./jobs/${jobID}/dist/`)}/${req.body.packageName}.apk`])
                let signapkcp = signapk$.child
                signapkcp.stdout.on('data', (data) => {
                    log(`[job ${jobID}] signapk stdout: ${data}`)
                })
                signapkcp.stderr.on('data', (data) => {
                    log(`[job ${jobID}] signapk stderr: ${data}`, true)
                })
                try {
                    let signapkresult = await signapk$
                    log(`[job ${jobID}] signapk pid ${signapkresult.pid} finished with code ${signapkresult.status}`)
                } catch (err) {
                    log(`[job ${jobID}] an exception occurred! ${err}`, true)
                    return res.send('uh oh, we messed up. please contact the owner!')
                }
                if (fs.existsSync(`./jobs/${jobID}/dist/${req.body.packageName}.apk`)) {
                    log(`[job ${jobID}] signed ok! sending file to client...`)
                    res.download(`./jobs/${jobID}/dist/${req.body.packageName}.apk`, (err) => {
                        if (err) {
                            log(`[job ${jobID}] error when sending! ${err}`, true)
                        } else {
                            log(`[job ${jobID}] sent ok! i would call this job done!`)
                            rimraf.rimrafSync(`./jobs/${jobID}/`)
                        }
                    })
                } else {
                    log(`[job ${jobID}] apk file does not exist, erroring out!!`, true)
                    return res.send('uh oh, we messed up. please contact the owner!')
                }
            } else {
                log(`[job ${jobID}] apk file does not exist, erroring out!!`, true)
                return res.send('uh oh, we messed up. please contact the owner!')
            }
        }
    } else {
        log(`[job ${jobID}] apk file does not exist, erroring out!!`, true)
        return res.send('uh oh, we messed up. please contact the owner!')
    }
})

app.listen(config.app.port, () => {
  log(`listening on port ${config.app.port}!`)
})