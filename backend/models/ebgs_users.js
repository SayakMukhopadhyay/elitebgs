/*
 * KodeBlox Copyright 2021 Sayak Mukhopadhyay
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
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate')

let ObjectId = mongoose.Schema.Types.ObjectId

let user = new mongoose.Schema({
  id: String,
  username: String,
  avatar: String,
  discriminator: String,
  access: { type: String, enum: ['NORMAL', 'BANNED', 'ADMIN'], uppercase: true },
  theme: String,
  factions: [
    {
      _id: false,
      id: { type: ObjectId, index: true },
      name: String,
      name_lower: String
    }
  ],
  systems: [
    {
      _id: false,
      id: { type: ObjectId, index: true },
      name: String,
      name_lower: String
    }
  ],
  stations: [
    {
      _id: false,
      id: { type: ObjectId, index: true },
      name: String,
      name_lower: String
    }
  ]
})

user.plugin(mongoosePaginate)

module.exports = mongoose.model('ebgsUsers', user)
