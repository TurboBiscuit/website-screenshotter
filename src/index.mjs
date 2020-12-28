import {Builder} from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js'
import Fastify from 'fastify';
import Queue from 'fastq';
import crypto from 'crypto'


const queue = new Queue(async ({url,size},done)=>{
    var driver = new Builder().forBrowser('firefox').usingServer(process.env.SELENIUM_REMOTE_URL).setFirefoxOptions(new firefox.Options().headless().windowSize(size)).build();
    try {
        await driver.get(url)
    } catch (error) {
        console.log(error,'navigate_url_fail')
        done(Error('navigate_url_fail'))
        return
    }
    var screenshot;
    try {
        screenshot = await driver.takeScreenshot()
    } catch (error) {
        console.log(error,'screenshot_fail')
        done(Error('screenshot_fail'))
        return
    }
    driver.quit();
    done(null,Buffer.from(screenshot,'base64'))
},2)

const fastify = Fastify({
    ignoreTrailingSlash:true
})

fastify.register(import('fastify-redis'),{
    url:process.env.REDIS_URI||'redis://localhost'
})

fastify.route({
    url:'/screenshot',
    method:'GET',
    schema:{
        querystring:{
            type:'object',
            properties:{
                url:{
                    type:'string',
                    format:'url'
                },
                width:{
                    type:'number',
                    min:800,
                    max:1920
                },
                height:{
                    type:'number',
                    min:600,
                    max:1080
                }
            },
            required:['url']
        }
    },
    handler:async(req,res)=>{
        var url = req.query.url
        var size = {
            width:req.query.width||1280,
            height:req.query.height||720
        }
        var hash = crypto.createHash('md5').update(`${Buffer.from(url).toString('base64')}:${Buffer.from(JSON.stringify(size)).toString('base64')}`).digest('base64')
        var exists = await fastify.redis.get(`SCREENSHOTTER:${hash}:IMAGE`)
        if(exists) {
            res.type('image/png').send(Buffer.from(exists,'base64'))
        } else {
            queue.push({
                url,
                size
            },async (err,image)=>{
                if(err) {
                    res.code(500)
                    switch(err.message) {
                        case 'screenshot_fail':
                            res.send({message:'Failed to screenshot url, please try again later!'})
                            break;
                        case 'navigate_url_fail':
                            res.send({message:'Failed to navigate to url, please try again later!'})
                            break;
                        default:
                            res.send({message:'An unknown error has occured!'})
                    }
                    return
                }
                await fastify.redis.set(`SCREENSHOTTER:${hash}:IMAGE`,image.toString('base64'),'EX',6*60*60)
                res.type('image/png').send(image)
            })
        }
    }
})

fastify.listen(process.env.PORT||3000,process.env.ADDRESS||'127.0.0.1').then(console.log)