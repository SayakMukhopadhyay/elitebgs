/*
 * KodeBlox Copyright 2020 Sayak Mukhopadhyay
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http: //www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

const express = require('express')
const path = require('path')
const logger = require('morgan')
const bodyParser = require('body-parser')
const secrets = require('./secrets')

const bugsnagClient = require('./server/bugsnag').bugsnagClient

const app = express()

let bugsnagClientMiddleware = {}

if (secrets.bugsnag_use) {
  bugsnagClientMiddleware = bugsnagClient.getPlugin('express')
  app.use(bugsnagClientMiddleware.requestHandler)
}

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, 'dist')))

app.all('*', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// error handlers
if (secrets.bugsnag_use) {
  app.use(bugsnagClientMiddleware.errorHandler)
}

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(logger('dev'))
  // eslint-disable-next-line no-unused-vars
  app.use(function (err, req, res) {
    res.status(err.status || 500)
    res.send({
      message: err.message,
      error: err
    })
    console.log(err)
  })
}

// production error handler
// no stacktraces leaked to user
if (app.get('env') === 'production') {
  app.use(logger('combined'))
  // eslint-disable-next-line no-unused-vars
  app.use(function (err, req, res) {
    res.status(err.status || 500)
    res.send({
      message: err.message,
      error: {}
    })
  })
}

module.exports = app
